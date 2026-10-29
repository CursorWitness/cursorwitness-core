import type { ObservationPersistence } from "./contracts.js";
import type { ObservationEntry } from "./observations.js";

export type OracleStatus = "pass" | "fail" | "unverified";

export interface ExpectedScenario {
  readonly scenarioId: string;
  readonly expectedEventIds: readonly string[];
  readonly expectedHandlerEventIds?: readonly string[];
  readonly expectedEffectAttemptKeys?: readonly string[];
  readonly expectedEffectKeys?: readonly string[];
  /** Require evidence that a checkpoint was persisted beyond an in-memory test double. */
  readonly requireDurableCheckpoint?: boolean;
}

export interface InvariantViolation {
  readonly id: string;
  readonly status: OracleStatus;
  readonly message: string;
  readonly evidenceRefs: readonly string[];
}

export interface OracleCounts {
  readonly expectedEventCount: number;
  readonly observedEventCount: number;
  readonly deliveryCount: number;
  readonly handlerInvocationCount: number;
  readonly effectAttemptCount: number;
  readonly committedEffectCount: number;
  readonly uniqueCommittedEffectCount: number;
}

export interface OracleResult {
  readonly scenarioId: string;
  readonly status: OracleStatus;
  readonly assertions: readonly InvariantViolation[];
  readonly counts: OracleCounts;
}

/**
 * Evaluates consumer evidence against scenario-declared expectations.
 * It intentionally never reads a consumer checkpoint to define expected truth.
 */
export function evaluateOracle(
  expected: ExpectedScenario,
  entries: readonly ObservationEntry[],
): OracleResult {
  assertScenario(expected);

  const deliveries = entries.filter((entry) => entry.kind === "delivery");
  const handlers = entries.filter((entry) => entry.kind === "handler");
  const effectAttempts = entries.filter((entry) => entry.kind === "effect-attempt");
  const effectCommits = entries.filter((entry) => entry.kind === "effect-commit");
  const checkpoints = entries.filter((entry) => entry.kind === "checkpoint");
  const expectedEvents = new Set(expected.expectedEventIds);
  const expectedHandlers = new Set(expected.expectedHandlerEventIds ?? expected.expectedEventIds);
  const expectedEffectAttempts = new Set(expected.expectedEffectAttemptKeys ?? expected.expectedEffectKeys ?? []);
  const expectedEffects = new Set(expected.expectedEffectKeys ?? []);
  const deliveredEvents = new Set(deliveries.map((entry) => entry.observation.eventId));
  const handledEvents = new Set(handlers.map((entry) => entry.observation.eventId));
  const attemptedEffects = new Set(effectAttempts.map((entry) => entry.observation.effectKey));
  const committedEffects = effectCommits.map((entry) => entry.observation.effectKey);
  const uniqueCommittedEffects = new Set(committedEffects);
  const assertions: InvariantViolation[] = [];

  for (const eventId of expectedEvents) {
    if (!deliveredEvents.has(eventId)) {
      assertions.push({
        id: "expected-event-delivered",
        status: "fail",
        message: `Expected event ${eventId} was not observed in delivery evidence.`,
        evidenceRefs: ["scenario.expectedEventIds", "trace.delivery"],
      });
    }
  }

  for (const eventId of deliveredEvents) {
    if (!expectedEvents.has(eventId)) {
      assertions.push({
        id: "unexpected-event-delivered",
        status: "fail",
        message: `Unexpected event ${eventId} appeared in delivery evidence.`,
        evidenceRefs: ["scenario.expectedEventIds", "trace.delivery"],
      });
    }
  }

  for (const eventId of expectedHandlers) {
    if (!handledEvents.has(eventId)) {
      assertions.push({
        id: "expected-event-handled",
        status: "fail",
        message: `Expected event ${eventId} has no handler-invocation observation.`,
        evidenceRefs: ["scenario.expectedHandlerEventIds", "trace.handler"],
      });
    }
  }

  for (const effectKey of expectedEffectAttempts) {
    if (!attemptedEffects.has(effectKey)) {
      assertions.push({
        id: "expected-effect-attempted",
        status: "fail",
        message: `Expected effect ${effectKey} has no effect-attempt observation.`,
        evidenceRefs: ["scenario.expectedEffectAttemptKeys", "trace.effect-attempt"],
      });
    }
  }

  for (const effectKey of expectedEffects) {
    const matchingCommits = committedEffects.filter((value) => value === effectKey).length;
    if (matchingCommits === 0) {
      assertions.push({
        id: "expected-effect-committed",
        status: "fail",
        message: `Expected durable effect ${effectKey} has no committed-effect observation.`,
        evidenceRefs: ["scenario.expectedEffectKeys", "trace.effect-commit"],
      });
    } else if (matchingCommits > 1) {
      assertions.push({
        id: "unique-effect-committed-once",
        status: "fail",
        message: `Effect ${effectKey} was committed ${matchingCommits} times; duplicate durable effects are observable.`,
        evidenceRefs: ["scenario.expectedEffectKeys", "trace.effect-commit"],
      });
    }
  }

  for (const effectKey of uniqueCommittedEffects) {
    if (!expectedEffects.has(effectKey)) {
      assertions.push({
        id: "unexpected-effect-committed",
        status: "fail",
        message: `Unexpected effect ${effectKey} has a committed-effect observation.`,
        evidenceRefs: ["scenario.expectedEffectKeys", "trace.effect-commit"],
      });
    }
  }

  const duplicateDeliveries = deliveries.length - deliveredEvents.size;
  assertions.push({
    id: "duplicate-delivery-is-not-business-effect-failure",
    status: "pass",
    message: duplicateDeliveries > 0
      ? `Observed ${duplicateDeliveries} duplicate delivery record(s); this is not classified as a durable-effect failure.`
      : "No duplicate delivery records were observed.",
    evidenceRefs: ["trace.delivery"],
  });

  if (expected.requireDurableCheckpoint) {
    const saved = checkpoints.filter((entry) => entry.observation.operation === "save" && entry.observation.outcome === "saved");
    if (saved.length === 0) {
      assertions.push({
        id: "checkpoint-persisted",
        status: "unverified",
        message: "No successful checkpoint save was observed; recovery cannot be verified.",
        evidenceRefs: ["trace.checkpoint"],
      });
    } else if (saved.some((entry) => entry.observation.persistence === "test-double")) {
      assertions.push({
        id: "checkpoint-persisted",
        status: "unverified",
        message: "Checkpoint save was observed only through an in-memory test double; durable recovery is unverified.",
        evidenceRefs: ["trace.checkpoint", "checkpoint.persistence"],
      });
    } else {
      assertions.push({
        id: "checkpoint-persisted",
        status: "pass",
        message: "A successful checkpoint save was observed with non-test-double persistence evidence.",
        evidenceRefs: ["trace.checkpoint", "checkpoint.persistence"],
      });
    }
  }

  const status = assertions.some((assertion) => assertion.status === "fail")
    ? "fail"
    : assertions.some((assertion) => assertion.status === "unverified")
      ? "unverified"
      : "pass";

  return {
    scenarioId: expected.scenarioId,
    status,
    assertions,
    counts: {
      expectedEventCount: expectedEvents.size,
      observedEventCount: deliveredEvents.size,
      deliveryCount: deliveries.length,
      handlerInvocationCount: handlers.length,
      effectAttemptCount: effectAttempts.length,
      committedEffectCount: effectCommits.length,
      uniqueCommittedEffectCount: uniqueCommittedEffects.size,
    },
  };
}

function assertScenario(expected: ExpectedScenario): void {
  if (!expected.scenarioId.trim()) throw new TypeError("scenarioId must be non-empty");
  if (new Set(expected.expectedEventIds).size !== expected.expectedEventIds.length) {
    throw new TypeError("expectedEventIds must be unique");
  }
  for (const [name, values] of [
    ["expectedHandlerEventIds", expected.expectedHandlerEventIds ?? []],
    ["expectedEffectAttemptKeys", expected.expectedEffectAttemptKeys ?? []],
  ] as const) {
    if (new Set(values).size !== values.length) throw new TypeError(`${name} must be unique`);
  }
  if (new Set(expected.expectedEffectKeys ?? []).size !== (expected.expectedEffectKeys ?? []).length) {
    throw new TypeError("expectedEffectKeys must be unique");
  }
}

export function persistenceIsDurable(persistence: ObservationPersistence): boolean {
  return persistence !== "test-double";
}
