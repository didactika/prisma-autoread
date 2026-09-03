# Container diagram

The internal building blocks of the library and how a request moves through them.

[![Container diagram](https://www.plantuml.com/plantuml/proxy?cache=no&fmt=svg&src=https://raw.githubusercontent.com/didactika/prisma-autoread/main/docs/diagrams/puml/containers.puml)](./puml/containers.puml)

*Source: [`puml/containers.puml`](./puml/containers.puml) — see [rendering](./README.md#rendering).*

## Notes

- **Bindings** are the only place a framework is referenced. Nest is isolated behind
  its optional entry point; Fastify and Hono are structurally typed.
- **`EndpointController`** is the single pipeline. Every binding is a thin translation
  to and from `HttpRequestContext` / `HttpResponsePayload`.
- The **`LegacyAdapter`** does not reimplement the old grammar: it drives the frozen
  legacy middleware and captures the Prisma arguments it builds.
- **`PlanCache`** memoises parsing only; the database is always queried.
