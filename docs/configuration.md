# Configuration

`createAutoRead(options)` returns an `AutoReadEndpoint`. Bind it with `applyTo`
(Express), `applyToFastify` or `applyToHono`.

## Options

| Option | Required | Default | Description |
|---|:---:|---|---|
| `model` | ✅ | — | Prisma model name, schema casing (e.g. `'User'`). |
| `delegate` | ✅* | — | Prisma model delegate (`prisma.user`). Enables every route. |
| `findByFilter` | ✅* | — | Legacy-style callback, alternative to `delegate`. *One of the two. |
| `methods` | | `['GET']` | HTTP methods to expose: `GET`, `QUERY`, `POST`. |
| `routes` | | `['list']` | Routes to generate — see [Routes](./routes.md). |
| `output` | | `'hal'` | Default output format — see [Output formats](./output-formats.md). |
| `legacy` | | `true` | `true` = original GET syntax; `false` = modern dialects. |
| `formats` | | all | GET dialects when `legacy: false`: `query`, `rsql`, `odata`. |
| `searchable` | | `[]` | Fields scanned by the search keyword. |
| `defaults` | | see below | Pagination and sorting defaults. |
| `security` | | allow all | Allow-lists and limits — see [Security](./security.md). |
| `keywords` | | defaults | Rename reserved parameters — see [Keywords](./keywords.md). |
| `provider` | | auto | Datasource provider, for JSON path syntax. |
| `jsonPathSyntax` | | auto | Force `'array'` or `'string'`, bypassing detection. |
| `cache` | | off | `true` or `{ max }` — see [Performance](./performance.md). |
| `onQuery` | | — | Telemetry hook. |
| `basePathPrefix` | | `''` | Prefix inserted into generated links (e.g. `'/api/v1'`). |

### `defaults`

```ts
defaults: { limit: 10, maxLimit: 100, sort: 'id', order: 'asc' }
```

`limit` is the page size when the client omits it; `maxLimit` caps whatever the client
asks for. `sort`/`order` are used when no sort is requested (silently dropped if the
model has no such field).

## Data source

```ts
// Preferred: the Prisma delegate. Enables count / aggregate / group-by.
createAutoRead({ model: 'User', delegate: prisma.user });

// Alternative: your own callback. Only `list` (and a derived `count`) is available.
createAutoRead({
    model: 'User',
    findByFilter: async ({ where, include, orderBy, take, skip }) => {
        const [data, total] = await Promise.all([
            prisma.user.findMany({ where, include, orderBy, take, skip }),
            prisma.user.count({ where }),
        ]);
        return { data, total };
    },
});
```

## JSON path syntax

Prisma expresses a JSON `path` differently per datasource:

| Provider | Syntax | Example |
|---|---|---|
| PostgreSQL, CockroachDB, SQLite, SQL Server | `array` | `path: ['a','b']` |
| MySQL, MariaDB | `string` | `path: '$.a.b'` |

The engine auto-detects the active provider from the Prisma client and normalises
whatever the client sent. Override with `provider: 'mysql'` or `jsonPathSyntax: 'string'`.

> Advanced JSON filtering is only supported by PostgreSQL and MySQL.

## Introspection

```ts
const endpoint = createAutoRead({ /* … */ });
endpoint.config.routes;          // resolved routes and paths
endpoint.config.keywords;        // effective parameter names
endpoint.config.jsonPathSyntax;  // detected syntax
endpoint.createController();     // framework-agnostic controller
```
