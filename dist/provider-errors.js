/** Extracts only stable provider-error fields; arbitrary thrown values remain unknown. */
export function classifyProviderError(error, attempts = 1) {
    if (error !== null && typeof error === "object") {
        const value = error;
        const errorClass = value.errorClass ?? value.class;
        if (isErrorClass(errorClass) && typeof value.code === "string" && typeof value.retryable === "boolean") {
            return { class: errorClass, code: value.code, retryable: value.retryable, attempts };
        }
    }
    return { class: "unknown", code: "UNKNOWN_ERROR", retryable: false, attempts };
}
export function evaluateProviderError(expected, actual) {
    const assertions = [];
    if (actual.class !== expected.class) {
        assertions.push({
            id: "provider-error-classified",
            status: "fail",
            message: `Expected provider error class ${expected.class}, observed ${actual.class}.`,
            evidenceRefs: ["scenario.expectedProviderError", "trace.provider-error"],
        });
    }
    else {
        assertions.push({
            id: "provider-error-classified",
            status: "pass",
            message: `Provider error classified as ${actual.class} (${actual.code}).`,
            evidenceRefs: ["trace.provider-error"],
        });
    }
    if (expected.retryable !== undefined && actual.retryable !== expected.retryable) {
        assertions.push({
            id: "provider-error-retryability",
            status: "fail",
            message: `Expected retryable=${expected.retryable}, observed retryable=${actual.retryable}.`,
            evidenceRefs: ["scenario.expectedProviderError", "trace.provider-error"],
        });
    }
    if (actual.class === "history-unavailable") {
        assertions.push({
            id: "history-unavailable-not-recovered",
            status: expected.recovery === "surface-error" ? "pass" : expected.recovery === "unverified" ? "unverified" : "fail",
            message: expected.recovery === "surface-error"
                ? "Unavailable history was surfaced as an error and not treated as successful recovery."
                : "History-unavailable recovery cannot be claimed from this evidence.",
            evidenceRefs: ["trace.provider-error", "recovery.outcome"],
        });
    }
    else if (actual.class === "transport") {
        assertions.push({
            id: "transport-error-distinct-from-retention",
            status: actual.retryable && expected.recovery !== "unverified" ? "pass" : "unverified",
            message: actual.retryable
                ? "Transient transport failure remains distinct from history retention loss."
                : "Transport failure was observed without retryability evidence.",
            evidenceRefs: ["trace.provider-error", "provider.retryable"],
        });
        if (expected.recovery === "retry-then-recover" && actual.attempts < 2) {
            assertions.push({
                id: "transport-retry-observed",
                status: "unverified",
                message: "A retry-then-recover expectation was declared, but fewer than two attempts were observed.",
                evidenceRefs: ["trace.provider-error", "provider.attempts"],
            });
        }
    }
    else if (actual.class === "invalid-request") {
        assertions.push({
            id: "invalid-checkpoint-distinct-from-retention",
            status: "pass",
            message: "Invalid request/checkpoint evidence remains distinct from provider history retention loss.",
            evidenceRefs: ["trace.provider-error", "checkpoint.input"],
        });
    }
    const status = assertions.some((assertion) => assertion.status === "fail")
        ? "fail"
        : assertions.some((assertion) => assertion.status === "unverified")
            ? "unverified"
            : "pass";
    return { status, assertions };
}
function isErrorClass(value) {
    return value === "history-unavailable" || value === "transport" || value === "invalid-request" || value === "unknown";
}
