import type { FixtureErrorClass } from "./fixture.js";
import type { InvariantViolation, OracleStatus } from "./oracle.js";
export interface ProviderErrorEvidence {
    readonly class: FixtureErrorClass;
    readonly code: string;
    readonly retryable: boolean;
    readonly attempts: number;
}
export type RecoveryExpectation = "surface-error" | "retry-then-recover" | "unverified";
export interface ProviderErrorExpectation {
    readonly class: FixtureErrorClass;
    readonly retryable?: boolean;
    readonly recovery: RecoveryExpectation;
}
export interface ProviderErrorEvaluation {
    readonly status: OracleStatus;
    readonly assertions: readonly InvariantViolation[];
}
/** Extracts only stable provider-error fields; arbitrary thrown values remain unknown. */
export declare function classifyProviderError(error: unknown, attempts?: number): ProviderErrorEvidence;
export declare function evaluateProviderError(expected: ProviderErrorExpectation, actual: ProviderErrorEvidence): ProviderErrorEvaluation;
