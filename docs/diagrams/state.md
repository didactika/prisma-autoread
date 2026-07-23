# Request lifecycle

The technical states one request passes through inside the pipeline, and every way it
can leave. The business-level view is the [context diagram](./context.md).

[![Request lifecycle](https://www.plantuml.com/plantuml/proxy?cache=no&fmt=svg&src=https://raw.githubusercontent.com/didactika/prisma-autoread/main/docs/diagrams/puml/state.puml)](./puml/state.puml)

*Source: [`puml/state.puml`](./puml/state.puml) — see [rendering](./README.md#rendering).*

## Invariants

- Every transition out of `VALIDATING` has consulted both the **schema** and the
  **security policy** — there is no path to `EXECUTING` that skips validation.
- `CACHE_HIT` reuses a plan that was already validated and authorised, so caching cannot
  bypass a policy (the cache key includes method, route, query and body).
- All states are **safe**: no route in the engine writes data.
