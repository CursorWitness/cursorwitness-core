import type { GetEventsPort, GetEventsRequest, GetEventsResponse } from "./contracts.js";
import type { FixtureErrorClass, FixturePage, GetEventsFixtureV1 } from "./fixture.js";

export interface FakeGetEventsOptions {
  readonly initialRequestKey?: string;
  readonly maxCalls?: number;
}

export class FixtureRpcError extends Error {
  readonly name = "FixtureRpcError";
  readonly errorClass: FixtureErrorClass;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestKey: string;

  constructor(
    errorClass: FixtureErrorClass,
    code: string,
    message: string,
    retryable: boolean,
    requestKey: string,
  ) {
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
export class FixtureGetEventsPort implements GetEventsPort {
  private readonly pagesByKey: ReadonlyMap<string, FixturePage>;
  private readonly initialRequestKey: string;
  private readonly maxCalls: number;
  private callCountValue = 0;
  private readonly requestsValue: GetEventsRequest[] = [];

  constructor(fixture: GetEventsFixtureV1, options: FakeGetEventsOptions = {}) {
    this.initialRequestKey = options.initialRequestKey ?? "initial";
    this.maxCalls = options.maxCalls ?? 1_000;
    if (!Number.isSafeInteger(this.maxCalls) || this.maxCalls < 1) {
      throw new Error("fake getEvents maxCalls must be a positive safe integer");
    }
    const pages = new Map<string, FixturePage>();
    for (const page of fixture.pages) {
      if (pages.has(page.requestKey)) throw new Error(`duplicate fixture requestKey: ${page.requestKey}`);
      pages.set(page.requestKey, page);
    }
    if (!pages.has(this.initialRequestKey)) {
      throw new Error(`fixture initial requestKey not found: ${this.initialRequestKey}`);
    }
    this.pagesByKey = pages;
  }

  get callCount(): number {
    return this.callCountValue;
  }

  get requests(): readonly GetEventsRequest[] {
    return this.requestsValue;
  }

  async call(request: GetEventsRequest): Promise<GetEventsResponse> {
    this.callCountValue += 1;
    this.requestsValue.push(request);
    if (this.callCountValue > this.maxCalls) {
      throw new FixtureRpcError(
        "invalid-request",
        "FIXTURE_CALL_LIMIT",
        `fixture getEvents call limit ${this.maxCalls} exceeded`,
        false,
        this.requestKeyFor(request),
      );
    }

    const requestKey = this.requestKeyFor(request);
    const page = this.pagesByKey.get(requestKey);
    if (page === undefined) {
      throw new FixtureRpcError(
        "invalid-request",
        "UNKNOWN_CURSOR",
        `fixture has no page for request key ${requestKey}`,
        false,
        requestKey,
      );
    }
    this.assertDeclaredRequestMatches(page, request);
    if (page.error !== undefined) {
      throw new FixtureRpcError(
        page.error.class,
        page.error.code,
        page.error.message,
        page.error.retryable,
        requestKey,
      );
    }
    if (page.response === undefined) throw new Error(`fixture page ${requestKey} has no response`);
    return page.response;
  }

  private requestKeyFor(request: GetEventsRequest): string {
    const cursor = request.pagination?.cursor;
    return cursor === undefined ? this.initialRequestKey : cursor;
  }

  private assertDeclaredRequestMatches(page: FixturePage, actual: GetEventsRequest): void {
    if (page.request === undefined) return;
    if (stableRequestJson(page.request) !== stableRequestJson(actual)) {
      throw new FixtureRpcError(
        "invalid-request",
        "REQUEST_MISMATCH",
        `request does not match fixture page ${page.requestKey}`,
        false,
        page.requestKey,
      );
    }
  }
}

function stableRequestJson(value: GetEventsRequest): string {
  const sort = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sort);
    if (entry !== null && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return entry;
  };
  return JSON.stringify(sort(value));
}

