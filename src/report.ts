import type { FixtureErrorClass } from "./fixture.js";
import type { ObservationPersistence } from "./contracts.js";
import type { ObservationEntry } from "./observations.js";
import type { OracleResult } from "./oracle.js";
import type { ProviderErrorEvidence } from "./provider-errors.js";

export const REPORT_SCHEMA_VERSION = "report.v1" as const;

export type ReportStatus = "pass" | "fail" | "unverified";
export type ReportEvidenceMode = "simulated-offline" | "provider-observed";
export type ReportAssertionStatus = "pass" | "fail" | "unverified";

export interface ReportAssertion {
  readonly id: string;
  readonly status: ReportAssertionStatus;
  readonly message: string;
  readonly evidenceRefs: readonly string[];
}

export interface ReportSummary {
  readonly expectedEventCount: number;
  readonly observedEventCount: number;
  readonly deliveryCount: number;
  readonly handlerInvocationCount: number;
  readonly effectAttemptCount: number;
  readonly committedEffectCount: number;
  readonly uniqueCommittedEffectCount: number;
}

export type ReportTraceEntry =
  | {
      readonly sequence: number;
      readonly kind: "delivery" | "handler";
      readonly eventId: string;
      readonly attempt: number;
    }
  | {
      readonly sequence: number;
      readonly kind: "effect-attempt";
      readonly effectKey: string;
      readonly eventId: string;
      readonly attempt: number;
    }
  | {
      readonly sequence: number;
      readonly kind: "effect-commit";
      readonly effectKey: string;
      readonly eventId: string;
      readonly attempt: number;
      readonly persistence: ObservationPersistence;
    }
  | {
      readonly sequence: number;
      readonly kind: "checkpoint";
      readonly operation: "load" | "save";
      readonly outcome: "loaded" | "saved" | "missing" | "failed";
      readonly evidence: "observed" | "unavailable";
      readonly persistence: ObservationPersistence;
    }
  | {
      readonly sequence: number;
      readonly kind: "provider-error";
      readonly class: FixtureErrorClass;
      readonly code: string;
      readonly retryable: boolean;
    };

export interface ReportV1 {
  readonly schemaVersion: typeof REPORT_SCHEMA_VERSION;
  readonly scenarioId: string;
  readonly status: ReportStatus;
  readonly evidenceMode: ReportEvidenceMode;
  readonly assertions: readonly ReportAssertion[];
  readonly summary: ReportSummary;
  /** Ordered semantic lifecycle evidence; excludes runtime metadata. */
  readonly trace: readonly ReportTraceEntry[];
}

/** Report v1 is already normalized: no timestamps, paths, process IDs, or host metadata are allowed. */
export function semanticReport(report: ReportV1): ReportV1 {
  return report;
}

/** Maps independent oracle evidence into the stable semantic report shape. */
export function reportFromOracle(
  result: OracleResult,
  entries: readonly ObservationEntry[],
  evidenceMode: ReportEvidenceMode = "simulated-offline",
): ReportV1 {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    scenarioId: result.scenarioId,
    status: result.status,
    evidenceMode,
    assertions: result.assertions.map((assertion) => ({
      id: assertion.id,
      status: assertion.status,
      message: assertion.message,
      evidenceRefs: [...assertion.evidenceRefs],
    })),
    summary: { ...result.counts },
    trace: entries.map(toReportTrace),
  };
}

export function reportFromProviderError(
  scenarioId: string,
  evidence: ProviderErrorEvidence,
  status: ReportStatus,
  assertions: readonly ReportAssertion[],
  evidenceMode: ReportEvidenceMode = "simulated-offline",
): ReportV1 {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    scenarioId,
    status,
    evidenceMode,
    assertions,
    summary: {
      expectedEventCount: 0,
      observedEventCount: 0,
      deliveryCount: 0,
      handlerInvocationCount: 0,
      effectAttemptCount: 0,
      committedEffectCount: 0,
      uniqueCommittedEffectCount: 0,
    },
    trace: [{
      sequence: 0,
      kind: "provider-error",
      class: evidence.class,
      code: evidence.code,
      retryable: evidence.retryable,
    }],
  };
}

function toReportTrace(entry: ObservationEntry): ReportTraceEntry {
  if (entry.kind === "delivery" || entry.kind === "handler") {
    return { sequence: entry.sequence, kind: entry.kind, ...entry.observation };
  }
  if (entry.kind === "effect-attempt") {
    return { sequence: entry.sequence, kind: "effect-attempt", ...entry.observation };
  }
  if (entry.kind === "effect-commit") {
    return { sequence: entry.sequence, kind: "effect-commit", ...entry.observation };
  }
  return {
    sequence: entry.sequence,
    kind: "checkpoint",
    operation: entry.observation.operation,
    outcome: entry.observation.outcome,
    evidence: entry.observation.evidence.availability === "observed" ? "observed" : "unavailable",
    persistence: entry.observation.persistence,
  };
}
