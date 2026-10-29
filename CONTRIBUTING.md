# Contributing to CursorWitness Core

Run `pnpm install --ignore-workspace` and `pnpm run verify` before opening a
change. Keep the core transport-neutral, offline by default, and independent
of CLI or adapter implementations. Do not decode opaque cursors or claim
durability from in-memory evidence.
