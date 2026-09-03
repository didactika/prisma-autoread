# AGENTS.md — working context for this repository

Orientation for coding agents and new contributors. Not published to npm.
For the full picture read [`docs/README.md`](./docs/README.md) and
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## What this is

`@didactika/prisma-autoread` is a TypeScript npm library that generates **read/search
endpoints** over Prisma models for Node HTTP frameworks. The consumer declares one
endpoint per model; the library parses, validates, coerces, executes and renders the
query.

## Hard rules

1. **Never modify `src/legacy/`.** It is the original engine, frozen for backward
   compatibility, and it is reused verbatim by the `legacy` input adapter.
   The one admitted exception is a **bug that only manifests on a datasource the 0.x
   engine never supported** — MongoDB composite types, in 1.1.0. Such a fix must be
   inert on every schema that worked before (guard on `Prisma.dmmf.datamodel.types`
   being non-empty) and must leave the existing legacy suites untouched and green.
   Anything else — new syntax, new options, refactors — belongs outside `legacy/`.
2. **Types live in `src/types/*.d.ts`.** Implementation files contain behaviour only and
   import types with `import type`.
3. **The code is object-oriented.** New behaviour goes in a class with a single
   responsibility, registered through the relevant registry.
4. **The core never imports `http`, `input` or `output`.** `QueryBuilder`, `Executor`
   and the DMMF layer are transport-agnostic.
5. **Every change ships with tests** at the right level (unit / integration / e2e).

## Pipeline

```
Binding (Express|NestJS|Fastify|Hono) → EndpointController → InputAdapter → QueryBuilder
    → QuerySpec → Route → Executor → OutputAdapter
```

Any input protocol produces the same `QuerySpec`; any output format consumes the same
result. That is the invariant to preserve.

## Layout

```
src/
├── auto-read.ts      AutoReadEndpoint + createAutoRead
├── config/           OptionsResolver · Keywords · ProviderDetector
├── core/             QueryBuilder · Executor · OperatorRegistry · FieldMask · SpecGuard · PlanCache · dmmf/
├── input/            adapters (query, rsql, odata, json, legacy) + parsers/
├── output/           adapters (hal, plain, jsonapi, csv) + Serializer · LinkBuilder
├── routes/           list · count · aggregate · group-by + RouteRegistry
├── http/             EndpointController + framework bindings
├── errors/           typed errors (BadRequest, NotImplementedError)
├── legacy/           FROZEN original engine
└── types/            all *.d.ts declarations
```

## Extension points

| To add… | Do this |
|---|---|
| An input protocol | Implement `InputAdapter`, register it in `InputRegistry`. |
| An output format | Implement `OutputAdapter`, register it in `OutputRegistry`. |
| A route | Extend `Route`, register it in `RouteRegistry`. |
| A framework | Build an `HttpRequestContext`, call `EndpointController.handle`. |

## Commands

```bash
npm install && npx prisma generate    # required: the engine reads the DMMF
npm run test:unit                     # mocked DMMF, no database
npm run test:integration              # full pipeline via supertest
npm run test:e2e                      # real SQLite (prisma db push + seed)
npm run build                         # tsup → CJS + ESM + d.ts
```

`npx prisma generate` is mandatory before the tests: without it the `Prisma` namespace
has no `dmmf` typing and every suite that touches the schema fails to compile.

## Gotchas

- **`QUERY` method**: routed via `router.all` + a method guard (Express), `app.on`
  (Hono), `route({ method })` (Fastify). Test clients like supertest cannot emit it —
  use raw `http.request` (see `tests/integration/http-engine.test.ts`).
- **JSON filtering** is only supported by PostgreSQL and MySQL in Prisma; the SQLite
  e2e suite deliberately does not exercise it.
- **group-by** skips the default `orderBy`/`take` because Prisma requires them to
  reference the grouped fields.
- **Keywords** are configurable; never hard-code `'fields'`, `'page'`, … in an adapter —
  read them from the resolved `KeywordMap`.
- The error handler in consuming apps must use `err.status` (not `err.statusCode`);
  that is what `http-response-client` sets.
