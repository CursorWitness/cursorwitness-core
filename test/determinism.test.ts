import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalizeJson } from "../src/determinism.ts";

test("canonical JSON sorts object keys but preserves array order", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: true, b: "x" }, list: ["second", "first"] }),
    '{"a":{"b":"x","y":true},"list":["second","first"],"z":1}',
  );
});

test("canonical JSON rejects values that cannot be semantic report data", () => {
  assert.throws(() => canonicalizeJson({ value: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalizeJson({ value: undefined }), /undefined/);
  assert.throws(() => canonicalizeJson({ value: () => undefined }), /function/);
});
