/** Recursively sorts object keys while preserving array order. */
export function canonicalizeJson(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string")
        return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new Error("semantic JSON cannot contain a non-finite number");
        return value;
    }
    if (Array.isArray(value))
        return value.map(canonicalizeJson);
    if (typeof value === "object") {
        const entries = Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, canonicalizeJson(entry)]);
        return Object.fromEntries(entries);
    }
    throw new Error(`semantic JSON cannot contain ${typeof value}`);
}
export function canonicalJson(value) {
    return JSON.stringify(canonicalizeJson(value));
}
/** Report v1 contains only semantic fields, so canonicalization is sufficient normalization. */
export function normalizeSemanticReport(report) {
    return canonicalizeJson(report);
}
