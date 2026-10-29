import assert from "node:assert/strict";
import test from "node:test";
import type { CheckpointStore, ConsumerContext, EffectSink, GetEventsPort } from "../src/contracts.ts";
import { DeterministicFaultController, FaultInjectionError } from "../src/faults.ts";
import { executeConsumer } from "../src/lifecycle.ts";
import { InMemoryObservationRecorder } from "../src/observations.ts";

interface Checkpoint {
  readonly kind: "test";
  readonly nextLedger: number;
}

function context(
  observations: InMemoryObservationRecorder<Checkpoint>,
  faults: DeterministicFaultController,
): ConsumerContext<Checkpoint> {
  const rpc: GetEventsPort = { async call() {
    return { events: [], oldestLedger: 1, latestLedger: 1 };
  } };
  const checkpoint: CheckpointStore<Checkpoint> = {
    persistence: "test-double",
    async load() { return undefined; },
    async save() { return undefined; },
  };
  const effects: EffectSink = { async apply() { return undefined; } };
  return { rpc, checkpoint, effects, observations, faults };
}

test("fault controller injects each configured point once", () => {
  const faults = new DeterministicFaultController(["after-effect-commit"]);
  assert.deepEqual(faults.remainingPoints, ["after-effect-commit"]);
  assert.throws(() => faults.hit("after-effect-commit"), (error: unknown) =>
    error instanceof FaultInjectionError && error.point === "after-effect-commit");
  faults.hit("after-effect-commit");
  assert.deepEqual(faults.remainingPoints, []);
});

test("fault plans reject duplicate points", () => {
  assert.throws(() => new DeterministicFaultController(["before-handler", "before-handler"]), /duplicate points/);
});

test("executeConsumer returns completed status and ordered observations", async () => {
  const recorder = new InMemoryObservationRecorder<Checkpoint>();
  const faults = new DeterministicFaultController();
  const result = await executeConsumer({
    id: "successful-adapter",
    version: "0.0.0",
    async run(runContext) {
      runContext.observations.delivery({ eventId: "event-1", attempt: 1 });
      runContext.observations.handler({ eventId: "event-1", attempt: 1 });
    },
  }, context(recorder, faults), recorder);

  assert.equal(result.status, "completed");
  assert.deepEqual(result.observations.map((entry) => entry.kind), ["delivery", "handler"]);
});

test("executeConsumer preserves observations before an injected crash", async () => {
  const recorder = new InMemoryObservationRecorder<Checkpoint>();
  const faults = new DeterministicFaultController(["after-effect-commit"]);
  const result = await executeConsumer({
    id: "crashing-adapter",
    version: "0.0.0",
    async run(runContext) {
      runContext.observations.delivery({ eventId: "event-1", attempt: 1 });
      runContext.observations.effectAttempt({ effectKey: "effect-1", eventId: "event-1", attempt: 1 });
      runContext.observations.effectCommit({
        effectKey: "effect-1",
        eventId: "event-1",
        attempt: 1,
        persistence: "test-double",
      });
      runContext.faults.hit("after-effect-commit");
      runContext.observations.checkpoint({
        operation: "save",
        outcome: "saved",
        evidence: { availability: "observed", value: { kind: "test", nextLedger: 2 } },
        persistence: "test-double",
      });
    },
  }, context(recorder, faults), recorder);

  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.ok(result.error instanceof FaultInjectionError);
    assert.equal(result.error.point, "after-effect-commit");
  }
  assert.deepEqual(result.observations.map((entry) => entry.kind), ["delivery", "effect-attempt", "effect-commit"]);
});
