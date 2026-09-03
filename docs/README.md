# prisma-autoread — Documentation

Reference documentation for the library. Start with the [Getting started](./getting-started.md)
guide, then dig into the query grammar or the internals.

## Guides

| Document | What it covers |
|---|---|
| [Getting started](./getting-started.md) | Install, declare your first endpoint, first requests. |
| [Configuration](./configuration.md) | Every `createAutoRead` option, defaults and route paths. |
| [Query language](./query-language.md) | Operators, logical groups, relations, JSON, sorting, selection. |
| [Protocols](./protocols.md) | GET dialects (brackets, RSQL, OData), the `QUERY` method and JSON bodies. |
| [Output formats](./output-formats.md) | HAL, plain, JSON:API, CSV and content negotiation. |
| [Routes](./routes.md) | `list`, `count`, `aggregate`, `group-by` and custom paths. |
| [Keywords](./keywords.md) | Renaming reserved query parameters to avoid clashes with your columns. |
| [Security](./security.md) | Allow-lists, strict mode and nesting limits. |
| [Performance](./performance.md) | Metadata caching, query-plan cache and telemetry. |
| [Frameworks](./frameworks.md) | Express, NestJS, Fastify and Hono bindings; automatic Nest Swagger metadata. |
| [Migration](./migration.md) | Moving from the 0.x middleware to the v1 engine. |
| [Publishing](./publishing.md) | Release flow, npm authentication and 2FA. |

## Examples

**[14 runnable examples](../examples/README.md)**, ordered from the simplest endpoint
to a complete API — every framework, protocol, output format and feature.

## Internals

| Document | What it covers |
|---|---|
| [Architecture](./ARCHITECTURE.md) | Layers, components, extension points and design rules. |
| [Diagrams](./diagrams/README.md) | UML: context, container, domain model, use cases, sequences, classes. |

## Conventions

- The **engine** is the v1 pipeline (`createAutoRead`). The **legacy engine** is the
  original middleware, frozen under `src/legacy/` and still fully supported.
- All types live in `src/types/*.d.ts`; implementation files hold only behaviour.
- Anything the client sends is validated against the Prisma schema (DMMF) before it
  reaches the database.
