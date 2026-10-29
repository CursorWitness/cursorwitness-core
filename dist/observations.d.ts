import type { CheckpointObservation, DeliveryObservation, EffectAttemptObservation, EffectCommitObservation, HandlerObservation, ObservationPersistence, ObservationRecorder } from "./contracts.js";
export type ObservationEntry<TCheckpoint = unknown> = {
    readonly sequence: number;
    readonly kind: "delivery";
    readonly observation: DeliveryObservation;
} | {
    readonly sequence: number;
    readonly kind: "handler";
    readonly observation: HandlerObservation;
} | {
    readonly sequence: number;
    readonly kind: "effect-attempt";
    readonly observation: EffectAttemptObservation;
} | {
    readonly sequence: number;
    readonly kind: "effect-commit";
    readonly observation: EffectCommitObservation;
} | {
    readonly sequence: number;
    readonly kind: "checkpoint";
    readonly observation: CheckpointObservation<TCheckpoint>;
};
export declare class ObservationContractError extends Error {
    readonly name = "ObservationContractError";
}
/** In-memory evidence recorder. Its persistence level is explicitly test-double. */
export declare class InMemoryObservationRecorder<TCheckpoint = unknown> implements ObservationRecorder<TCheckpoint> {
    readonly persistence: ObservationPersistence;
    private readonly entriesValue;
    get entries(): readonly ObservationEntry<TCheckpoint>[];
    delivery(observation: DeliveryObservation): void;
    handler(observation: HandlerObservation): void;
    effectAttempt(observation: EffectAttemptObservation): void;
    effectCommit(observation: EffectCommitObservation): void;
    checkpoint(observation: CheckpointObservation<TCheckpoint>): void;
    snapshot(): readonly ObservationEntry<TCheckpoint>[];
    private append;
}
