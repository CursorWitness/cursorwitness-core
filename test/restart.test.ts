import assert from "node:assert/strict";
import test from "node:test";
import { asOpaqueCursor, type CheckpointStore, type ConsumerAdapter, type ConsumerContext, type GetEventsPort, type WitnessEvent } from "../src/contracts.ts";
import { DeterministicFaultController, FaultInjectionError } from "../src/faults.ts";
import { InMemoryObservationRecorder } from "../src/observations.ts";
import { evaluateOracle } from "../src/oracle.ts";
import { reportFromOracle } from "../src/report.ts";
import { createRestartState, evaluateCheckpointOrdering, runRestartAttempt } from "../src/restart.ts";

interface Checkpoint {
  readonly kind: "event";
  readonly processed: boolean;
}

const event: WitnessEvent = {
  id: "event-1",
  type: "contract",
  ledger: 100,
  topic: ["topic"],
  value: "value",
};

const rpc: GetEventsPort = {
  async call() {
    return { events: [event], oldestLedger: 100, latestLedger: 100 };
  },
};

function adapter(order: "effect-then-checkpoint" | "checkpoint-then-effect"): ConsumerAdapter<Checkpoint> {
  return {
    id: order,
    version: "test",
    async run(context: ConsumerContext<Checkpoint>) {
      const checkpoint = await context.checkpoint.load();
      if (checkpoint?.processed === true) return;
      const response = await context.rpc.call({});
      for (const item of response.events) {
        context.observations.delivery({ eventId: item.id, attempt: 1 });
        context.observations.handler({ eventId: item.id, attempt: 1 });
        if (order === "checkpoint-then-effect") {
          await context.checkpoint.save({ kind: "event", processed: true });
        }
        await context.effects.apply("effect:event-1", item);
        if (order === "effect-then-checkpoint") {
          await context.checkpoint.save({ kind: "event", processed: true });
        }
      }
    },
  };
}

function reportFor(recorder: InMemoryObservationRecorder<Checkpoint>, scenarioId: string) {
  const result = evaluateOracle(
    { scenarioId, expectedEventIds: ["event-1"], expectedEffectKeys: ["effect:event-1"] },
    recorder.snapshot(),
  );
  return reportFromOracle(result, recorder.snapshot());
}

test("effect-then-checkpoint crash replays delivery but idempotent effect commits once", async () => {
  const recorder = new InMemoryObservationRecorder<Checkpoint>();
  const state = createRestartState<Checkpoint>();
  const first = await runRestartAttempt({
    adapter: adapter("effect-then-checkpoint"),
    rpc,
    state,
    observations: recorder,
    faults: new DeterministicFaultController(["after-effect-commit"]),
    deduplicateEffects: true,
  });
  assert.equal(first.status, "failed");
  assert.ok(first.error instanceof FaultInjectionError);
  assert.equal(state.checkpoint, undefined);

  const second = await runRestartAttempt({
    adapter: adapter("effect-then-checkpoint"),
    rpc,
    state,
    observations: recorder,
    faults: new DeterministicFaultController(),
    deduplicateEffects: true,
  });
  assert.equal(second.status, "completed");
  const report = reportFor(recorder, "effect-then-checkpoint-restart");
  assert.equal(report.status, "pass");
  assert.equal(report.summary.deliveryCount, 2);
  assert.equal(report.summary.committedEffectCount, 1);
  assert.equal(report.summary.uniqueCommittedEffectCount, 1);
  assert.equal(evaluateCheckpointOrdering("effect-before-checkpoint", recorder.snapshot())[0]?.status, "pass");
  assert.equal(evaluateCheckpointOrdering("effect-before-checkpoint", recorder.snapshot(), true)[1]?.status, "unverified");
});

test("checkpoint-then-effect crash leaves checkpoint saved but exposes missing effect after restart", async () => {
  const recorder = new InMemoryObservationRecorder<Checkpoint>();
  const state = createRestartState<Checkpoint>();
  const first = await runRestartAttempt({
    adapter: adapter("checkpoint-then-effect"),
    rpc,
    state,
    observations: recorder,
    faults: new DeterministicFaultController(["before-effect-attempt"]),
  });
  assert.equal(first.status, "failed");
  assert.ok(first.error instanceof FaultInjectionError);
  assert.deepEqual(state.checkpoint, { kind: "event", processed: true });

  const second = await runRestartAttempt({
    adapter: adapter("checkpoint-then-effect"),
    rpc,
    state,
    observations: recorder,
    faults: new DeterministicFaultController(),
  });
  assert.equal(second.status, "completed");
  const report = reportFor(recorder, "checkpoint-then-effect-restart");
  assert.equal(report.status, "fail");
  assert.equal(report.summary.committedEffectCount, 0);
  assert.equal(report.assertions.find((assertion) => assertion.id === "expected-effect-committed")?.status, "fail");
  assert.equal(evaluateCheckpointOrdering("checkpoint-before-effect", recorder.snapshot())[0]?.status, "unverified");
});

test("after-checkpoint-save crash preserves checkpoint evidence for restart", async () => {
  const recorder = new InMemoryObservationRecorder<Checkpoint>();
  const state = createRestartState<Checkpoint>();
  const result = await runRestartAttempt({
    adapter: adapter("effect-then-checkpoint"),
    rpc,
    state,
    observations: recorder,
    faults: new DeterministicFaultController(["after-checkpoint-save"]),
    deduplicateEffects: true,
  });
  assert.equal(result.status, "failed");
  assert.ok(result.error instanceof FaultInjectionError);
  assert.deepEqual(state.checkpoint, { kind: "event", processed: true });
  assert.equal(recorder.entries.filter((entry) => entry.kind === "checkpoint" && entry.observation.operation === "save").length, 1);
});

test("ordering evaluator emits a specific failure when checkpoint precedes an expected effect", async () => {
  const recorder = new InMemoryObservationRecorder<Checkpoint>();
  const state = createRestartState<Checkpoint>();
  const result = await runRestartAttempt({
    adapter: adapter("checkpoint-then-effect"),
    rpc,
    state,
    observations: recorder,
    faults: new DeterministicFaultController(),
  });
  assert.equal(result.status, "completed");
  const assertion = evaluateCheckpointOrdering("effect-before-checkpoint", recorder.snapshot())[0]!;
  assert.equal(assertion.id, "checkpoint-order-observed");
  assert.equal(assertion.status, "fail");
  assert.ok(assertion.evidenceRefs.includes("trace.effect-commit"));
});
