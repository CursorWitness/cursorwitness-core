/** Correct reference behavior: an empty page is non-terminal when it has a cursor. */
export function createReferencePaginationConsumer() {
    return {
        continueAfterPage(response) {
            return response.cursor !== undefined;
        },
        handleEvent(_event) { },
    };
}
/** Deliberately broken: treats an empty page as completion even when a cursor remains. */
export function createStopOnEmptyConsumer() {
    return {
        continueAfterPage(response) {
            return response.events.length > 0 && response.cursor !== undefined;
        },
        handleEvent(_event) { },
    };
}
/** Correct idempotent effect example: repeated delivery attempts do not repeat the commit. */
export function createIdempotentEffectConsumer() {
    const committed = new Set();
    return {
        continueAfterPage(response) {
            return response.cursor !== undefined;
        },
        handleEvent(_event) { },
        effectKey(event) {
            return `effect:${event.id}`;
        },
        applyEffect(event) {
            const effectKey = `effect:${event.id}`;
            const committedNow = !committed.has(effectKey);
            committed.add(effectKey);
            return { effectKey, committed: committedNow, persistence: "file" };
        },
    };
}
/** Deliberately broken: every delivery commits the same business effect again. */
export function createNonIdempotentEffectConsumer() {
    return {
        continueAfterPage(response) {
            return response.cursor !== undefined;
        },
        handleEvent(_event) { },
        effectKey(event) {
            return `effect:${event.id}`;
        },
        applyEffect(event) {
            return { effectKey: `effect:${event.id}`, committed: true, persistence: "file" };
        },
    };
}
