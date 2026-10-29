import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOracle } from "../src/oracle.ts";
import { reportFromOracle } from "../src/report.ts";
import { InMemoryObservationRecorder } from "../src/observations.ts";

test("maps oracle results and lifecycle observations into report.v1", () => {
  const recorder = new InMemoryObservationRecorder();
  recorder.delivery({ eventId: "event-1", attempt: 1 });
  recorder.handler({ eventId: "event-1", attempt: 1 });
  recorder.effectAttempt({ effectKey: "effect-1", eventId: "event-1", attempt: 1 });
  recorder.effectCommit({ effectKey: "effect-1", eventId: "event-1", attempt: 1, persistence: "file" });
  recorder.checkpoint({
    operation: "save",
    outcome: "saved",
    evidence: { availability: "observed", value: { kind: "cursor" } },
    persistence: "file",
  });
  const result = evaluateOracle(
    { scenarioId: "report-mapping", expectedEventIds: ["event-1"], expectedEffectKeys: ["effect-1"] },
    recorder.snapshot(),
  );
  const report = reportFromOracle(result, recorder.snapshot());
  assert.equal(report.schemaVersion, "report.v1");
  assert.equal(report.status, "pass");
  assert.deepEqual(report.summary, result.counts);
  assert.deepEqual(report.trace.map((entry) => entry.kind), ["delivery", "handler", "effect-attempt", "effect-commit", "checkpoint"]);
  assert.equal(report.trace[4]?.kind, "checkpoint");
});

test("report mapping preserves unverified oracle status and evidence references", () => {
  const recorder = new InMemoryObservationRecorder();
  recorder.delivery({ eventId: "event-1", attempt: 1 });
  recorder.handler({ eventId: "event-1", attempt: 1 });
  const result = evaluateOracle(
    { scenarioId: "unverified-report", expectedEventIds: ["event-1"], requireDurableCheckpoint: true },
    recorder.snapshot(),
  );
  const report = reportFromOracle(result, recorder.snapshot(), "simulated-offline");
  assert.equal(report.status, "unverified");
  assert.ok(report.assertions.every((assertion) => assertion.evidenceRefs.length > 0));
});
