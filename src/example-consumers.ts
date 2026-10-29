import type { GetEventsResponse, WitnessEvent } from "./contracts.js";
import type { PaginationConsumer } from "./scenario.js";

/** Correct reference behavior: an empty page is non-terminal when it has a cursor. */
export function createReferencePaginationConsumer(): PaginationConsumer {
  return {
    continueAfterPage(response: GetEventsResponse): boolean {
      return response.cursor !== undefined;
    },
    handleEvent(_event: WitnessEvent): void {},
  };
}

/** Deliberately broken: treats an empty page as completion even when a cursor remains. */
export function createStopOnEmptyConsumer(): PaginationConsumer {
  return {
    continueAfterPage(response: GetEventsResponse): boolean {
      return response.events.length > 0 && response.cursor !== undefined;
    },
    handleEvent(_event: WitnessEvent): void {},
  };
}

/** Correct idempotent effect example: repeated delivery attempts do not repeat the commit. */
export function createIdempotentEffectConsumer(): PaginationConsumer {
  const committed = new Set<string>();
  return {
    continueAfterPage(response: GetEventsResponse): boolean {
      return response.cursor !== undefined;
    },
    handleEvent(_event: WitnessEvent): void {},
    effectKey(event: WitnessEvent): string {
      return `effect:${event.id}`;
    },
    applyEffect(event: WitnessEvent) {
      const effectKey = `effect:${event.id}`;
      const committedNow = !committed.has(effectKey);
      committed.add(effectKey);
      return { effectKey, committed: committedNow, persistence: "file" as const };
    },
  };
}

/** Deliberately broken: every delivery commits the same business effect again. */
export function createNonIdempotentEffectConsumer(): PaginationConsumer {
  return {
    continueAfterPage(response: GetEventsResponse): boolean {
      return response.cursor !== undefined;
    },
    handleEvent(_event: WitnessEvent): void {},
    effectKey(event: WitnessEvent): string {
      return `effect:${event.id}`;
    },
    applyEffect(event: WitnessEvent) {
      return { effectKey: `effect:${event.id}`, committed: true, persistence: "file" as const };
    },
  };
}
