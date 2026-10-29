import type { PaginationConsumer } from "./scenario.js";
/** Correct reference behavior: an empty page is non-terminal when it has a cursor. */
export declare function createReferencePaginationConsumer(): PaginationConsumer;
/** Deliberately broken: treats an empty page as completion even when a cursor remains. */
export declare function createStopOnEmptyConsumer(): PaginationConsumer;
/** Correct idempotent effect example: repeated delivery attempts do not repeat the commit. */
export declare function createIdempotentEffectConsumer(): PaginationConsumer;
/** Deliberately broken: every delivery commits the same business effect again. */
export declare function createNonIdempotentEffectConsumer(): PaginationConsumer;
