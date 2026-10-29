import type { GetEventsPort, GetEventsRequest, GetEventsResponse } from "./contracts.js";
import type { FixtureErrorClass, GetEventsFixtureV1 } from "./fixture.js";
export interface FakeGetEventsOptions {
    readonly initialRequestKey?: string;
    readonly maxCalls?: number;
}
export declare class FixtureRpcError extends Error {
    readonly name = "FixtureRpcError";
    readonly errorClass: FixtureErrorClass;
    readonly code: string;
    readonly retryable: boolean;
    readonly requestKey: string;
    constructor(errorClass: FixtureErrorClass, code: string, message: string, retryable: boolean, requestKey: string);
}
/**
 * Deterministic offline getEvents playback. Callers should validate the
 * fixture at their input boundary with validateFixture before construction.
 * This is a fixture simulation, not a claim that every Stellar RPC provider
 * behaves this way.
 */
export declare class FixtureGetEventsPort implements GetEventsPort {
    private readonly pagesByKey;
    private readonly initialRequestKey;
    private readonly maxCalls;
    private callCountValue;
    private readonly requestsValue;
    constructor(fixture: GetEventsFixtureV1, options?: FakeGetEventsOptions);
    get callCount(): number;
    get requests(): readonly GetEventsRequest[];
    call(request: GetEventsRequest): Promise<GetEventsResponse>;
    private requestKeyFor;
    private assertDeclaredRequestMatches;
}
