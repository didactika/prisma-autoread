# Protocols

The transport (HTTP method) and the grammar (input format) are independent. Every
combination produces the same internal query plan.

## Transports

| Method | Body | When to use |
|---|:---:|---|
| `GET` | — | Simple, cacheable, shareable URLs. |
| `QUERY` | ✅ | Complex queries that don't fit comfortably in a URL. Safe and idempotent. |
| `POST` | ✅ | Same as `QUERY`, for clients or proxies that don't support it yet. |

`QUERY` is an HTTP method defined by the IETF draft
*[safe method with body](https://www.ietf.org/archive/id/draft-ietf-httpbis-safe-method-w-body-02.html)*:
like `GET`, but with a request body. Enable it with `methods: ['GET', 'QUERY']`.

> **Fastify:** register the method once before binding —
> `fastify.addHttpMethod('QUERY', { hasBody: true })`.

## GET dialects

With `legacy: false`, all three are enabled by default and are chosen by the shape of
the request, so they never collide:

| Dialect | Trigger | Example |
|---|---|---|
| `query` | catch-all | `?filter[age][gte]=30` |
| `rsql` | `filter` is a **string** | `?filter=age=ge=30;name==Al*` |
| `odata` | `$filter` / `$orderby` / `$select` present | `?$filter=age gt 30` |

Restrict them with `formats: ['query']`.

### RSQL / FIQL

```
?filter=age=ge=30;name==Al*        → age >= 30 AND name startsWith 'Al'
?filter=active==true,age=lt=18     → active = true OR age < 18
?filter=role=in=(admin,editor)     → role in [admin, editor]
?filter=(a==1,b==2);c==3           → (a OR b) AND c
?filter=campus.uuid==A             → relation traversal
```

| Token | Meaning |
|---|---|
| `;` | AND (binds tighter than OR) |
| `,` | OR |
| `==` `!=` | equals / not |
| `=gt=` `=ge=` `=lt=` `=le=` | comparisons |
| `=in=(…)` `=out=(…)` | in / notIn |
| `=like=` | contains |
| `*` on `==` | `Al*` startsWith · `*ce` endsWith · `*x*` contains |

### OData

```
?$filter=age gt 30 and startswith(name,'Al')
?$filter=active eq true or age lt 18
?$filter=not (age lt 18)
?$filter=campus/uuid eq 'A'
?$orderby=age desc,name&$select=id,name&$top=20&$skip=40
```

Supported: `eq ne gt ge lt le`, `and or not`, grouping, and
`contains|startswith|endswith(field,'x')`.

## Body format (QUERY / POST)

The body is the query in Prisma shape:

```jsonc
{
  "where":   { "age": { "gte": 30 }, "OR": [{ "active": true }] },
  "orderBy": [{ "createdAt": "desc" }],
  "select":  { "id": true, "firstName": true },
  "include": { "posts": true },
  "distinct": ["email"],
  "cursor": 42,
  "page": 1,
  "limit": 20,
  "search": "alice"
}
```

Aggregations accept both the friendly and the Prisma-native spelling:

```jsonc
{ "sum": ["age"], "count": true }
{ "_sum": { "age": true }, "_count": true }
```

## Legacy dialect

`legacy: true` (the default) keeps the original GET syntax working untouched:

```
?firstName[LIKE]=al&campus[uuid]=A&or[g1][firstName]=Alice&search=bob
```

It is served by driving the frozen legacy engine, so its behaviour is identical to
0.x. See [Migration](./migration.md).
