# prisma-autoread

[![npm version](https://img.shields.io/npm/v/prisma-autoread.svg)](https://www.npmjs.com/package/prisma-autoread)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

> Drop-in `GET` list endpoints for **Express + Prisma** — type-aware filtering, pagination, full-text search, and relation includes, all driven from the query string. Zero boilerplate.

You write one `findByFilter` callback. `prisma-autoread` reads your Prisma schema (via the DMMF) to validate, coerce, and translate query parameters into a ready-to-spread Prisma query.

```ts
GET /api/v1/users?firstName[STARTS_WITH]=Al&age=30&include=posts&page=2&limit=20&sort=lastName
```

---

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Query syntax](#query-syntax)
  - [Filtering](#filtering)
  - [String operators](#string-operators)
  - [Nested relation filters](#nested-relation-filters)
  - [Search](#search)
  - [Relation includes](#relation-includes)
  - [Pagination & sorting](#pagination--sorting)
- [Response shape](#response-shape)
- [Error handling](#error-handling)
- [API reference](#api-reference)
- [How it works](#how-it-works)
- [License](#license)

---

## Features

- 🔎 **Schema-aware filtering** — query params are validated against your Prisma model and coerced to the correct type (`number`, `boolean`, `string`) automatically.
- 🧮 **String operators** — `EXACT`, `LIKE`, `STARTS_WITH`, `ENDS_WITH` per field.
- 🔗 **Relation filters & includes** — filter and eager-load nested relations to arbitrary depth, including a `*` wildcard.
- 📄 **Pagination & sorting** — `page` / `limit` / `sort` / `order` with sensible, configurable defaults and caps.
- 🌐 **HAL responses** — paginated payloads with `self` / `first` / `last` / `prev` / `next` HATEOAS links.
- 🧹 **Safe serialization** — circular references are stripped, Prisma `Decimal` values are converted to numbers, and `BigInt` values are JSON-encoded safely (number when it fits, string otherwise).
- 🛡️ **Helpful errors** — unknown fields return `400` with the list of valid fields/relations; empty results return `404`.
- 📦 **Typed** — ships with full TypeScript definitions.

---

## Requirements

| Peer dependency | Version |
|---|---|
| `express` | `>= 4.0.0` |
| `@prisma/client` | `>= 5.0.0` |

Your Prisma Client must be generated (`npx prisma generate`) — the library reads field and relation metadata from `Prisma.dmmf` at runtime.

---

## Installation

```bash
npm install prisma-autoread
npm install @prisma/client express   # peer dependencies
```

---

## Quick start

```typescript
import express, { Router } from 'express';
import { FilterMiddleware, AutoReadMiddleware } from 'prisma-autoread';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const router = Router();

// 1. Parse & validate query params against the Prisma 'User' model.
router.use(FilterMiddleware.processQueryFilters('User'));

// 2. Attach the GET / list endpoint (pagination is wired up for you).
AutoReadMiddleware.applyToRouter(router, {
    modelName: 'User',
    searchableFields: ['firstName', 'lastName', 'email'],
    basePathPrefix: '/api/v1',
    findByFilter: async ({ where, include, orderBy, take, skip }) => {
        const [data, total] = await Promise.all([
            prisma.user.findMany({ where, include, orderBy, take, skip }),
            prisma.user.count({ where }),
        ]);
        return { data, total };
    },
});

app.use('/api/v1/users', router);

// 3. Register an error handler so 400/404 responses are formatted.
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({ error: err.message });
});

app.listen(3000);
```

That's it. `GET /api/v1/users` now supports filtering, pagination, search, and relation includes.

> **Note:** `FilterMiddleware.processQueryFilters(...)` must run **before** `AutoReadMiddleware.applyToRouter(...)` — it populates the parsed query that the list endpoint consumes.

---

## Configuration

`AutoReadMiddleware.applyToRouter(router, config)` accepts an `AutoReadConfig`:

| Field | Required | Default | Description |
|---|:---:|---|---|
| `modelName` | ✅ | — | Exact Prisma model name, matching schema casing (e.g. `'User'`). Used to resolve field types from the DMMF. |
| `findByFilter` | ✅ | — | Async function that runs your query. Receives `{ where, include, orderBy, take, skip }`. Return `{ data, total }` or a plain `any[]`. |
| `searchableFields` | | `[]` | Fields scanned by `?search=`. |
| `defaultLimit` | | `10` | Page size when `?limit=` is omitted. |
| `maxLimit` | | `100` | Upper bound for `?limit=`. |
| `basePathPrefix` | | `''` | Prefix inserted into generated HATEOAS link URLs (e.g. `'/api/v1'`). |

---

## Query syntax

### Filtering

Scalar equality filters use the field name directly. Values are cast to the right type based on your schema:

```
GET /users?age=30          → where: { age: 30 }        (number)
GET /users?active=true     → where: { active: true }   (boolean)
GET /users?firstName=Alice → where: { firstName: 'Alice' }
```

Unknown field names are rejected with `400 Bad Request` and a message listing the valid fields.

### String operators

Refine string matching per field with bracket notation:

```
GET /users?firstName[STARTS_WITH]=Al    → { firstName: { startsWith: 'Al' } }
GET /users?firstName[ENDS_WITH]=ce      → { firstName: { endsWith: 'ce' } }
GET /users?firstName[LIKE]=lic          → { firstName: { contains: 'lic' } }
GET /users?firstName[EXACT]=Alice       → { firstName: 'Alice' }
```

### Nested relation filters

Filter on related models. Bracket notation maps directly onto Prisma's relation filters, to any depth:

```
GET /orders?user[age]=30
GET /orders?product[category]=electronics
GET /orders?product[name][STARTS_WITH]=Pro
```

### Search

A single `?search=` term is matched (case-sensitively, `contains`) across every field in `searchableFields`, combined with `OR`:

```
GET /users?search=Alice
```

### Relation includes

Eager-load relations with `?include=`:

```
GET /users?include=posts              → include: { posts: true }
GET /users?include=posts,profile      → include both relations
GET /users?include=posts[comments]    → nested include
GET /users?include=*                  → include every relation on the model
```

### Pagination & sorting

```
GET /users?page=2&limit=20&sort=lastName&order=desc
```

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | 1-based. |
| `limit` | `defaultLimit` (`10`) | Capped at `maxLimit` (`100`). |
| `sort` | `id` | Any field name. |
| `order` | `asc` | `asc` or `desc`. |

---

## Response shape

Responses follow the [HAL](https://stateless.group/hal_specification.html) convention — a `data` array, a `pagination` summary, and hypermedia `_links`:

```json
{
  "data": [ { "id": 1, "firstName": "Alice", "...": "..." } ],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 83,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": true
  },
  "_links": {
    "self":  { "href": "https://host/api/v1/users?page=2&limit=20" },
    "first": { "href": "https://host/api/v1/users?page=1&limit=20" },
    "last":  { "href": "https://host/api/v1/users?page=5&limit=20" },
    "prev":  { "href": "https://host/api/v1/users?page=1&limit=20" },
    "next":  { "href": "https://host/api/v1/users?page=3&limit=20" }
  }
}
```

`prev` and `next` are omitted on the first and last page respectively. Existing filter/search query params are preserved in every generated link.

---

## Error handling

Errors are thrown as [`http-response-client`](https://www.npmjs.com/package/http-response-client) errors carrying a `.status` property. Register an error handler **after** your routes to format them:

```typescript
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({ error: err.message });
});
```

| Situation | Status |
|---|---|
| Unknown field/relation in query params | `400 Bad Request` |
| Unknown `?sort=` field | `400 Bad Request` |

An empty result set is **not** an error — it returns `200` with `"data": []` and `"total": 0`, so pagination clients keep working.

---

## API reference

The package exports middlewares, parsing utilities, and types:

```typescript
import {
    AutoReadMiddleware,   // applyToRouter(router, config) — builds the GET / endpoint
    FilterMiddleware,     // processQueryFilters(modelName?) — parses & validates the query
    PaginationMiddleware, // processPagination(defaultLimit?, maxLimit?) + createPaginatedResponse(...)

    // Lower-level utilities (used internally; exported for advanced use)
    FilterValidator,
    FilterValueParser,
    IncludeParser,
    NestedRelationProcessor,
    obtainUrl,
} from 'prisma-autoread';

import type {
    AutoReadConfig,
    PrismaQueryArgs,      // the { where, include, orderBy, take, skip } passed to findByFilter
    PaginationData,
    CustomRequestData,
    RequestFilterable,    // Express Request augmented with `.custom`
    LikeFilter,
    LikeFilterMode,
} from 'prisma-autoread';
```

> Calling `FilterMiddleware.processQueryFilters()` **without** a model name skips schema validation — filters pass through untyped. Handy for custom or schemaless endpoints.

---

## How it works

1. **`FilterMiddleware.processQueryFilters(modelName)`** parses the query string, validates each key against the model's DMMF fields/relations, coerces values to their schema types, and stores the result on `req.custom`.
2. **`PaginationMiddleware`** (wired up automatically by `applyToRouter`) reads `page` / `limit` / `sort` / `order` into `req.custom.pagination`.
3. **`AutoReadMiddleware`** assembles a Prisma-ready `{ where, include, orderBy, take, skip }` object and hands it to your `findByFilter` callback.
4. The returned rows are stripped of circular references (and `Decimal`/`BigInt` values normalised for JSON), then wrapped in a HAL paginated response.

---

## License

[MIT](https://opensource.org/licenses/MIT) — © [Didactika](https://github.com/didactika)
