import type { ConsumerAdapter, FaultController, GetEventsPort, ObservationRecorder } from "./contracts.js";
import type { ObservationEntry } from "./observations.js";
import type { ConsumerRunResult } from "./lifecycle.js";
import type { InvariantViolation } from "./oracle.js";
export interface RestartState<TCheckpoint> {
    checkpoint: TCheckpoint | undefined;
    readonly committedEffectKeys: Set<string>;
}
export interface RestartAttemptOptions<TCheckpoint> {
    readonly adapter: ConsumerAdapter<TCheckpoint>;
    readonly rpc: GetEventsPort;
    readonly state: RestartState<TCheckpoint>;
    readonly observations: RestartObservationRecorder<TCheckpoint>;
    readonly faults: FaultController;
    /** When true, repeated effect keys are treated as idempotent and do not commit again. */
    readonly deduplicateEffects?: boolean;
}
export interface RestartObservationRecorder<TCheckpoint = unknown> extends ObservationRecorder<TCheckpoint> {
    snapshot(): readonly ObservationEntry<TCheckpoint>[];
}
export type CheckpointOrdering = "effect-before-checkpoint" | "checkpoint-before-effect";
/** Evaluates ordering from trace sequence numbers, independently of checkpoint contents. */
export declare function evaluateCheckpointOrdering(expected: CheckpointOrdering, entries: readonly ObservationEntry[], requireDurableEvidence?: boolean): readonly InvariantViolation[];
/** Creates shared restart state; its memory-only nature must remain visible to reports. */
export declare function createRestartState<TCheckpoint>(): RestartState<TCheckpoint>;
/**
 * Executes one adapter attempt against shared test-double state. A caller can
 * invoke this function again with a new fault controller to model restart.
 */
export declare function runRestartAttempt<TCheckpoint>(options: RestartAttemptOptions<TCheckpoint>): Promise<ConsumerRunResult<TCheckpoint>>;
