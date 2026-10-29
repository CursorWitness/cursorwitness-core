# @cursorwitness/core

The transport-neutral CursorWitness correctness engine. This local extraction
owns the core contracts and offline evidence model; it is not a published
package yet.

It owns opaque cursors, application-defined checkpoints, fixture validation,
fake `getEvents` playback, lifecycle observations, deterministic faults,
independent oracle evaluation, scenarios, and semantic reports.

Development:

```text
pnpm install --ignore-workspace
pnpm run verify
```

The core never requires a live RPC endpoint, wallet, database, CLI, or adapter.
Its reports distinguish simulated evidence from provider or durable-persistence
claims.
