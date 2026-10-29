import type { ApplicationCheckpoint, BuiltInCheckpoint, OpaqueCursor } from "./contracts.js";

export type CheckpointValidation =
  | { readonly status: "valid"; readonly verifiability: "verified" | "unverified" }
  | { readonly status: "invalid"; readonly reason: string };

/** Validates defensible structure while accepting custom application checkpoint kinds as unverified. */
export function validateApplicationCheckpoint(value: unknown): CheckpointValidation {
  if (!isRecord(value) || typeof value.kind !== "string" || value.kind.trim() === "") {
    return { status: "invalid", reason: "checkpoint.kind must be a non-empty string" };
  }
  if (value.kind === "cursor") return validateCursorCheckpoint(value);
  if (value.kind === "ledger") return validateLedgerCheckpoint(value);
  return { status: "valid", verifiability: "unverified" };
}

function validateCursorCheckpoint(value: Record<string, unknown>): CheckpointValidation {
  if (value.cursor !== undefined && typeof value.cursor !== "string") {
    return { status: "invalid", reason: "cursor checkpoint cursor must be an opaque string" };
  }
  if (typeof value.complete !== "boolean") {
    return { status: "invalid", reason: "cursor checkpoint complete must be boolean" };
  }
  return { status: "valid", verifiability: "verified" };
}

function validateLedgerCheckpoint(value: Record<string, unknown>): CheckpointValidation {
  if (!Number.isSafeInteger(value.nextLedger) || (value.nextLedger as number) < 0) {
    return { status: "invalid", reason: "ledger checkpoint nextLedger must be a non-negative safe integer" };
  }
  if (typeof value.complete !== "boolean") {
    return { status: "invalid", reason: "ledger checkpoint complete must be boolean" };
  }
  return { status: "valid", verifiability: "verified" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isBuiltInCheckpoint(value: unknown): value is BuiltInCheckpoint {
  const result = validateApplicationCheckpoint(value);
  return result.status === "valid" && result.verifiability === "verified";
}

export function cursorFromCheckpoint(value: BuiltInCheckpoint): OpaqueCursor | undefined {
  return value.kind === "cursor" ? value.cursor : undefined;
}

export function asApplicationCheckpoint(value: Record<string, unknown>): ApplicationCheckpoint {
  return value as ApplicationCheckpoint;
}
