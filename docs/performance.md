# Performance

## Built in, always on

| Technique | Effect |
|---|---|
| **Cached schema metadata** | `DmmfRegistry` builds one `Map` of fields and relations per model, so every lookup is O(1) instead of scanning the DMMF. |
| **Single-pass parsing** | The Prisma `where` is produced directly while walking the request — no intermediate representation to re-expand. |
| **Shared `where`** | `list` computes the filter once and reuses it for the `count`, both issued with `Promise.all`. |
| **`count` without rows** | The count route never fetches records. |
| **`select` support** | `?fields=` narrows the columns Prisma reads and the bytes you send. |

## Query-plan cache

Parsing, validating and coercing a request is pure CPU work that repeats for identical
requests. Turn on the cache to skip it:

```ts
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    cache: true,             // 500-entry LRU
    // cache: { max: 2000 },
});
```

- **Key**: HTTP method + route path + query + body.
- **Cached**: the validated `QuerySpec` only.
- **Never cached**: database results — every request still queries Prisma.
- **Safe**: a cached plan already passed schema validation and the security policy.

## Telemetry

```ts
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    onQuery: ({ route, format, method, parseMs, execMs, cacheHit }) => {
        metrics.histogram('autoread.parse_ms', parseMs, { route });
        metrics.histogram('autoread.exec_ms', execMs, { route });
        if (cacheHit) metrics.increment('autoread.cache_hit');
    },
});
```

| Field | Meaning |
|---|---|
| `route` | `list` · `count` · `aggregate` · `groupBy` |
| `format` | Output format actually used |
| `method` | HTTP method |
| `parseMs` | Time to produce the query plan (≈0 on a cache hit) |
| `execMs` | Time in the database plus rendering |
| `cacheHit` | Whether the plan came from the cache |

## Cursor pagination for large datasets

Offset pagination degrades as `skip` grows. For deep or infinite scrolling use cursors:

```
GET /users?limit=50
→ pagination.nextCursor: 50
GET /users?limit=50&cursor=50
```

The engine passes `cursor` to Prisma and skips the cursor row itself.

## Tips

- Index whatever you let clients filter and sort on — the library builds the query, the
  database still needs the index.
- Keep `defaults.maxLimit` sensible; it is the only guard against `?limit=100000`.
- Prefer `fields` over `include` when the client only needs scalars.
- Reach for `groupBy`/`aggregate` instead of fetching rows and reducing in Node.
