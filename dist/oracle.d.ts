import type { ObservationPersistence } from "./contracts.js";
import type { ObservationEntry } from "./observations.js";
export type OracleStatus = "pass" | "fail" | "unverified";
export interface ExpectedScenario {
    readonly scenarioId: string;
    readonly expectedEventIds: readonly string[];
    readonly expectedHandlerEventIds?: readonly string[];
    readonly expectedEffectAttemptKeys?: readonly string[];
    readonly expectedEffectKeys?: readonly string[];
    /** Require evidence that a checkpoint was persisted beyond an in-memory test double. */
    readonly requireDurableCheckpoint?: boolean;
}
export interface InvariantViolation {
    readonly id: string;
    readonly status: OracleStatus;
    readonly message: string;
    readonly evidenceRefs: readonly string[];
}
export interface OracleCounts {
    readonly expectedEventCount: number;
    readonly observedEventCount: number;
    readonly deliveryCount: number;
    readonly handlerInvocationCount: number;
    readonly effectAttemptCount: number;
    readonly committedEffectCount: number;
    readonly uniqueCommittedEffectCount: number;
}
export interface OracleResult {
    readonly scenarioId: string;
    readonly status: OracleStatus;
    readonly assertions: readonly InvariantViolation[];
    readonly counts: OracleCounts;
}
/**
 * Evaluates consumer evidence against scenario-declared expectations.
 * It intentionally never reads a consumer checkpoint to define expected truth.
 */
export declare function evaluateOracle(expected: ExpectedScenario, entries: readonly ObservationEntry[]): OracleResult;
export declare function persistenceIsDurable(persistence: ObservationPersistence): boolean;
