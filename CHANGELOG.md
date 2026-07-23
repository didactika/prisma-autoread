# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-22

First stable release. A new, layered search engine sits alongside the original
middleware, which is preserved unchanged for backward compatibility.

### Added

- **`createAutoRead(options).applyTo(router)`** — declarative endpoint factory.
- **HTTP methods**: `GET` (query string), `QUERY` (JSON body, safe & idempotent),
  and `POST` (body fallback), dispatched on the same routes.
- **Input protocols**:
  - `query` — Prisma-native bracket syntax (`filter[age][gte]=30`).
  - `json` — Prisma-shaped body (`{ "where": … }`) for `QUERY`/`POST`.
  - `rsql` — RSQL/FIQL string filters (`filter=age=ge=30;name==Al*`).
  - `odata` — OData `$filter` (`$filter=age gt 30 and startswith(name,'Al')`).
  - `legacy` — the original GET syntax, reusing the frozen middleware verbatim.
- **Operators**: `eq/equals`, `ne/not`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`,
  `contains`, `startsWith`, `endsWith`, `mode`, `isNull`; logical `AND`/`OR`/`NOT`;
  relation `some`/`every`/`none`/`is`/`isNot`; JSON path filters.
- **Routes**: `list`, `count`, `aggregate` (`_sum`/`_avg`/`_min`/`_max`/`_count`) and
  `group-by`, each with a configurable path.
- **Selection & sorting**: `fields`→`select`, multi-field `sort=-a,b`, `include`,
  `distinct`.
- **Pagination**: offset (`page`/`limit`) and cursor (`cursor=`), with HAL links.
- **Output formats**: `hal` (default), `plain`, `jsonapi`, `csv`, with content
  negotiation via `?format=` or the `Accept` header.
- **Frameworks**: Express, **Fastify** and **Hono** bindings on top of a
  framework-agnostic `EndpointController`. Neither Fastify nor Hono is a dependency —
  both are typed structurally.
- **Security**: field/relation allow-lists, a `maxDepth` guard, and a **strict
  deny-by-default mode** that refuses to start without an explicit allow-list.
- **Renameable keywords**: every reserved query parameter (`filter`, `fields`, `sort`,
  `page`, `limit`, …) can be renamed globally via `Keywords.configure()` or per endpoint
  via `keywords`, so a column can share a name with a control parameter.
- **Datasource-aware JSON paths**: the provider is auto-detected from the Prisma client
  and the JSON `path` is normalised to `array` (PostgreSQL/SQLite/…) or `string`
  (MySQL/MariaDB); overridable with `provider` / `jsonPathSyntax`.
- **Performance**: cached DMMF metadata (O(1) lookups), single-pass parsing, an
  optional query-plan cache, and an `onQuery` telemetry hook.
- Full TypeScript types for the public surface.
- Documentation set under `docs/` with guides and UML diagrams (context, containers,
  domain model, use cases, classes, sequences, components, state).

### Changed

- Repository restructured into a conventional library layout (`core/`, `input/`,
  `output/`, `routes/`, `http/`, `config/`, `errors/`, `legacy/`).
- The engine is object-oriented throughout: adapters, parsers, routes, registries,
  builders and resolvers are classes with a single responsibility.
- All type declarations were moved out of implementation files into `src/types/*.d.ts`
  and are imported with `import type`.

### Deprecated

- `AutoReadMiddleware`, `FilterMiddleware`, `PaginationMiddleware` and the legacy
  parsing utilities. They remain fully supported (and are still used under the hood
  by `legacy: true`), but new code should prefer `createAutoRead`.

### Fixed

- **Express 5 compatibility**: Express 5 changed the default query parser to the flat
  one, which broke bracket notation. The engine now parses the query string itself in
  every binding, so Express 4 and 5 (and Fastify and Hono, whose parsers are flat too)
  behave identically with no configuration. The parser also guards against prototype
  pollution and caps parameter count and depth.

### Compatibility

- Verified in CI: **Node 20/22/24**, **Prisma 5/6/7**, **Express 4/5**, plus the
  Fastify and Hono bindings.
- `peerDependencies` widened to `@prisma/client >= 5.0.0`; `engines.node >= 20` added.
- The deprecated 0.x middleware, when mounted directly on Express 5, needs
  `app.set('query parser', 'extended')`. Using it through `createAutoRead({ legacy: true })`
  needs no such change.

### Notes

- JSON path filtering is only supported by PostgreSQL and MySQL (per Prisma). The
  `Json` path format is detected from the datasource provider.
