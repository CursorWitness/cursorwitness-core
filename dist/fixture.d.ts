import type { GetEventsRequest, GetEventsResponse } from "./contracts.js";
export type FixtureErrorClass = "history-unavailable" | "transport" | "invalid-request" | "unknown";
export interface FixtureProviderError {
    readonly class: FixtureErrorClass;
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
}
export interface FixturePage {
    readonly requestKey: string;
    readonly request?: GetEventsRequest;
    readonly response?: GetEventsResponse;
    readonly error?: FixtureProviderError;
}
export interface GetEventsFixtureV1 {
    readonly schemaVersion: "fixture.v1";
    readonly id: string;
    readonly rpcMethod: "getEvents";
    readonly provenance: "synthetic" | "captured";
    readonly pages: readonly FixturePage[];
}
export declare function validateFixture(fixture: GetEventsFixtureV1): void;
