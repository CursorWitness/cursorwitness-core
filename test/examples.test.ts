import assert from "node:assert/strict";
import test from "node:test";
import { asOpaqueCursor, type WitnessEvent } from "../src/contracts.ts";
import { FixtureGetEventsPort } from "../src/fake-rpc.ts";
import { evaluateOracle } from "../src/oracle.ts";
import { reportFromOracle } from "../src/report.ts";
import {
  createIdempotentEffectConsumer,
  createNonIdempotentEffectConsumer,
  createReferencePaginationConsumer,
  createStopOnEmptyConsumer,
} from "../src/example-consumers.ts";
import { InMemoryObservationRecorder } from "../src/observations.ts";
import { runPaginationScenario } from "../src/scenario.ts";

const event: WitnessEvent = { id: "event-1", type: "contract", ledger: 101, topic: ["topic"], value: "value" };

function duplicateFixture() {
  return {
    schemaVersion: "fixture.v1" as const,
    id: "example-duplicate",
    rpcMethod: "getEvents" as const,
    provenance: "synthetic" as const,
    pages: [
      { requestKey: "initial", response: { events: [event], oldestLedger: 100, latestLedger: 101, cursor: asOpaqueCursor("duplicate") } },
      { requestKey: "duplicate", response: { events: [event], oldestLedger: 100, latestLedger: 101 } },
    ],
  };
}

function paginationFixture() {
  return {
    schemaVersion: "fixture.v1" as const,
    id: "example-pagination",
    rpcMethod: "getEvents" as const,
    provenance: "synthetic" as const,
    pages: [
      { requestKey: "initial", response: { events: [], oldestLedger: 100, latestLedger: 101, cursor: asOpaqueCursor("next") } },
      { requestKey: "next", response: { events: [event], oldestLedger: 100, latestLedger: 101 } },
    ],
  };
}

async function run(consumer: Parameters<typeof runPaginationScenario>[0]["consumer"], fixture: ReturnType<typeof paginationFixture> | ReturnType<typeof duplicateFixture>, scenarioId: string, expectedEffectKeys?: readonly string[]) {
  return runPaginationScenario({
    expected: { scenarioId, expectedEventIds: ["event-1"], ...(expectedEffectKeys === undefined ? {} : { expectedEffectKeys }) },
    rpc: new FixtureGetEventsPort(fixture),
    consumer,
    recorder: new InMemoryObservationRecorder(),
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
  });
}

test("maintained reference and faulty pagination examples remain distinguishable", async () => {
  const correct = await run(createReferencePaginationConsumer(), paginationFixture(), "reference-pagination");
  const broken = await run(createStopOnEmptyConsumer(), paginationFixture(), "stop-on-empty");
  assert.equal(correct.report.status, "pass");
  assert.equal(broken.report.status, "fail");
  assert.equal(broken.report.assertions.find((assertion) => assertion.id === "expected-event-delivered")?.status, "fail");
});

test("maintained effect examples distinguish idempotency from duplicate commits", async () => {
  const idempotent = await run(createIdempotentEffectConsumer(), duplicateFixture(), "idempotent-effect", ["effect:event-1"]);
  const nonIdempotent = await run(createNonIdempotentEffectConsumer(), duplicateFixture(), "non-idempotent-effect", ["effect:event-1"]);
  assert.equal(idempotent.report.status, "pass");
  assert.equal(idempotent.report.summary.committedEffectCount, 1);
  assert.equal(nonIdempotent.report.status, "fail");
  assert.equal(nonIdempotent.report.summary.committedEffectCount, 2);
  assert.equal(nonIdempotent.report.assertions.find((assertion) => assertion.id === "unique-effect-committed-once")?.status, "fail");
});
