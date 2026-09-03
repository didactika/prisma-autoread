# Architecture

Reference design for **prisma-autoread**. This document is normative: when the code
and this document disagree, either the code is fixed or this document is updated
deliberately. Diagrams live in [`diagrams/`](./diagrams/README.md).

## 1. Goals and principles

Generate **read/search endpoints** over Prisma models, exposing (almost) the whole
expressive power of Prisma's `where` / `orderBy` / `select` over HTTP, while staying
approachable for developers who already know Node and Prisma.

Principles, in priority order:

1. **Optimisation first** — no dead code, O(1) metadata lookups, single-pass parsing,
   one `where` shared by list and count, `select` to fetch fewer columns.
2. **SOLID** — one responsibility per class; the core is closed to modification and
   open to extension through registrable adapters.
3. **Backward compatibility** — the original engine is frozen under `src/legacy/` and
   reused verbatim; it can never drift.
4. **Lean** — only what the current version uses ships. Everything else is a roadmap
   item, not dead scaffolding.

## 2. Layers

```
HTTP request  (GET | QUERY | POST)
      │
      ▼
[ Binding ]            framework glue (Express / NestJS / Fastify / Hono)
      │  normalises to HttpRequestContext
      ▼
[ EndpointController ] framework-agnostic pipeline
      │
      ▼
[ InputAdapter ]       parses one format → QuerySpec        (one class per protocol)
      │
      ▼
[ QueryBuilder ]       validates, coerces, maps operators   (DMMF + security aware)
      │
      ▼
[ QuerySpec ]          neutral, Prisma-shaped query plan
      │
      ▼
[ Route ]              list / count / aggregate / group-by
      │
      ▼
[ Executor ]           runs the optimal Prisma function
      │
      ▼
[ OutputAdapter ]      renders the payload                  (one class per format)
      │
      ▼
HTTP response
```

The golden rule: **any** transport/input format produces the same `QuerySpec`, and
**any** output format consumes the same result. Adding a protocol or a format is a
self-contained class plus one registration.

## 3. Components

| Component | Responsibility | Location |
|---|---|---|
| `AutoReadEndpoint` | A declared endpoint; owns resolved options, exposes bindings. | `src/auto-read.ts` |
| `OptionsResolver` | Validates and normalises user options into `ResolvedOptions`. | `src/config/` |
| `Keywords` | Global/per-endpoint names of the reserved query parameters. | `src/config/` |
| `ProviderDetector` | Resolves the datasource provider → JSON `path` syntax. | `src/config/` |
| `EndpointController` | Framework-agnostic request pipeline; returns a plain payload. | `src/http/` |
| `ExpressBinding`, `NestBinding`, `FastifyBinding`, `HonoBinding` | Translate framework req/res to the neutral contracts. | `src/http/` |
| `AutoReadModule` | Contributes generated native controllers to a Nest application. | `src/nest.ts` |
| `InputAdapter` (+ `InputRegistry`) | Parse one input format into a `QuerySpec`. | `src/input/` |
| `RsqlParser`, `ODataParser` | Standalone grammar parsers used by their adapters. | `src/input/parsers/` |
| `QueryControlsParser` | Shared parsing of sort/fields/include/pagination/aggregations. | `src/input/` |
| `QueryBuilder` | The semantics: validation, coercion, operator mapping, security. | `src/core/` |
| `DmmfRegistry` / `ModelMeta` | Cached, O(1) view of the Prisma schema. | `src/core/dmmf/` |
| `ValueCoercer` | Type coercion driven by the Prisma column type. | `src/core/dmmf/` |
| `OperatorRegistry` | Operator vocabulary and its mapping to Prisma. | `src/core/` |
| `FieldMask` | Compiles `security.hidden`; rejects and redacts hidden fields. | `src/core/` |
| `SpecGuard` | Applies the security policy to plans built outside the builder. | `src/core/` |
| `Executor` | Runs `findMany` / `count` / `aggregate` / `groupBy`. | `src/core/` |
| `PlanCache` | LRU cache of parsed query plans. | `src/core/` |
| `Route` (+ `RouteRegistry`) | One operation: list, count, aggregate, group-by. | `src/routes/` |
| `OutputAdapter` (+ `OutputRegistry`) | Render the result in one format. | `src/output/` |
| `Serializer`, `LinkBuilder` | JSON-safe values; pagination links. | `src/output/` |

### Contracts

```ts
interface InputAdapter {
  readonly name: string;
  supports(input: RequestInput, keywords: KeywordMap): boolean;
  parse(input: RequestInput, ctx: AdapterContext): QuerySpec | Promise<QuerySpec>;
}

interface OutputAdapter {
  readonly name: string;
  readonly contentType?: string;          // set for non-JSON formats
  format(result: QueryResult, ctx: OutputContext): unknown;
}

abstract class Route {
  abstract readonly name: RouteName;
  abstract execute(spec: QuerySpec, ctx: RouteExecutionContext): Promise<RouteResult>;
}
```

The core depends on these interfaces, never on concrete implementations. The Prisma
delegate and the framework instance are injected from outside.

## 4. Types

All types are declaration-only files under `src/types/`:

| File | Contents |
|---|---|
| `query.d.ts` | `QuerySpec`, `RawSpec`, `RequestInput`, `BuildContext`, security, defaults. |
| `options.d.ts` | `AutoReadOptions`, `ResolvedOptions`, routes, telemetry. |
| `adapters.d.ts` | Input/output adapter contracts and their contexts. |
| `dmmf.d.ts` | Field/relation metadata projections. |
| `http.d.ts` | Neutral request/response plus structural framework contracts. |
| `nest.d.ts` | Nest registration, dynamic-module and native request/response contracts. |
| `keywords.d.ts` | The reserved-parameter map. |
| `prisma.d.ts` | Delegate, finder and provider types. |
| `index.ts` | Legacy engine types (kept as a module — the legacy engine is frozen). |

Implementation files import them with `import type`, so nothing type-only survives
into the emitted JavaScript.

## 5. Transports

| Method | Input | Notes |
|---|---|---|
| `GET` | query string | Simple, cacheable, linkable. |
| `QUERY` | JSON body | Safe and idempotent method with a body (IETF `draft-ietf-httpbis-safe-method-w-body`). |
| `POST` | JSON body | Fallback for clients and proxies that don't support `QUERY`. |

Bindings route non-standard methods themselves (Express `router.all` + a method
guard; Hono `app.on`; Fastify `route({ method })`; native Nest request decorators).

## 6. Input formats

| Transport | Format | Trigger | Example |
|---|---|---|---|
| GET | `query` | catch-all | `?filter[age][gte]=30` |
| GET | `rsql` | `filter` is a string | `?filter=age=ge=30;name==Al*` |
| GET | `odata` | `$filter` present | `?$filter=age gt 30` |
| GET | `legacy` | `legacy: true` | `?firstName[LIKE]=al&or[g][…]` |
| QUERY / POST | `json` | object body | `{ "where": { "age": { "gte": 30 } } }` |

The modern GET dialects disambiguate purely by parameter shape, so they can all be
enabled at once without ambiguity.

## 7. Output formats

| Format | Default | Description |
|---|:---:|---|
| `hal` | ✔ | `data` + `pagination` + HATEOAS `_links`. |
| `plain` | | `{ data, meta }`. |
| `jsonapi` | | `{ data: [{ type, id, attributes }], meta, links }`. |
| `csv` | | Flat export; sets `text/csv`. |

Negotiation: the `format` keyword wins, then the `Accept` header, then the configured
default.

## 8. Routes

| Route | Prisma | Default path |
|---|---|---|
| `list` | `findMany` (+ `count`) | `/` |
| `count` | `count` | `/count` |
| `aggregate` | `aggregate` | `/aggregate` |
| `groupBy` | `groupBy` | `/group-by` |

Every path is configurable per endpoint.

## 9. Security

Enforced inside `QueryBuilder`, so every modern input format is covered, plus a
`SpecGuard` pass over the plan the frozen legacy engine builds, so the policy holds
on that dialect too:

- **Allow-lists** — `security.fields` and `security.relations` restrict what can be
  filtered, sorted, selected, aggregated or traversed.
- **Hidden fields** — `security.hidden` compiles to a `FieldMask` tree used twice:
  the builder rejects those names as unknown, and `ListRoute` strips them from every
  row after execution, so the value cannot leak through a `select`, an `include` or
  an embedded document.
- **Strict mode** — `security.strict` refuses to start without an explicit field
  allow-list and rejects a relations wildcard: nothing is exposed unless listed.
- **Depth guard** — `security.maxDepth` rejects pathological nesting.

## 10. Performance

- Schema metadata is built once per model into maps → O(1) lookups.
- Parsing is single-pass and produces the final Prisma `where` directly.
- `list` computes the `where` once and reuses it for the parallel `count`.
- `cache` memoises parsed query plans by request signature (parsing only — the
  database is always queried).
- `onQuery` reports `parseMs`, `execMs` and `cacheHit` per request.

## 11. Backward compatibility

`src/legacy/` holds the original middleware, unchanged. The `legacy` input adapter
drives that pipeline and captures the Prisma arguments it builds, so the old GET
syntax behaves exactly as it always has. The original public API is still exported.

## 12. Extension points

- **Input protocol** — implement `InputAdapter`, register it in `InputRegistry`.
- **Output format** — implement `OutputAdapter`, register it in `OutputRegistry`.
- **Route** — extend `Route`, register it in `RouteRegistry`.
- **Framework** — build an `HttpRequestContext`, call `EndpointController.handle`,
  and map the returned payload back.

The core (`QuerySpec`, `QueryBuilder`, `Executor`) is never modified for any of these.

## 13. Repository layout

```
src/
├── index.ts                  # public surface
├── auto-read.ts              # AutoReadEndpoint + createAutoRead
├── config/                   # options resolver, keywords, provider detection
├── core/                     # query builder, executor, operators, cache, dmmf/
├── input/                    # adapters + parsers/ + shared control parsing
├── output/                   # adapters + serializer + link builder
├── routes/                   # list / count / aggregate / group-by + registry
├── http/                     # endpoint controller + framework bindings
├── errors/                   # typed errors
├── legacy/                   # frozen original engine
└── types/                    # all type declarations (*.d.ts)
tests/ (unit | integration | e2e)   examples/   docs/
```

## 14. Errors

Errors are typed and carry `.status`: `400` for invalid or disallowed queries, `501`
(`NotImplementedError`) for capabilities that are declared but not yet implemented.

## 15. Versioning

Semantic Versioning. The public surface is `createAutoRead`, its options, the exported
types, and the client-facing query grammar. Breaking any of those requires a major bump.
