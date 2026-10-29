export const REPORT_SCHEMA_VERSION = "report.v1";
/** Report v1 is already normalized: no timestamps, paths, process IDs, or host metadata are allowed. */
export function semanticReport(report) {
    return report;
}
/** Maps independent oracle evidence into the stable semantic report shape. */
export function reportFromOracle(result, entries, evidenceMode = "simulated-offline") {
    return {
        schemaVersion: REPORT_SCHEMA_VERSION,
        scenarioId: result.scenarioId,
        status: result.status,
        evidenceMode,
        assertions: result.assertions.map((assertion) => ({
            id: assertion.id,
            status: assertion.status,
            message: assertion.message,
            evidenceRefs: [...assertion.evidenceRefs],
        })),
        summary: { ...result.counts },
        trace: entries.map(toReportTrace),
    };
}
export function reportFromProviderError(scenarioId, evidence, status, assertions, evidenceMode = "simulated-offline") {
    return {
        schemaVersion: REPORT_SCHEMA_VERSION,
        scenarioId,
        status,
        evidenceMode,
        assertions,
        summary: {
            expectedEventCount: 0,
            observedEventCount: 0,
            deliveryCount: 0,
            handlerInvocationCount: 0,
            effectAttemptCount: 0,
            committedEffectCount: 0,
            uniqueCommittedEffectCount: 0,
        },
        trace: [{
                sequence: 0,
                kind: "provider-error",
                class: evidence.class,
                code: evidence.code,
                retryable: evidence.retryable,
            }],
    };
}
function toReportTrace(entry) {
    if (entry.kind === "delivery" || entry.kind === "handler") {
        return { sequence: entry.sequence, kind: entry.kind, ...entry.observation };
    }
    if (entry.kind === "effect-attempt") {
        return { sequence: entry.sequence, kind: "effect-attempt", ...entry.observation };
    }
    if (entry.kind === "effect-commit") {
        return { sequence: entry.sequence, kind: "effect-commit", ...entry.observation };
    }
    return {
        sequence: entry.sequence,
        kind: "checkpoint",
        operation: entry.observation.operation,
        outcome: entry.observation.outcome,
        evidence: entry.observation.evidence.availability === "observed" ? "observed" : "unavailable",
        persistence: entry.observation.persistence,
    };
}
