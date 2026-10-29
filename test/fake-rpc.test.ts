import assert from "node:assert/strict";
import test from "node:test";
import { FixtureGetEventsPort, FixtureRpcError } from "../src/fake-rpc.ts";
import { asOpaqueCursor } from "../src/contracts.ts";
import type { GetEventsFixtureV1 } from "../src/fixture.ts";

const event = {
  id: "event-1",
  type: "contract" as const,
  ledger: 101,
  topic: ["AAA="],
  value: "AAA=",
};

function fixture(): GetEventsFixtureV1 {
  return {
    schemaVersion: "fixture.v1",
    id: "fake-rpc",
    rpcMethod: "getEvents",
    provenance: "synthetic",
    pages: [
      {
        requestKey: "initial",
        response: { events: [], oldestLedger: 100, latestLedger: 105, cursor: asOpaqueCursor("token-A") },
      },
      {
        requestKey: "token-A",
        response: { events: [event], oldestLedger: 100, latestLedger: 105 },
      },
    ],
  };
}

test("follows an opaque cursor after an empty page", async () => {
  const port = new FixtureGetEventsPort(fixture());
  const first = await port.call({ startLedger: 100 });
  assert.deepEqual(first.events, []);
  assert.equal(first.cursor, "token-A");
  const second = await port.call({ pagination: { cursor: first.cursor } });
  assert.deepEqual(second.events, [event]);
  assert.equal(port.callCount, 2);
});

test("does not decode cursor contents and rejects undeclared routes", async () => {
  const port = new FixtureGetEventsPort(fixture());
  await assert.rejects(
    port.call({ pagination: { cursor: asOpaqueCursor("token-A/decoded?no") } }),
    (error: unknown) => error instanceof FixtureRpcError &&
      error.errorClass === "invalid-request" && error.code === "UNKNOWN_CURSOR",
  );
});

test("preserves history and transport error classifications", async () => {
  const historyPort = new FixtureGetEventsPort({
    ...fixture(),
    pages: [{
      requestKey: "initial",
      error: { class: "history-unavailable", code: "STALE", message: "history expired", retryable: false },
    }],
  });
  await assert.rejects(historyPort.call({}), (error: unknown) => error instanceof FixtureRpcError &&
    error.errorClass === "history-unavailable" && error.retryable === false);

  const transportPort = new FixtureGetEventsPort({
    ...fixture(),
    pages: [{
      requestKey: "initial",
      error: { class: "transport", code: "TIMEOUT", message: "temporary timeout", retryable: true },
    }],
  });
  await assert.rejects(transportPort.call({}), (error: unknown) => error instanceof FixtureRpcError &&
    error.errorClass === "transport" && error.retryable === true);
});

test("enforces a bounded call count", async () => {
  const port = new FixtureGetEventsPort(fixture(), { maxCalls: 1 });
  await port.call({});
  await assert.rejects(port.call({}), (error: unknown) => error instanceof FixtureRpcError &&
    error.code === "FIXTURE_CALL_LIMIT");
});

test("checks declared request metadata without changing opaque lookup", async () => {
  const withRequest: GetEventsFixtureV1 = {
    ...fixture(),
    pages: [{
      requestKey: "initial",
      request: { startLedger: 100 },
      response: { events: [], oldestLedger: 100, latestLedger: 105 },
    }],
  };
  const port = new FixtureGetEventsPort(withRequest);
  await assert.rejects(port.call({ startLedger: 99 }), (error: unknown) => {
    return error instanceof FixtureRpcError && error.code === "REQUEST_MISMATCH";
  });
});

test("supports a non-default initial request key and a terminal page", async () => {
  const customFixture: GetEventsFixtureV1 = {
    ...fixture(),
    pages: [{
      requestKey: "window-start",
      response: { events: [event], oldestLedger: 100, latestLedger: 105 },
    }],
  };
  const port = new FixtureGetEventsPort(customFixture, { initialRequestKey: "window-start" });
  const response = await port.call({ startLedger: 100, endLedger: 106 });
  assert.deepEqual(response.events, [event]);
  assert.equal(response.cursor, undefined);
});

test("replays duplicate requests deterministically without deduplicating delivery", async () => {
  const port = new FixtureGetEventsPort(fixture());
  const first = await port.call({});
  const second = await port.call({});
  assert.deepEqual(second, first);
  assert.equal(port.callCount, 2);
  assert.equal(port.requests.length, 2);
});

test("rejects malformed route configuration before playback", () => {
  assert.throws(() => new FixtureGetEventsPort({
    ...fixture(),
    pages: [
      { requestKey: "initial", response: { events: [], oldestLedger: 1, latestLedger: 1 } },
      { requestKey: "initial", response: { events: [], oldestLedger: 1, latestLedger: 1 } },
    ],
  }), /duplicate fixture requestKey/);
  assert.throws(() => new FixtureGetEventsPort(fixture(), { initialRequestKey: "missing" }), /initial requestKey not found/);
});
