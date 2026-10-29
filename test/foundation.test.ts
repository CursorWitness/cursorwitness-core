import assert from "node:assert/strict";
import test from "node:test";
import { asOpaqueCursor } from "../src/contracts.ts";
import { validateFixture, type GetEventsFixtureV1 } from "../src/fixture.ts";

const fixture: GetEventsFixtureV1 = {
  schemaVersion: "fixture.v1",
  id: "foundation-empty-page",
  rpcMethod: "getEvents",
  provenance: "synthetic",
  pages: [
    {
      requestKey: "initial",
      response: {
        events: [],
        cursor: asOpaqueCursor("opaque-next"),
        oldestLedger: 100,
        latestLedger: 105,
      },
    },
    {
      requestKey: "opaque-next",
      response: {
        events: [
          {
            id: "evt-1",
            type: "contract",
            ledger: 101,
            topic: ["AAA="],
            value: "AAA=",
          },
        ],
        oldestLedger: 100,
        latestLedger: 105,
      },
    },
  ],
};

test("accepts a synthetic getEvents fixture with an empty continuation page", () => {
  assert.doesNotThrow(() => validateFixture(fixture));
});

test("rejects a fixture with an invalid ledger range", () => {
  const response = fixture.pages[0]!.response;
  if (response === undefined) throw new Error("fixture setup missing response");
  const invalid: GetEventsFixtureV1 = {
    ...fixture,
    pages: fixture.pages.map((page, index) => index === 0
      ? { requestKey: page.requestKey, response: { ...response, latestLedger: 99 } }
      : page),
  };
  assert.throws(() => validateFixture(invalid), /latestLedger/);
});

test("accepts a versioned fixture page containing a classified provider error", () => {
  const errorFixture: GetEventsFixtureV1 = {
    schemaVersion: "fixture.v1",
    id: "foundation-history-error",
    rpcMethod: "getEvents",
    provenance: "synthetic",
    pages: [{
      requestKey: "stale-checkpoint",
      error: {
        class: "history-unavailable",
        code: "HISTORY_UNAVAILABLE",
        message: "requested history is outside retention",
        retryable: false,
      },
    }],
  };
  assert.doesNotThrow(() => validateFixture(errorFixture));
});

test("rejects a fixture page that contains both a response and an error", () => {
  const response = fixture.pages[0]!.response;
  if (response === undefined) throw new Error("fixture setup missing response");
  const invalid = {
    ...fixture,
    pages: [{
      requestKey: fixture.pages[0]!.requestKey,
      response,
      error: {
        class: "transport" as const,
        code: "TIMEOUT",
        message: "transport timeout",
        retryable: true,
      },
    }],
  };
  assert.throws(() => validateFixture(invalid), /exactly one response or error/);
});

