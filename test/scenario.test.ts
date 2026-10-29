import assert from "node:assert/strict";
import test from "node:test";
import { FixtureGetEventsPort } from "../src/fake-rpc.ts";
import { runPaginationScenario, type PaginationConsumer } from "../src/scenario.ts";
import type { GetEventsResponse, WitnessEvent } from "../src/contracts.ts";
import { asOpaqueCursor } from "../src/contracts.ts";
import { InMemoryObservationRecorder } from "../src/observations.ts";
import { evaluateOracle } from "../src/oracle.ts";
import { reportFromOracle } from "../src/report.ts";

const event: WitnessEvent = {
  id: "event-1",
  type: "contract",
  ledger: 101,
  topic: ["topic"],
  value: "value",
};

function fixture() {
  return {
    schemaVersion: "fixture.v1" as const,
    id: "pagination-continuity",
    rpcMethod: "getEvents" as const,
    provenance: "synthetic" as const,
    pages: [
      {
        requestKey: "initial",
        response: { events: [], oldestLedger: 100, latestLedger: 101, cursor: asOpaqueCursor("opaque-next") },
      },
      {
        requestKey: "opaque-next",
        response: { events: [event], oldestLedger: 100, latestLedger: 101 },
      },
    ],
  };
}

const correctConsumer: PaginationConsumer = {
  continueAfterPage(response: GetEventsResponse): boolean {
    return response.cursor !== undefined;
  },
  handleEvent(_event: WitnessEvent): void {},
};

const stopOnEmptyConsumer: PaginationConsumer = {
  continueAfterPage(response: GetEventsResponse): boolean {
    return response.events.length > 0 && response.cursor !== undefined;
  },
  handleEvent(_event: WitnessEvent): void {},
};

test("correct pagination consumer continues after an empty page and reaches terminal evidence", async () => {
  const result = await runPaginationScenario({
    expected: { scenarioId: "correct-pagination", expectedEventIds: ["event-1"] },
    rpc: new FixtureGetEventsPort(fixture()),
    consumer: correctConsumer,
    recorder: new InMemoryObservationRecorder(),
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
  });
  assert.equal(result.terminalPageObserved, true);
  assert.equal(result.pagesObserved, 2);
  assert.equal(result.report.status, "pass");
  assert.equal(result.report.summary.observedEventCount, 1);
  assert.deepEqual(result.report.trace.map((entry) => entry.kind), ["delivery", "handler"]);
});

test("consumer that stops on an empty page fails with missing event and terminal invariants", async () => {
  const result = await runPaginationScenario({
    expected: { scenarioId: "broken-empty-stop", expectedEventIds: ["event-1"] },
    rpc: new FixtureGetEventsPort(fixture()),
    consumer: stopOnEmptyConsumer,
    recorder: new InMemoryObservationRecorder(),
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
  });
  assert.equal(result.terminalPageObserved, false);
  assert.equal(result.pagesObserved, 1);
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.assertions.find((assertion) => assertion.id === "expected-event-delivered")?.status, "fail");
  assert.equal(result.report.assertions.find((assertion) => assertion.id === "pagination-terminal-page-observed")?.status, "fail");
});

test("scenario bounds runaway pagination without treating the bound as terminal evidence", async () => {
  const loopingConsumer: PaginationConsumer = {
    continueAfterPage(): boolean { return true; },
    handleEvent(): void {},
  };
  const result = await runPaginationScenario({
    expected: { scenarioId: "bounded-pagination", expectedEventIds: [] },
    rpc: new FixtureGetEventsPort({
      ...fixture(),
      pages: [
        { requestKey: "initial", response: { events: [], oldestLedger: 100, latestLedger: 101, cursor: asOpaqueCursor("loop") } },
        { requestKey: "loop", response: { events: [], oldestLedger: 100, latestLedger: 101, cursor: asOpaqueCursor("loop") } },
      ],
    }),
    consumer: loopingConsumer,
    recorder: new InMemoryObservationRecorder(),
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
    maxPages: 2,
  });
  assert.equal(result.terminalPageObserved, false);
  assert.equal(result.pagesObserved, 2);
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.assertions.find((assertion) => assertion.id === "pagination-terminal-page-observed")?.status, "fail");
});

test("idempotent effect consumer records duplicate delivery and one committed effect", async () => {
  const committed = new Set<string>();
  const consumer: PaginationConsumer = {
    continueAfterPage(response): boolean { return response.cursor !== undefined; },
    handleEvent(): void {},
    effectKey(event) { return `effect:${event.id}`; },
    applyEffect(event) {
      const firstCommit = !committed.has(`effect:${event.id}`);
      committed.add(`effect:${event.id}`);
      return { effectKey: `effect:${event.id}`, committed: firstCommit, persistence: "file" };
    },
  };
  const result = await runPaginationScenario({
    expected: { scenarioId: "idempotent-duplicate", expectedEventIds: ["event-1"], expectedEffectKeys: ["effect:event-1"] },
    rpc: new FixtureGetEventsPort({
      ...fixture(),
      pages: [
        { requestKey: "initial", response: { events: [event], oldestLedger: 100, latestLedger: 101, cursor: asOpaqueCursor("duplicate") } },
        { requestKey: "duplicate", response: { events: [event], oldestLedger: 100, latestLedger: 101 } },
      ],
    }),
    consumer,
    recorder: new InMemoryObservationRecorder(),
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
  });
  assert.equal(result.report.status, "pass");
  assert.equal(result.report.summary.deliveryCount, 2);
  assert.equal(result.report.summary.handlerInvocationCount, 2);
  assert.equal(result.report.summary.effectAttemptCount, 2);
  assert.equal(result.report.summary.committedEffectCount, 1);
  assert.equal(result.report.summary.uniqueCommittedEffectCount, 1);
});

test("non-idempotent effect consumer exposes duplicate committed business effect", async () => {
  const consumer: PaginationConsumer = {
    continueAfterPage(response): boolean { return response.cursor !== undefined; },
    handleEvent(): void {},
    effectKey(event) { return `effect:${event.id}`; },
    applyEffect(event) {
      return { effectKey: `effect:${event.id}`, committed: true, persistence: "file" };
    },
  };
  const result = await runPaginationScenario({
    expected: { scenarioId: "non-idempotent-duplicate", expectedEventIds: ["event-1"], expectedEffectKeys: ["effect:event-1"] },
    rpc: new FixtureGetEventsPort({
      ...fixture(),
      pages: [
        { requestKey: "initial", response: { events: [event], oldestLedger: 100, latestLedger: 101, cursor: asOpaqueCursor("duplicate") } },
        { requestKey: "duplicate", response: { events: [event], oldestLedger: 100, latestLedger: 101 } },
      ],
    }),
    consumer,
    recorder: new InMemoryObservationRecorder(),
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
  });
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.summary.committedEffectCount, 2);
  assert.equal(result.report.summary.uniqueCommittedEffectCount, 1);
  assert.equal(result.report.assertions.find((assertion) => assertion.id === "unique-effect-committed-once")?.status, "fail");
  assert.equal(result.report.assertions.find((assertion) => assertion.id === "duplicate-delivery-is-not-business-effect-failure")?.status, "pass");
});

test("effect attempt failure is reported without inventing a committed effect", async () => {
  const consumer: PaginationConsumer = {
    continueAfterPage(response): boolean { return response.cursor !== undefined; },
    handleEvent(): void {},
    effectKey(event) { return `effect:${event.id}`; },
    applyEffect(): never {
      throw new Error("simulated effect failure");
    },
  };
  const result = await runPaginationScenario({
    expected: { scenarioId: "effect-attempt-failure", expectedEventIds: ["event-1"], expectedEffectKeys: ["effect:event-1"] },
    rpc: new FixtureGetEventsPort({
      ...fixture(),
      pages: [{ requestKey: "initial", response: { events: [event], oldestLedger: 100, latestLedger: 101 } }],
    }),
    consumer,
    recorder: new InMemoryObservationRecorder(),
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
  });
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.summary.effectAttemptCount, 1);
  assert.equal(result.report.summary.committedEffectCount, 0);
  assert.equal(result.report.assertions.find((assertion) => assertion.id === "effect-attempt-failed")?.status, "fail");
});

test("explicit non-commit outcome remains an attempted but uncommitted effect", async () => {
  const consumer: PaginationConsumer = {
    continueAfterPage(response): boolean { return response.cursor !== undefined; },
    handleEvent(): void {},
    effectKey(event) { return `effect:${event.id}`; },
    applyEffect(event) {
      return { effectKey: `effect:${event.id}`, committed: false, persistence: "file" };
    },
  };
  const result = await runPaginationScenario({
    expected: { scenarioId: "effect-not-committed", expectedEventIds: ["event-1"], expectedEffectKeys: ["effect:event-1"] },
    rpc: new FixtureGetEventsPort({
      ...fixture(),
      pages: [{ requestKey: "initial", response: { events: [event], oldestLedger: 100, latestLedger: 101 } }],
    }),
    consumer,
    recorder: new InMemoryObservationRecorder(),
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
  });
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.summary.effectAttemptCount, 1);
  assert.equal(result.report.summary.committedEffectCount, 0);
  assert.equal(result.report.assertions.find((assertion) => assertion.id === "expected-effect-committed")?.status, "fail");
});
