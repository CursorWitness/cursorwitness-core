import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryObservationRecorder, ObservationContractError } from "../src/observations.ts";

interface ApplicationCheckpoint {
  readonly kind: "compound";
  readonly nextLedger: number;
}

test("records lifecycle observations in deterministic sequence", () => {
  const recorder = new InMemoryObservationRecorder<ApplicationCheckpoint>();
  recorder.delivery({ eventId: "event-1", attempt: 1 });
  recorder.handler({ eventId: "event-1", attempt: 1 });
  recorder.effectAttempt({ effectKey: "effect-1", eventId: "event-1", attempt: 1 });
  recorder.effectCommit({
    effectKey: "effect-1",
    eventId: "event-1",
    attempt: 1,
    persistence: "test-double",
  });
  recorder.checkpoint({
    operation: "save",
    outcome: "saved",
    evidence: { availability: "observed", value: { kind: "compound", nextLedger: 102 } },
    persistence: recorder.persistence,
  });

  assert.deepEqual(recorder.entries.map((entry) => [entry.sequence, entry.kind]), [
    [0, "delivery"],
    [1, "handler"],
    [2, "effect-attempt"],
    [3, "effect-commit"],
    [4, "checkpoint"],
  ]);
  assert.equal(recorder.persistence, "test-double");
  assert.equal(recorder.entries[3]!.kind, "effect-commit");
  assert.equal(recorder.entries[3]!.observation.persistence, "test-double");
});

test("preserves unavailable checkpoint evidence without claiming durability", () => {
  const recorder = new InMemoryObservationRecorder<ApplicationCheckpoint>();
  recorder.checkpoint({
    operation: "load",
    outcome: "missing",
    evidence: { availability: "unavailable", reason: "not-exposed" },
    persistence: "test-double",
  });
  const observation = recorder.entries[0]!;
  assert.equal(observation.kind, "checkpoint");
  assert.deepEqual(observation.observation.evidence, { availability: "unavailable", reason: "not-exposed" });
  assert.equal(observation.observation.persistence, "test-double");
});

test("rejects invalid lifecycle observations", () => {
  const recorder = new InMemoryObservationRecorder();
  assert.throws(() => recorder.delivery({ eventId: "", attempt: 1 }), ObservationContractError);
  assert.throws(() => recorder.handler({ eventId: "event-1", attempt: 0 }), ObservationContractError);
  assert.throws(() => recorder.effectAttempt({ effectKey: "", eventId: "event-1", attempt: 1 }), ObservationContractError);
  assert.throws(() => recorder.checkpoint({
    operation: "load",
    outcome: "saved",
    evidence: { availability: "unavailable", reason: "not-exposed" },
    persistence: "test-double",
  }), ObservationContractError);
});

test("snapshot returns a separate immutable entry collection", () => {
  const recorder = new InMemoryObservationRecorder();
  recorder.delivery({ eventId: "event-1", attempt: 1 });
  const snapshot = recorder.snapshot();
  assert.notEqual(snapshot, recorder.entries);
  assert.equal(Object.isFrozen(snapshot[0]), true);
  assert.equal(snapshot.length, 1);
  recorder.handler({ eventId: "event-1", attempt: 1 });
  assert.equal(snapshot.length, 1);
  assert.equal(recorder.entries.length, 2);
});
