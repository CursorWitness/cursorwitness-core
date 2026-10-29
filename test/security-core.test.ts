import assert from "node:assert/strict";
import test from "node:test";
import { validateFixture } from "../src/fixture.ts";
import { FixtureGetEventsPort } from "../src/fake-rpc.ts";
import { InMemoryObservationRecorder } from "../src/observations.ts";
import { evaluateOracle } from "../src/oracle.ts";
import { reportFromOracle } from "../src/report.ts";
import { runPaginationScenario } from "../src/scenario.ts";
import { asOpaqueCursor } from "../src/contracts.ts";

const validPage = { requestKey: "initial", response: { events: [], oldestLedger: 1, latestLedger: 1 } };

test("fixture validation rejects oversized page collections and fields", () => {
  assert.throws(() => validateFixture({
    schemaVersion: "fixture.v1", id: "oversized-pages", rpcMethod: "getEvents", provenance: "synthetic",
    pages: Array.from({ length: 1_025 }, (_, index) => ({ ...validPage, requestKey: `page-${index}` })),
  }), /page count exceeds/);
  assert.throws(() => validateFixture({
    schemaVersion: "fixture.v1", id: "oversized-cursor", rpcMethod: "getEvents", provenance: "synthetic",
    pages: [{ requestKey: "initial", response: { ...validPage.response, cursor: asOpaqueCursor("x".repeat(4_097)) } }],
  }), /cursor exceeds/);
});

test("semantic reports omit raw event values", async () => {
  const secret = "do-not-emit-this-value";
  const report = await runPaginationScenario({
    expected: { scenarioId: "redaction-boundary", expectedEventIds: ["event-secret"] },
    rpc: new FixtureGetEventsPort({
      schemaVersion: "fixture.v1", id: "redaction-fixture", rpcMethod: "getEvents", provenance: "synthetic",
      pages: [{ requestKey: "initial", response: { events: [{ id: "event-secret", type: "contract", ledger: 1, topic: ["topic"], value: secret }], oldestLedger: 1, latestLedger: 1 } }],
    }),
    consumer: { continueAfterPage: () => false, handleEvent: () => undefined },
    recorder: new InMemoryObservationRecorder(), evaluate: evaluateOracle, buildReport: reportFromOracle,
  });
  assert.equal(JSON.stringify(report.report).includes(secret), false);
});
