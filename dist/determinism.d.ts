import type { ReportV1 } from "./report.js";
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
/** Recursively sorts object keys while preserving array order. */
export declare function canonicalizeJson(value: unknown): JsonValue;
export declare function canonicalJson(value: unknown): string;
/** Report v1 contains only semantic fields, so canonicalization is sufficient normalization. */
export declare function normalizeSemanticReport(report: ReportV1): ReportV1;
