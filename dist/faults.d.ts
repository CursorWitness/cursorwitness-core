import type { FaultController, FaultPoint } from "./contracts.js";
export declare class FaultInjectionError extends Error {
    readonly name = "FaultInjectionError";
    readonly point: FaultPoint;
    constructor(point: FaultPoint);
}
/** One-shot deterministic fault plan. A restart should create a new controller. */
export declare class DeterministicFaultController implements FaultController {
    private readonly pending;
    constructor(points?: readonly FaultPoint[]);
    get remainingPoints(): readonly FaultPoint[];
    hit(point: FaultPoint): void;
}
