import assert from "node:assert/strict";
import test from "node:test";
import { FixtureRpcError } from "../src/fake-rpc.ts";
import { reportFromProviderError } from "../src/report.ts";
import { classifyProviderError, evaluateProviderError } from "../src/provider-errors.ts";

test("history-unavailable is classified and cannot be reported as recovered", () => {
  const evidence = classifyProviderError(new FixtureRpcError("history-unavailable", "STALE_CURSOR", "history unavailable", false, "cursor"));
  const evaluation = evaluateProviderError(
    { class: "history-unavailable", retryable: false, recovery: "surface-error" },
    evidence,
  );
  assert.equal(evidence.class, "history-unavailable");
  assert.equal(evaluation.status, "pass");
  assert.equal(evaluation.assertions.find((assertion) => assertion.id === "history-unavailable-not-recovered")?.status, "pass");
  const report = reportFromProviderError("history", evidence, evaluation.status, evaluation.assertions);
  assert.equal(report.trace[0]?.kind, "provider-error");
  assert.equal(report.status, "pass");
});

test("transient transport failure remains distinct and retry evidence can be unverified", () => {
  const evidence = classifyProviderError(new FixtureRpcError("transport", "TIMEOUT", "timeout", true, "initial"));
  const evaluation = evaluateProviderError(
    { class: "transport", retryable: true, recovery: "retry-then-recover" },
    evidence,
  );
  assert.equal(evaluation.status, "unverified");
  assert.equal(evaluation.assertions.find((assertion) => assertion.id === "transport-error-distinct-from-retention")?.status, "pass");
  assert.equal(evaluation.assertions.find((assertion) => assertion.id === "transport-retry-observed")?.status, "unverified");
});

test("invalid checkpoint request is not classified as history retention loss", () => {
  const evidence = classifyProviderError(new FixtureRpcError("invalid-request", "UNKNOWN_CURSOR", "unknown cursor", false, "bad"));
  const evaluation = evaluateProviderError(
    { class: "invalid-request", retryable: false, recovery: "surface-error" },
    evidence,
  );
  assert.equal(evaluation.status, "pass");
  assert.equal(evaluation.assertions.find((assertion) => assertion.id === "invalid-checkpoint-distinct-from-retention")?.status, "pass");
});

test("classification is conservative for arbitrary thrown values", () => {
  const evidence = classifyProviderError(new Error("not an RPC error"));
  assert.deepEqual(evidence, { class: "unknown", code: "UNKNOWN_ERROR", retryable: false, attempts: 1 });
});
