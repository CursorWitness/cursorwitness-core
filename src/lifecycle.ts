import type { ConsumerAdapter, ConsumerContext } from "./contracts.js";
import type { ObservationEntry } from "./observations.js";

export interface ObservationSnapshotSource<TCheckpoint = unknown> {
  snapshot(): readonly ObservationEntry<TCheckpoint>[];
}

export type ConsumerRunResult<TCheckpoint = unknown> =
  | {
      readonly status: "completed";
      readonly observations: readonly ObservationEntry<TCheckpoint>[];
    }
  | {
      readonly status: "failed";
      readonly error: unknown;
      readonly observations: readonly ObservationEntry<TCheckpoint>[];
    };

/** Executes an adapter and returns lifecycle status plus evidence captured so far. */
export async function executeConsumer<TCheckpoint>(
  adapter: ConsumerAdapter<TCheckpoint>,
  context: ConsumerContext<TCheckpoint>,
  source: ObservationSnapshotSource<TCheckpoint>,
): Promise<ConsumerRunResult<TCheckpoint>> {
  try {
    await adapter.run(context);
    return { status: "completed", observations: source.snapshot() };
  } catch (error: unknown) {
    return { status: "failed", error, observations: source.snapshot() };
  }
}
