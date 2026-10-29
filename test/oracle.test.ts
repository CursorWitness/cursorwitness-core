import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOracle } from "../src/oracle.ts";
import { InMemoryObservationRecorder } from "../src/observations.ts";

function baseRecorder() {
  const recorder = new InMemoryObservationRecorder();
  recorder.delivery({ eventId: "event-1", attempt: 1 });
  recorder.handler({ eventId: "event-1", attempt: 1 });
  recorder.effectAttempt({ effectKey: "effect-1", eventId: "event-1", attempt: 1 });
  recorder.effectCommit({ effectKey: "effect-1", eventId: "event-1", attempt: 1, persistence: "file" });
  return recorder;
}

test("independent oracle passes a complete lifecycle without reading checkpoint state", () => {
  const result = evaluateOracle(
    { scenarioId: "complete", expectedEventIds: ["event-1"], expectedEffectKeys: ["effect-1"] },
    baseRecorder().snapshot(),
  );
  assert.equal(result.status, "pass");
  assert.equal(result.counts.uniqueCommittedEffectCount, 1);
  assert.ok(result.assertions.every((assertion) => assertion.evidenceRefs.length > 0));
});

test("missing delivery is an actionable failure", () => {
  const result = evaluateOracle(
    { scenarioId: "missing", expectedEventIds: ["event-1", "event-2"] },
    baseRecorder().snapshot(),
  );
  assert.equal(result.status, "fail");
  assert.equal(result.assertions.find((assertion) => assertion.message.includes("event-2"))?.id, "expected-event-delivered");
});

test("duplicate delivery passes while duplicate committed effect fails", () => {
  const recorder = baseRecorder();
  recorder.delivery({ eventId: "event-1", attempt: 2 });
  recorder.effectCommit({ effectKey: "effect-1", eventId: "event-1", attempt: 2, persistence: "file" });
  const result = evaluateOracle(
    { scenarioId: "duplicates", expectedEventIds: ["event-1"], expectedEffectKeys: ["effect-1"] },
    recorder.snapshot(),
  );
  assert.equal(result.status, "fail");
  assert.equal(result.counts.deliveryCount, 2);
  assert.equal(result.counts.committedEffectCount, 2);
  assert.equal(result.counts.uniqueCommittedEffectCount, 1);
  assert.equal(result.assertions.find((assertion) => assertion.id === "duplicate-delivery-is-not-business-effect-failure")?.status, "pass");
  assert.equal(result.assertions.find((assertion) => assertion.id === "unique-effect-committed-once")?.status, "fail");
});

test("test-double checkpoint evidence is unverified rather than durable", () => {
  const recorder = baseRecorder();
  recorder.checkpoint({
    operation: "save",
    outcome: "saved",
    evidence: { availability: "observed", value: { kind: "cursor" } },
    persistence: "test-double",
  });
  const result = evaluateOracle(
    { scenarioId: "checkpoint", expectedEventIds: ["event-1"], expectedEffectKeys: ["effect-1"], requireDurableCheckpoint: true },
    recorder.snapshot(),
  );
  assert.equal(result.status, "unverified");
  assert.equal(result.assertions.find((assertion) => assertion.id === "checkpoint-persisted")?.status, "unverified");
});

test("oracle rejects duplicate expected declarations", () => {
  assert.throws(() => evaluateOracle({ scenarioId: "invalid", expectedEventIds: ["event-1", "event-1"] }, []), TypeError);
});

test("oracle covers handler and effect-attempt invariants", () => {
  const recorder = new InMemoryObservationRecorder();
  recorder.delivery({ eventId: "event-1", attempt: 1 });
  const result = evaluateOracle(
    {
      scenarioId: "lifecycle-gaps",
      expectedEventIds: ["event-1"],
      expectedHandlerEventIds: ["event-1"],
      expectedEffectAttemptKeys: ["effect-1"],
      expectedEffectKeys: ["effect-1"],
    },
    recorder.snapshot(),
  );
  assert.equal(result.status, "fail");
  assert.ok(result.assertions.some((assertion) => assertion.id === "expected-event-handled"));
  assert.ok(result.assertions.some((assertion) => assertion.id === "expected-effect-attempted"));
  assert.ok(result.assertions.some((assertion) => assertion.id === "expected-effect-committed"));
});

test("oracle rejects an unexpected committed effect", () => {
  const recorder = new InMemoryObservationRecorder();
  recorder.delivery({ eventId: "event-1", attempt: 1 });
  recorder.effectCommit({ effectKey: "unexpected", eventId: "event-1", attempt: 1, persistence: "file" });
  const result = evaluateOracle(
    { scenarioId: "unexpected-effect", expectedEventIds: ["event-1"] },
    recorder.snapshot(),
  );
  assert.equal(result.status, "fail");
  assert.equal(result.assertions.find((assertion) => assertion.id === "unexpected-effect-committed")?.status, "fail");
});
