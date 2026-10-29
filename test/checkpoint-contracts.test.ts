import assert from "node:assert/strict";
import test from "node:test";
import { asOpaqueCursor } from "../src/contracts.ts";
import {
  asApplicationCheckpoint,
  cursorFromCheckpoint,
  isBuiltInCheckpoint,
  validateApplicationCheckpoint,
} from "../src/checkpoint-validation.ts";

test("preserves an opaque cursor exactly without interpreting it", () => {
  const raw = "provider-token/opaque?cursor=not-for-decoding";
  const cursor = asOpaqueCursor(raw);
  assert.equal(cursor, raw);
});

test("validates built-in checkpoint structure without requiring a cursor", () => {
  const ledgerCheckpoint = { kind: "ledger", nextLedger: 42, complete: false } as const;
  assert.deepEqual(validateApplicationCheckpoint(ledgerCheckpoint), {
    status: "valid",
    verifiability: "verified",
  });
  assert.equal(isBuiltInCheckpoint(ledgerCheckpoint), true);
});

test("accepts custom application checkpoint shapes as explicitly unverified", () => {
  const custom = asApplicationCheckpoint({
    kind: "consumer-compound",
    cursor: "opaque-value",
    lastCommittedEffect: "effect-7",
  });
  assert.deepEqual(validateApplicationCheckpoint(custom), {
    status: "valid",
    verifiability: "unverified",
  });
});

test("rejects malformed built-in checkpoints", () => {
  assert.deepEqual(validateApplicationCheckpoint({ kind: "cursor", complete: "no" }), {
    status: "invalid",
    reason: "cursor checkpoint complete must be boolean",
  });
  assert.deepEqual(validateApplicationCheckpoint({ kind: "ledger", nextLedger: -1, complete: false }), {
    status: "invalid",
    reason: "ledger checkpoint nextLedger must be a non-negative safe integer",
  });
});

test("extracts a cursor only from a verified cursor checkpoint", () => {
  const checkpoint = {
    kind: "cursor",
    cursor: asOpaqueCursor("opaque-next"),
    complete: false,
  } as const;
  assert.equal(cursorFromCheckpoint(checkpoint), "opaque-next");
});
