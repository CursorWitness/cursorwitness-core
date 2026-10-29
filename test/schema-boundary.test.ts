import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { semanticReport, type ReportV1 } from "../src/report.ts";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as Record<string, unknown>;
}

test("fixture and report schemas are explicitly versioned", async () => {
  const fixtureSchema = await readJson("../schemas/fixture-v1.schema.json");
  const reportSchema = await readJson("../schemas/report-v1.schema.json");
  assert.equal(fixtureSchema["$id"], "https://cursorwitness.dev/schemas/fixture-v1.schema.json");
  assert.equal(reportSchema["$id"], "https://cursorwitness.dev/schemas/report-v1.schema.json");
  assert.equal(((fixtureSchema.properties! as Record<string, { const?: string }>).schemaVersion!).const, "fixture.v1");
  assert.equal(((reportSchema.properties! as Record<string, { const?: string }>).schemaVersion!).const, "report.v1");
});

test("semantic reports contain no runtime or environment metadata", () => {
  const report: ReportV1 = {
    schemaVersion: "report.v1",
    scenarioId: "schema-boundary",
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
    trace: [{
      sequence: 0,
      kind: "delivery",
      eventId: "event-1",
      attempt: 1,
    }],
  };
  assert.deepEqual(semanticReport(report), report);
  assert.equal("timestamp" in report, false);
  assert.equal("absolutePath" in report, false);
  assert.equal("processId" in report, false);
  assert.equal("environment" in report, false);
});
