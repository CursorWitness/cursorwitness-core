export class FaultInjectionError extends Error {
    name = "FaultInjectionError";
    point;
    constructor(point) {
        super(`deterministic fault injected at ${point}`);
        this.point = point;
    }
}
/** One-shot deterministic fault plan. A restart should create a new controller. */
export class DeterministicFaultController {
    pending;
    constructor(points = []) {
        if (new Set(points).size !== points.length) {
            throw new Error("fault plan cannot contain duplicate points");
        }
        this.pending = new Set(points);
    }
    get remainingPoints() {
        return [...this.pending];
    }
    hit(point) {
        if (!this.pending.delete(point))
            return;
        throw new FaultInjectionError(point);
    }
}
