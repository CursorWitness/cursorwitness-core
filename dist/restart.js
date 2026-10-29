/** Evaluates ordering from trace sequence numbers, independently of checkpoint contents. */
export function evaluateCheckpointOrdering(expected, entries, requireDurableEvidence = false) {
    const commits = entries.filter((entry) => entry.kind === "effect-commit");
    const saves = entries.filter((entry) => entry.kind === "checkpoint" && entry.observation.operation === "save" && entry.observation.outcome === "saved");
    const assertions = [];
    const firstCommit = commits[0];
    const firstSave = saves[0];
    if (firstCommit === undefined || firstSave === undefined) {
        assertions.push({
            id: "checkpoint-order-observed",
            status: "unverified",
            message: "Insufficient effect-commit and checkpoint-save evidence to evaluate ordering.",
            evidenceRefs: ["trace.effect-commit", "trace.checkpoint"],
        });
    }
    else {
        const valid = expected === "effect-before-checkpoint"
            ? firstCommit.sequence < firstSave.sequence
            : firstSave.sequence < firstCommit.sequence;
        assertions.push({
            id: "checkpoint-order-observed",
            status: valid ? "pass" : "fail",
            message: valid
                ? `Observed ${expected} ordering.`
                : `Observed checkpoint/effect ordering contradicts ${expected}.`,
            evidenceRefs: ["trace.effect-commit", "trace.checkpoint"],
        });
    }
    if (requireDurableEvidence) {
        const testDoubleSave = saves.some((entry) => entry.observation.persistence === "test-double");
        assertions.push({
            id: "checkpoint-durable-evidence",
            status: testDoubleSave ? "unverified" : "pass",
            message: testDoubleSave
                ? "Checkpoint ordering was observed only through test-double persistence; durable recovery remains unverified."
                : "Checkpoint ordering includes non-test-double persistence evidence.",
            evidenceRefs: ["trace.checkpoint", "checkpoint.persistence"],
        });
    }
    return assertions;
}
/** Creates shared restart state; its memory-only nature must remain visible to reports. */
export function createRestartState() {
    return { checkpoint: undefined, committedEffectKeys: new Set() };
}
/**
 * Executes one adapter attempt against shared test-double state. A caller can
 * invoke this function again with a new fault controller to model restart.
 */
export async function runRestartAttempt(options) {
    const checkpoint = {
        persistence: "test-double",
        async load() {
            if (options.state.checkpoint === undefined) {
                options.observations.checkpoint({
                    operation: "load",
                    outcome: "missing",
                    evidence: { availability: "unavailable", reason: "not-readable" },
                    persistence: "test-double",
                });
                return undefined;
            }
            options.observations.checkpoint({
                operation: "load",
                outcome: "loaded",
                evidence: { availability: "observed", value: options.state.checkpoint },
                persistence: "test-double",
            });
            return options.state.checkpoint;
        },
        async save(value) {
            options.faults.hit("before-checkpoint-save");
            options.state.checkpoint = value;
            options.observations.checkpoint({
                operation: "save",
                outcome: "saved",
                evidence: { availability: "observed", value },
                persistence: "test-double",
            });
            options.faults.hit("after-checkpoint-save");
        },
    };
    const effects = {
        async apply(effectKey, event) {
            options.faults.hit("before-effect-attempt");
            options.observations.effectAttempt({ effectKey, eventId: event.id, attempt: 1 });
            if (!options.deduplicateEffects || !options.state.committedEffectKeys.has(effectKey)) {
                options.state.committedEffectKeys.add(effectKey);
                options.observations.effectCommit({
                    effectKey,
                    eventId: event.id,
                    attempt: 1,
                    persistence: "test-double",
                });
                options.faults.hit("after-effect-commit");
            }
        },
    };
    const context = {
        rpc: options.rpc,
        checkpoint,
        effects,
        observations: options.observations,
        faults: options.faults,
    };
    try {
        await options.adapter.run(context);
        return { status: "completed", observations: options.observations.snapshot() };
    }
    catch (error) {
        return { status: "failed", error, observations: options.observations.snapshot() };
    }
}
