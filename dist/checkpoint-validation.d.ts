import type { ApplicationCheckpoint, BuiltInCheckpoint, OpaqueCursor } from "./contracts.js";
export type CheckpointValidation = {
    readonly status: "valid";
    readonly verifiability: "verified" | "unverified";
} | {
    readonly status: "invalid";
    readonly reason: string;
};
/** Validates defensible structure while accepting custom application checkpoint kinds as unverified. */
export declare function validateApplicationCheckpoint(value: unknown): CheckpointValidation;
export declare function isBuiltInCheckpoint(value: unknown): value is BuiltInCheckpoint;
export declare function cursorFromCheckpoint(value: BuiltInCheckpoint): OpaqueCursor | undefined;
export declare function asApplicationCheckpoint(value: Record<string, unknown>): ApplicationCheckpoint;
