import type { FixtureErrorClass } from "./fixture.js";
import type { ObservationPersistence } from "./contracts.js";
import type { ObservationEntry } from "./observations.js";
import type { OracleResult } from "./oracle.js";
import type { ProviderErrorEvidence } from "./provider-errors.js";
export declare const REPORT_SCHEMA_VERSION: "report.v1";
export type ReportStatus = "pass" | "fail" | "unverified";
export type ReportEvidenceMode = "simulated-offline" | "provider-observed";
export type ReportAssertionStatus = "pass" | "fail" | "unverified";
export interface ReportAssertion {
    readonly id: string;
    readonly status: ReportAssertionStatus;
    readonly message: string;
    readonly evidenceRefs: readonly string[];
}
export interface ReportSummary {
    readonly expectedEventCount: number;
    readonly observedEventCount: number;
    readonly deliveryCount: number;
    readonly handlerInvocationCount: number;
    readonly effectAttemptCount: number;
    readonly committedEffectCount: number;
    readonly uniqueCommittedEffectCount: number;
}
export type ReportTraceEntry = {
    readonly sequence: number;
    readonly kind: "delivery" | "handler";
    readonly eventId: string;
    readonly attempt: number;
} | {
    readonly sequence: number;
    readonly kind: "effect-attempt";
    readonly effectKey: string;
    readonly eventId: string;
    readonly attempt: number;
} | {
    readonly sequence: number;
    readonly kind: "effect-commit";
    readonly effectKey: string;
    readonly eventId: string;
    readonly attempt: number;
    readonly persistence: ObservationPersistence;
} | {
    readonly sequence: number;
    readonly kind: "checkpoint";
    readonly operation: "load" | "save";
    readonly outcome: "loaded" | "saved" | "missing" | "failed";
    readonly evidence: "observed" | "unavailable";
    readonly persistence: ObservationPersistence;
} | {
    readonly sequence: number;
    readonly kind: "provider-error";
    readonly class: FixtureErrorClass;
    readonly code: string;
    readonly retryable: boolean;
};
export interface ReportV1 {
    readonly schemaVersion: typeof REPORT_SCHEMA_VERSION;
    readonly scenarioId: string;
    readonly status: ReportStatus;
    readonly evidenceMode: ReportEvidenceMode;
    readonly assertions: readonly ReportAssertion[];
    readonly summary: ReportSummary;
    /** Ordered semantic lifecycle evidence; excludes runtime metadata. */
    readonly trace: readonly ReportTraceEntry[];
}
/** Report v1 is already normalized: no timestamps, paths, process IDs, or host metadata are allowed. */
export declare function semanticReport(report: ReportV1): ReportV1;
/** Maps independent oracle evidence into the stable semantic report shape. */
export declare function reportFromOracle(result: OracleResult, entries: readonly ObservationEntry[], evidenceMode?: ReportEvidenceMode): ReportV1;
export declare function reportFromProviderError(scenarioId: string, evidence: ProviderErrorEvidence, status: ReportStatus, assertions: readonly ReportAssertion[], evidenceMode?: ReportEvidenceMode): ReportV1;
