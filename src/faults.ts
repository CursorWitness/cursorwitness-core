import type { FaultController, FaultPoint } from "./contracts.js";

export class FaultInjectionError extends Error {
  readonly name = "FaultInjectionError";
  readonly point: FaultPoint;

  constructor(point: FaultPoint) {
    super(`deterministic fault injected at ${point}`);
    this.point = point;
  }
}

/** One-shot deterministic fault plan. A restart should create a new controller. */
export class DeterministicFaultController implements FaultController {
  private readonly pending: Set<FaultPoint>;

  constructor(points: readonly FaultPoint[] = []) {
    if (new Set(points).size !== points.length) {
      throw new Error("fault plan cannot contain duplicate points");
    }
    this.pending = new Set(points);
  }

  get remainingPoints(): readonly FaultPoint[] {
    return [...this.pending];
  }

  hit(point: FaultPoint): void {
    if (!this.pending.delete(point)) return;
    throw new FaultInjectionError(point);
  }
}
