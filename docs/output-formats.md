# Output formats

## Available formats

| Format | Default | Content type | Shape |
|---|:---:|---|---|
| `hal` | ✔ | `application/json` | `data` + `pagination` + `_links` |
| `plain` | | `application/json` | `{ data, meta }` |
| `jsonapi` | | `application/json` | `{ data: [{ type, id, attributes }], meta, links }` |
| `csv` | | `text/csv` | Flat rows with a header |

Choose the default per endpoint with `output: 'plain'`.

## Negotiation

Clients can pick a format per request:

1. The **format keyword** (`?format=csv` by default — renameable, see [Keywords](./keywords.md)).
2. The **`Accept` header**:

| Accept | Format |
|---|---|
| `application/vnd.api+json` | `jsonapi` |
| `text/csv` | `csv` |
| `application/hal+json` | `hal` |

3. Otherwise the configured default.

## Examples

**HAL**

```jsonc
{
  "data": [ { "id": 1, "firstName": "Alice" } ],
  "pagination": { "page": 2, "limit": 10, "total": 25, "totalPages": 3,
                  "hasNext": true, "hasPrev": true },
  "_links": {
    "self":  { "href": "https://host/users?page=2&limit=10" },
    "first": { "href": "https://host/users?page=1&limit=10" },
    "last":  { "href": "https://host/users?page=3&limit=10" },
    "prev":  { "href": "https://host/users?page=1&limit=10" },
    "next":  { "href": "https://host/users?page=3&limit=10" }
  }
}
```

In cursor mode `pagination.nextCursor` is present and the links collapse to `self` + `next`.

**plain**

```jsonc
{ "data": [ … ], "meta": { "page": 1, "limit": 10, "total": 25, "totalPages": 3,
                           "hasNext": true, "hasPrev": false } }
```

**JSON:API**

```jsonc
{
  "data": [ { "type": "User", "id": 1, "attributes": { "firstName": "Alice" } } ],
  "meta": { "page": 1, "limit": 10, "total": 25, "totalPages": 3 },
  "links": { "self": "…", "first": "…", "last": "…", "next": "…" }
}
```

**CSV**

```csv
id,firstName,age
1,Alice,30
2,"Doe, John",25
```

Columns are the union of the rows' top-level keys; nested values are JSON-encoded in
their cell and values containing `"`/`,`/newlines are quoted.

## Value handling

Before rendering, results are made JSON-safe: `BigInt` becomes a number (or a string
when it exceeds the safe range), Prisma `Decimal` becomes a number, `Date` serialises to
ISO, and circular references are dropped.

## Adding a format

```ts
import { OutputRegistry, type OutputAdapter } from '@didactika/prisma-autoread';

class XmlOutput implements OutputAdapter {
    readonly name = 'xml';
    readonly contentType = 'application/xml';
    format(result, ctx) { return toXml(result.data); }
}
```

Register it in an `OutputRegistry` and set `output: 'xml'`. Returning a `contentType`
makes the binding send the body as-is instead of JSON.
