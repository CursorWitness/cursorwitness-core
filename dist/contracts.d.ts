/** Stable domain contracts for CursorWitness adapters and scenario oracles. */
export type EventType = "contract" | "system";
/** Provider continuation values are opaque and must not be decoded or manufactured. */
export type OpaqueCursor = string & {
    readonly __opaqueCursor: unique symbol;
};
/** Boundary cast for fixture/config input; the value is not inspected or transformed. */
export declare function asOpaqueCursor(value: string): OpaqueCursor;
export interface WitnessEvent {
    readonly id: string;
    readonly type: EventType;
    readonly ledger: number;
    readonly ledgerClosedAt?: string;
    readonly contractId?: string;
    readonly transactionIndex?: number;
    readonly operationIndex?: number;
    readonly topic: readonly string[];
    readonly value: string;
    readonly txHash?: string;
}
export interface GetEventsRequest {
    readonly startLedger?: number;
    readonly endLedger?: number;
    readonly filters?: readonly unknown[];
    readonly pagination?: {
        readonly cursor?: OpaqueCursor;
        readonly limit?: number;
    };
    readonly xdrFormat?: "base64" | "json";
}
export interface GetEventsResponse {
    readonly events: readonly WitnessEvent[];
    readonly latestLedger: number;
    readonly oldestLedger: number;
    readonly latestLedgerCloseTime?: string;
    readonly oldestLedgerCloseTime?: string;
    /** Opaque continuation token. The core must never decode or manufacture it. */
    readonly cursor?: OpaqueCursor;
}
/** Consumers may persist a cursor, ledger, event ID, or compound application state. */
export type ApplicationCheckpoint = Readonly<Record<string, unknown>> & {
    readonly kind: string;
};
/** Built-in examples; adapters may define additional checkpoint kinds. */
export type BuiltInCheckpoint = (ApplicationCheckpoint & {
    readonly kind: "cursor";
    readonly cursor?: OpaqueCursor;
    readonly lastEventId?: string;
    readonly complete: boolean;
}) | (ApplicationCheckpoint & {
    readonly kind: "ledger";
    readonly nextLedger: number;
    readonly complete: boolean;
});
export type ObservationPersistence = "test-double" | "file" | "database" | "adapter-declared";
export interface DeliveryObservation {
    readonly eventId: string;
    readonly attempt: number;
}
export interface HandlerObservation {
    readonly eventId: string;
    readonly attempt: number;
}
export interface EffectAttemptObservation {
    readonly effectKey: string;
    readonly eventId: string;
    readonly attempt: number;
}
export interface EffectCommitObservation {
    readonly effectKey: string;
    readonly eventId: string;
    readonly attempt: number;
    readonly persistence: ObservationPersistence;
}
export type CheckpointEvidence<TCheckpoint> = {
    readonly availability: "observed";
    readonly value: TCheckpoint;
} | {
    readonly availability: "unavailable";
    readonly reason: "not-exposed" | "not-readable" | "redacted";
};
export interface CheckpointObservation<TCheckpoint = unknown> {
    readonly operation: "load" | "save";
    readonly outcome: "loaded" | "saved" | "missing" | "failed";
    /** Makes absent checkpoint evidence distinguishable from a missing property. */
    readonly evidence: CheckpointEvidence<TCheckpoint>;
    readonly persistence: ObservationPersistence;
}
export type FaultPoint = "before-handler" | "after-handler" | "before-effect-attempt" | "after-effect-commit" | "before-checkpoint-save" | "after-checkpoint-save";
export interface ConsumerAdapter<TCheckpoint = ApplicationCheckpoint> {
    readonly id: string;
    readonly version: string;
    run(context: ConsumerContext<TCheckpoint>): Promise<void>;
}
export interface ConsumerContext<TCheckpoint = ApplicationCheckpoint> {
    readonly rpc: GetEventsPort;
    readonly checkpoint: CheckpointStore<TCheckpoint>;
    readonly effects: EffectSink;
    readonly observations: ObservationRecorder<TCheckpoint>;
    readonly faults: FaultController;
}
export interface GetEventsPort {
    call(request: GetEventsRequest): Promise<GetEventsResponse>;
}
export interface CheckpointStore<TCheckpoint = ApplicationCheckpoint> {
    readonly persistence: ObservationPersistence;
    load(): Promise<TCheckpoint | undefined>;
    save(value: TCheckpoint): Promise<void>;
}
export interface EffectSink {
    apply(effectKey: string, event: WitnessEvent): Promise<void>;
}
export interface ObservationRecorder<TCheckpoint = unknown> {
    delivery(observation: DeliveryObservation): void;
    handler(observation: HandlerObservation): void;
    effectAttempt(observation: EffectAttemptObservation): void;
    effectCommit(observation: EffectCommitObservation): void;
    checkpoint(observation: CheckpointObservation<TCheckpoint>): void;
}
export interface FaultController {
    hit(point: FaultPoint): void;
}
