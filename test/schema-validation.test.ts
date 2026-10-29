import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";

async function loadSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(`../schemas/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;
}

function formatErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message ?? "schema violation"}`)
    .join("; ");
}

function compile(schema: Record<string, unknown>): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(schema);
}

test("Ajv validates a complete fixture document against fixture.v1", async () => {
  const validate = compile(await loadSchema("fixture-v1.schema.json"));
  const fixture = {
    schemaVersion: "fixture.v1",
    id: "schema-validation",
    rpcMethod: "getEvents",
    provenance: "synthetic",
    pages: [{
      requestKey: "initial",
      request: { pagination: { limit: 10 } },
      response: {
        events: [],
        oldestLedger: 100,
        latestLedger: 105,
        cursor: "opaque-next",
      },
    }, {
      requestKey: "opaque-next",
      response: {
        events: [{
          id: "event-1",
          type: "contract",
          ledger: 101,
          topic: ["AAA="],
          value: "AAA=",
        }],
        oldestLedger: 100,
        latestLedger: 105,
      },
    }],
  };
  assert.equal(validate(fixture), true, formatErrors(validate));
});

test("Ajv rejects a fixture page with response and error together", async () => {
  const validate = compile(await loadSchema("fixture-v1.schema.json"));
  const invalid = {
    schemaVersion: "fixture.v1",
    id: "invalid-page",
    rpcMethod: "getEvents",
    provenance: "synthetic",
    pages: [{
      requestKey: "page-1",
      response: { events: [], oldestLedger: 1, latestLedger: 1 },
      error: { class: "transport", code: "TIMEOUT", message: "timeout", retryable: true },
    }],
  };
  assert.equal(validate(invalid), false);
  assert.match(formatErrors(validate), /pages\/0/);
});

test("Ajv enforces the runtime fixture resource limits", async () => {
  const validate = compile(await loadSchema("fixture-v1.schema.json"));
  const oversizedPages = {
    schemaVersion: "fixture.v1",
    id: "oversized-pages",
    rpcMethod: "getEvents",
    provenance: "synthetic",
    pages: Array.from({ length: 1_025 }, (_, index) => ({
      requestKey: `page-${index}`,
      response: { events: [], oldestLedger: 1, latestLedger: 1 },
    })),
  };
  assert.equal(validate(oversizedPages), false);
  assert.match(formatErrors(validate), /must NOT have more than 1024 items/);

  const oversizedField = {
    schemaVersion: "fixture.v1",
    id: "oversized-field",
    rpcMethod: "getEvents",
    provenance: "synthetic",
    pages: [{
      requestKey: "initial",
      response: {
        events: [{ id: "e", type: "contract", ledger: 1, topic: ["topic"], value: "x".repeat(4_097) }],
        oldestLedger: 1,
        latestLedger: 1,
      },
    }],
  };
  assert.equal(validate(oversizedField), false);
  assert.match(formatErrors(validate), /must NOT have more than 4096 characters/);
});

test("Ajv validates a semantic report and rejects incomplete trace entries", async () => {
  const validate = compile(await loadSchema("report-v1.schema.json"));
  const report = {
    schemaVersion: "report.v1",
    scenarioId: "schema-validation",
    status: "pass",
    evidenceMode: "simulated-offline",
    assertions: [{
      id: "all-events-observed",
      status: "pass",
      message: "all expected events were observed",
      evidenceRefs: ["trace-0"],
    }],
    summary: {
      expectedEventCount: 1,
      observedEventCount: 1,
      deliveryCount: 1,
      handlerInvocationCount: 1,
      effectAttemptCount: 1,
      committedEffectCount: 1,
      uniqueCommittedEffectCount: 1,
    },
    trace: [{ sequence: 0, kind: "delivery", eventId: "event-1", attempt: 1 }],
  };
  assert.equal(validate(report), true, formatErrors(validate));

  const incomplete = structuredClone(report) as { trace: Array<Record<string, unknown>> };
  incomplete.trace[0] = { sequence: 0, kind: "delivery", attempt: 1 };
  assert.equal(validate(incomplete), false);
  assert.match(formatErrors(validate), /eventId|trace/);
});

test("Ajv reports actionable paths for malformed report summaries", async () => {
  const validate = compile(await loadSchema("report-v1.schema.json"));
  const invalid = {
    schemaVersion: "report.v1",
    scenarioId: "bad-summary",
    status: "pass",
    evidenceMode: "simulated-offline",
    assertions: [],
    summary: {
      expectedEventCount: -1,
      observedEventCount: 0,
      deliveryCount: 0,
      handlerInvocationCount: 0,
      effectAttemptCount: 0,
      committedEffectCount: 0,
      uniqueCommittedEffectCount: 0,
    },
    trace: [],
  };
  assert.equal(validate(invalid), false);
  assert.match(formatErrors(validate), /summary\/expectedEventCount/);
});
