import type {
  CheckpointObservation,
  DeliveryObservation,
  EffectAttemptObservation,
  EffectCommitObservation,
  HandlerObservation,
  ObservationPersistence,
  ObservationRecorder,
} from "./contracts.js";

export type ObservationEntry<TCheckpoint = unknown> =
  | { readonly sequence: number; readonly kind: "delivery"; readonly observation: DeliveryObservation }
  | { readonly sequence: number; readonly kind: "handler"; readonly observation: HandlerObservation }
  | { readonly sequence: number; readonly kind: "effect-attempt"; readonly observation: EffectAttemptObservation }
  | { readonly sequence: number; readonly kind: "effect-commit"; readonly observation: EffectCommitObservation }
  | { readonly sequence: number; readonly kind: "checkpoint"; readonly observation: CheckpointObservation<TCheckpoint> };

export class ObservationContractError extends Error {
  readonly name = "ObservationContractError";
}

/** In-memory evidence recorder. Its persistence level is explicitly test-double. */
export class InMemoryObservationRecorder<TCheckpoint = unknown> implements ObservationRecorder<TCheckpoint> {
  readonly persistence: ObservationPersistence = "test-double";
  private readonly entriesValue: ObservationEntry<TCheckpoint>[] = [];

  get entries(): readonly ObservationEntry<TCheckpoint>[] {
    return this.entriesValue;
  }

  delivery(observation: DeliveryObservation): void {
    assertEventId(observation.eventId);
    assertAttempt(observation.attempt);
    this.append("delivery", observation);
  }

  handler(observation: HandlerObservation): void {
    assertEventId(observation.eventId);
    assertAttempt(observation.attempt);
    this.append("handler", observation);
  }

  effectAttempt(observation: EffectAttemptObservation): void {
    assertEventId(observation.eventId);
    assertEffectKey(observation.effectKey);
    assertAttempt(observation.attempt);
    this.append("effect-attempt", observation);
  }

  effectCommit(observation: EffectCommitObservation): void {
    assertEventId(observation.eventId);
    assertEffectKey(observation.effectKey);
    assertAttempt(observation.attempt);
    this.append("effect-commit", observation);
  }

  checkpoint(observation: CheckpointObservation<TCheckpoint>): void {
    if (observation.operation === "load" && observation.outcome === "saved") {
      throw new ObservationContractError("checkpoint load cannot have saved outcome");
    }
    if (observation.operation === "save" && observation.outcome === "loaded") {
      throw new ObservationContractError("checkpoint save cannot have loaded outcome");
    }
    if (observation.outcome === "missing" && observation.evidence.availability !== "unavailable") {
      throw new ObservationContractError("missing checkpoint must have unavailable evidence");
    }
    this.append("checkpoint", observation);
  }

  snapshot(): readonly ObservationEntry<TCheckpoint>[] {
    return this.entriesValue.map((entry) => Object.freeze({ ...entry }));
  }

  private append<K extends ObservationEntry<TCheckpoint>["kind"]>(
    kind: K,
    observation: Extract<ObservationEntry<TCheckpoint>, { readonly kind: K }>["observation"],
  ): void {
    const entry = Object.freeze({
      sequence: this.entriesValue.length,
      kind,
      observation,
    }) as ObservationEntry<TCheckpoint>;
    this.entriesValue.push(entry);
  }
}

function assertEventId(value: string): void {
  if (!value.trim()) throw new ObservationContractError("eventId must be non-empty");
}

function assertEffectKey(value: string): void {
  if (!value.trim()) throw new ObservationContractError("effectKey must be non-empty");
}

function assertAttempt(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ObservationContractError("attempt must be a positive safe integer");
  }
}
