export class ObservationContractError extends Error {
    name = "ObservationContractError";
}
/** In-memory evidence recorder. Its persistence level is explicitly test-double. */
export class InMemoryObservationRecorder {
    persistence = "test-double";
    entriesValue = [];
    get entries() {
        return this.entriesValue;
    }
    delivery(observation) {
        assertEventId(observation.eventId);
        assertAttempt(observation.attempt);
        this.append("delivery", observation);
    }
    handler(observation) {
        assertEventId(observation.eventId);
        assertAttempt(observation.attempt);
        this.append("handler", observation);
    }
    effectAttempt(observation) {
        assertEventId(observation.eventId);
        assertEffectKey(observation.effectKey);
        assertAttempt(observation.attempt);
        this.append("effect-attempt", observation);
    }
    effectCommit(observation) {
        assertEventId(observation.eventId);
        assertEffectKey(observation.effectKey);
        assertAttempt(observation.attempt);
        this.append("effect-commit", observation);
    }
    checkpoint(observation) {
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
    snapshot() {
        return this.entriesValue.map((entry) => Object.freeze({ ...entry }));
    }
    append(kind, observation) {
        const entry = Object.freeze({
            sequence: this.entriesValue.length,
            kind,
            observation,
        });
        this.entriesValue.push(entry);
    }
}
function assertEventId(value) {
    if (!value.trim())
        throw new ObservationContractError("eventId must be non-empty");
}
function assertEffectKey(value) {
    if (!value.trim())
        throw new ObservationContractError("effectKey must be non-empty");
}
function assertAttempt(value) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new ObservationContractError("attempt must be a positive safe integer");
    }
}
