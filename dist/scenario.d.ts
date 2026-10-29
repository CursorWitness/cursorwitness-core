import type { GetEventsPort, GetEventsRequest, GetEventsResponse, ObservationPersistence, ObservationRecorder, WitnessEvent } from "./contracts.js";
import type { ObservationEntry } from "./observations.js";
import type { ExpectedScenario } from "./oracle.js";
import type { ReportV1, ReportEvidenceMode } from "./report.js";
import type { evaluateOracle } from "./oracle.js";
import type { reportFromOracle } from "./report.js";
export interface PaginationConsumer {
    /** Decide whether to request another page. The cursor is available only as opaque provider data. */
    continueAfterPage(response: GetEventsResponse, pageIndex: number): boolean;
    handleEvent(event: WitnessEvent, attempt: number): Promise<void> | void;
    effectKey?(event: WitnessEvent, attempt: number): string;
    applyEffect?(event: WitnessEvent, attempt: number): Promise<EffectOutcome> | EffectOutcome;
}
export interface EffectOutcome {
    readonly effectKey: string;
    readonly committed: boolean;
    readonly persistence?: ObservationPersistence;
}
export interface PaginationScenarioOptions {
    readonly expected: ExpectedScenario;
    readonly rpc: GetEventsPort;
    readonly consumer: PaginationConsumer;
    readonly recorder: ScenarioObservationRecorder;
    readonly evaluate: typeof evaluateOracle;
    readonly buildReport: typeof reportFromOracle;
    readonly evidenceMode?: ReportEvidenceMode;
    readonly initialRequest?: GetEventsRequest;
    readonly maxPages?: number;
}
export interface PaginationScenarioResult {
    readonly report: ReportV1;
    readonly terminalPageObserved: boolean;
    readonly pagesObserved: number;
    readonly observations: readonly ObservationEntry[];
}
export interface ScenarioObservationRecorder extends ObservationRecorder {
    snapshot(): readonly ObservationEntry[];
}
/**
 * Runs one deterministic getEvents pagination attempt. Terminal state comes
 * only from a response without a continuation cursor; an empty page with a
 * cursor remains non-terminal evidence.
 */
export declare function runPaginationScenario(options: PaginationScenarioOptions): Promise<PaginationScenarioResult>;
