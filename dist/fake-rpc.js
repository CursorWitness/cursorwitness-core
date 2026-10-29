export class FixtureRpcError extends Error {
    name = "FixtureRpcError";
    errorClass;
    code;
    retryable;
    requestKey;
    constructor(errorClass, code, message, retryable, requestKey) {
        super(message);
        this.errorClass = errorClass;
        this.code = code;
        this.retryable = retryable;
        this.requestKey = requestKey;
    }
}
/**
 * Deterministic offline getEvents playback. Callers should validate the
 * fixture at their input boundary with validateFixture before construction.
 * This is a fixture simulation, not a claim that every Stellar RPC provider
 * behaves this way.
 */
export class FixtureGetEventsPort {
    pagesByKey;
    initialRequestKey;
    maxCalls;
    callCountValue = 0;
    requestsValue = [];
    constructor(fixture, options = {}) {
        this.initialRequestKey = options.initialRequestKey ?? "initial";
        this.maxCalls = options.maxCalls ?? 1_000;
        if (!Number.isSafeInteger(this.maxCalls) || this.maxCalls < 1) {
            throw new Error("fake getEvents maxCalls must be a positive safe integer");
        }
        const pages = new Map();
        for (const page of fixture.pages) {
            if (pages.has(page.requestKey))
                throw new Error(`duplicate fixture requestKey: ${page.requestKey}`);
            pages.set(page.requestKey, page);
        }
        if (!pages.has(this.initialRequestKey)) {
            throw new Error(`fixture initial requestKey not found: ${this.initialRequestKey}`);
        }
        this.pagesByKey = pages;
    }
    get callCount() {
        return this.callCountValue;
    }
    get requests() {
        return this.requestsValue;
    }
    async call(request) {
        this.callCountValue += 1;
        this.requestsValue.push(request);
        if (this.callCountValue > this.maxCalls) {
            throw new FixtureRpcError("invalid-request", "FIXTURE_CALL_LIMIT", `fixture getEvents call limit ${this.maxCalls} exceeded`, false, this.requestKeyFor(request));
        }
        const requestKey = this.requestKeyFor(request);
        const page = this.pagesByKey.get(requestKey);
        if (page === undefined) {
            throw new FixtureRpcError("invalid-request", "UNKNOWN_CURSOR", `fixture has no page for request key ${requestKey}`, false, requestKey);
        }
        this.assertDeclaredRequestMatches(page, request);
        if (page.error !== undefined) {
            throw new FixtureRpcError(page.error.class, page.error.code, page.error.message, page.error.retryable, requestKey);
        }
        if (page.response === undefined)
            throw new Error(`fixture page ${requestKey} has no response`);
        return page.response;
    }
    requestKeyFor(request) {
        const cursor = request.pagination?.cursor;
        return cursor === undefined ? this.initialRequestKey : cursor;
    }
    assertDeclaredRequestMatches(page, actual) {
        if (page.request === undefined)
            return;
        if (stableRequestJson(page.request) !== stableRequestJson(actual)) {
            throw new FixtureRpcError("invalid-request", "REQUEST_MISMATCH", `request does not match fixture page ${page.requestKey}`, false, page.requestKey);
        }
    }
}
function stableRequestJson(value) {
    const sort = (entry) => {
        if (Array.isArray(entry))
            return entry.map(sort);
        if (entry !== null && typeof entry === "object") {
            return Object.fromEntries(Object.entries(entry)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, sort(child)]));
        }
        return entry;
    };
    return JSON.stringify(sort(value));
}
