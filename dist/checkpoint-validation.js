/** Validates defensible structure while accepting custom application checkpoint kinds as unverified. */
export function validateApplicationCheckpoint(value) {
    if (!isRecord(value) || typeof value.kind !== "string" || value.kind.trim() === "") {
        return { status: "invalid", reason: "checkpoint.kind must be a non-empty string" };
    }
    if (value.kind === "cursor")
        return validateCursorCheckpoint(value);
    if (value.kind === "ledger")
        return validateLedgerCheckpoint(value);
    return { status: "valid", verifiability: "unverified" };
}
function validateCursorCheckpoint(value) {
    if (value.cursor !== undefined && typeof value.cursor !== "string") {
        return { status: "invalid", reason: "cursor checkpoint cursor must be an opaque string" };
    }
    if (typeof value.complete !== "boolean") {
        return { status: "invalid", reason: "cursor checkpoint complete must be boolean" };
    }
    return { status: "valid", verifiability: "verified" };
}
function validateLedgerCheckpoint(value) {
    if (!Number.isSafeInteger(value.nextLedger) || value.nextLedger < 0) {
        return { status: "invalid", reason: "ledger checkpoint nextLedger must be a non-negative safe integer" };
    }
    if (typeof value.complete !== "boolean") {
        return { status: "invalid", reason: "ledger checkpoint complete must be boolean" };
    }
    return { status: "valid", verifiability: "verified" };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isBuiltInCheckpoint(value) {
    const result = validateApplicationCheckpoint(value);
    return result.status === "valid" && result.verifiability === "verified";
}
export function cursorFromCheckpoint(value) {
    return value.kind === "cursor" ? value.cursor : undefined;
}
export function asApplicationCheckpoint(value) {
    return value;
}
