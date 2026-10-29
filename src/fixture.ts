import type { GetEventsRequest, GetEventsResponse, WitnessEvent } from "./contracts.js";
const MAX_FIXTURE_PAGES = 1_024;
const MAX_FIXTURE_EVENTS = 100_000;
const MAX_FIELD_LENGTH = 4_096;

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

export function validateFixture(fixture: GetEventsFixtureV1): void {
  if (fixture.schemaVersion !== "fixture.v1") throw new Error("unsupported fixture schema");
  if (fixture.rpcMethod !== "getEvents") throw new Error("fixture must target getEvents");
  if (!fixture.id.trim()) throw new Error("fixture id is required");
  if (fixture.id.length > MAX_FIELD_LENGTH) throw new Error("fixture id exceeds the size limit");
  if (!Array.isArray(fixture.pages) || fixture.pages.length === 0) throw new Error("fixture must contain at least one page");
  if (fixture.pages.length > MAX_FIXTURE_PAGES) throw new Error(`fixture page count exceeds ${MAX_FIXTURE_PAGES}`);
  let eventCount = 0;
  for (const page of fixture.pages) eventCount += validatePage(page);
  if (eventCount > MAX_FIXTURE_EVENTS) throw new Error(`fixture event count exceeds ${MAX_FIXTURE_EVENTS}`);
}

function validatePage(page: FixturePage): number {
  if (!page.requestKey.trim()) throw new Error("fixture page requestKey is required");
  if (page.requestKey.length > MAX_FIELD_LENGTH) throw new Error("fixture page requestKey exceeds the size limit");
  if ((page.response === undefined) === (page.error === undefined)) {
    throw new Error("fixture page must contain exactly one response or error");
  }
  if (page.error !== undefined) {
    validateError(page.error);
    return 0;
  }
  if (page.response === undefined) throw new Error("fixture response is required");
  if (!Number.isInteger(page.response.oldestLedger) || page.response.oldestLedger < 0) {
    throw new Error("oldestLedger must be a non-negative integer");
  }
  if (!Number.isInteger(page.response.latestLedger) || page.response.latestLedger < page.response.oldestLedger) {
    throw new Error("latestLedger must be an integer at or after oldestLedger");
  }
  if (page.response.events.length > MAX_FIXTURE_EVENTS) throw new Error(`page event count exceeds ${MAX_FIXTURE_EVENTS}`);
  for (const event of page.response.events) validateEvent(event);
  if (page.response.cursor !== undefined && typeof page.response.cursor !== "string") {
    throw new Error("cursor must remain an opaque string");
  }
  if (page.response.cursor !== undefined && page.response.cursor.length > MAX_FIELD_LENGTH) {
    throw new Error("cursor exceeds the size limit");
  }
  return page.response.events.length;
}

function validateError(error: FixtureProviderError): void {
  if (!error.code.trim()) throw new Error("fixture error code is required");
  if (!error.message.trim()) throw new Error("fixture error message is required");
  if (error.code.length > MAX_FIELD_LENGTH || error.message.length > MAX_FIELD_LENGTH) {
    throw new Error("fixture error field exceeds the size limit");
  }
  if (typeof error.retryable !== "boolean") throw new Error("fixture error retryable must be boolean");
}

function validateEvent(event: WitnessEvent): void {
  if (!event.id.trim()) throw new Error("event id is required");
  if (event.id.length > MAX_FIELD_LENGTH || event.value.length > MAX_FIELD_LENGTH) {
    throw new Error("event field exceeds the size limit");
  }
  if (!Number.isInteger(event.ledger) || event.ledger < 0) throw new Error("event ledger is invalid");
  if (event.topic.length > 4) throw new Error("event topic count exceeds getEvents maximum");
  for (const topic of event.topic) {
    if (!topic.trim()) throw new Error("event topic must be non-empty");
    if (topic.length > MAX_FIELD_LENGTH) throw new Error("event topic exceeds the size limit");
  }
  if (!event.value.trim()) throw new Error("event value is required");
}

