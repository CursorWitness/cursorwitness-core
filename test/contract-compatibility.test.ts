import assert from "node:assert/strict";
import test from "node:test";
import type {
  CheckpointObservation,
  CheckpointStore,
  ConsumerAdapter,
  ConsumerContext,
  EffectAttemptObservation,
  EffectCommitObservation,
  ObservationRecorder,
} from "../src/contracts.ts";

interface ApplicationState {
  readonly kind: "application-state";
  readonly nextLedger: number;
  readonly lastEffectKey: string;
}

test("supports an application-defined checkpoint without cursor assumptions", async () => {
  let saved: ApplicationState | undefined;
  const store: CheckpointStore<ApplicationState> = {
    persistence: "test-double",
    async load() {
      return saved;
    },
    async save(value) {
      saved = value;
    },
  };
  const checkpoint: ApplicationState = {
    kind: "application-state",
    nextLedger: 17,
    lastEffectKey: "effect-1",
  };

  await store.save(checkpoint);
  assert.deepEqual(await store.load(), checkpoint);
});

test("represents unobservable checkpoint state explicitly", () => {
  const observation: CheckpointObservation<ApplicationState> = {
    operation: "load",
    outcome: "missing",
    evidence: { availability: "unavailable", reason: "not-exposed" },
    persistence: "adapter-declared",
  };
  assert.equal(observation.evidence.availability, "unavailable");
});

test("keeps effect attempt and commit records distinct", () => {
  const attempt: EffectAttemptObservation = {
    effectKey: "effect-1",
    eventId: "event-1",
    attempt: 1,
  };
  const commit: EffectCommitObservation = {
    effectKey: "effect-1",
    eventId: "event-1",
    attempt: 1,
    persistence: "test-double",
  };
  assert.equal("persistence" in attempt, false);
  assert.equal(commit.persistence, "test-double");
});

test("allows a typed adapter context to use the application checkpoint model", () => {
  const recorder: ObservationRecorder<ApplicationState> = {
    delivery: () => undefined,
    handler: () => undefined,
    effectAttempt: () => undefined,
    effectCommit: () => undefined,
    checkpoint: () => undefined,
  };
  const adapter: ConsumerAdapter<ApplicationState> = {
    id: "contract-test",
    version: "0.0.0",
    async run(context: ConsumerContext<ApplicationState>) {
      context.observations.checkpoint({
        operation: "load",
        outcome: "missing",
        evidence: { availability: "unavailable", reason: "not-exposed" },
        persistence: context.checkpoint.persistence,
      });
    },
  };
  assert.equal(adapter.id, "contract-test");
  assert.equal(recorder.checkpoint !== undefined, true);
});
