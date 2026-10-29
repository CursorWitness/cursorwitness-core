/**
 * Runs one deterministic getEvents pagination attempt. Terminal state comes
 * only from a response without a continuation cursor; an empty page with a
 * cursor remains non-terminal evidence.
 */
export async function runPaginationScenario(options) {
    const maxPages = options.maxPages ?? 1_000;
    if (!Number.isSafeInteger(maxPages) || maxPages < 1)
        throw new TypeError("maxPages must be a positive safe integer");
    const recorder = options.recorder;
    let request = options.initialRequest ?? {};
    let pagesObserved = 0;
    let terminalPageObserved = false;
    let effectFailureMessage;
    const attempts = new Map();
    while (pagesObserved < maxPages) {
        const response = await options.rpc.call(request);
        pagesObserved += 1;
        for (const event of response.events) {
            const attempt = (attempts.get(event.id) ?? 0) + 1;
            attempts.set(event.id, attempt);
            recorder.delivery({ eventId: event.id, attempt });
            recorder.handler({ eventId: event.id, attempt });
            await options.consumer.handleEvent(event, attempt);
            if (options.consumer.applyEffect !== undefined) {
                if (options.consumer.effectKey === undefined) {
                    throw new TypeError("effectKey is required when applyEffect is configured");
                }
                const effectKey = options.consumer.effectKey(event, attempt);
                recorder.effectAttempt({ effectKey, eventId: event.id, attempt });
                try {
                    const effect = await options.consumer.applyEffect(event, attempt);
                    if (effect.committed) {
                        recorder.effectCommit({
                            effectKey: effect.effectKey,
                            eventId: event.id,
                            attempt,
                            persistence: effect.persistence ?? "test-double",
                        });
                    }
                }
                catch (error) {
                    effectFailureMessage = error instanceof Error ? error.message : "effect execution failed";
                    break;
                }
            }
        }
        const cursor = response.cursor;
        if (cursor === undefined) {
            terminalPageObserved = true;
            break;
        }
        if (effectFailureMessage !== undefined)
            break;
        if (!options.consumer.continueAfterPage(response, pagesObserved - 1))
            break;
        request = { pagination: { cursor } };
    }
    const observations = recorder.snapshot();
    const oracleResult = options.evaluate(options.expected, observations);
    const assertions = [...oracleResult.assertions];
    if (effectFailureMessage !== undefined) {
        assertions.push({
            id: "effect-attempt-failed",
            status: "fail",
            message: `Effect execution failed after its attempt was observed: ${effectFailureMessage}`,
            evidenceRefs: ["trace.effect-attempt", "consumer.effect"],
        });
    }
    if (terminalPageObserved) {
        assertions.push({
            id: "pagination-terminal-page-observed",
            status: "pass",
            message: "The provider-declared terminal page was observed before scenario completion.",
            evidenceRefs: ["fixture.response.cursor", "trace.delivery"],
        });
    }
    else {
        assertions.push({
            id: "pagination-terminal-page-observed",
            status: "fail",
            message: "The consumer stopped before a provider-declared terminal page was observed; an empty page or local decision is not completion evidence.",
            evidenceRefs: ["fixture.response.cursor", "trace.delivery"],
        });
    }
    const status = assertions.some((assertion) => assertion.status === "fail")
        ? "fail"
        : assertions.some((assertion) => assertion.status === "unverified")
            ? "unverified"
            : "pass";
    const report = options.buildReport({ ...oracleResult, status, assertions }, observations, options.evidenceMode);
    return { report, terminalPageObserved, pagesObserved, observations };
}
