# Security

All checks run inside `QueryBuilder`, so they apply to every input protocol — query
string, RSQL, OData and JSON bodies alike.

## Allow-lists

```ts
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    security: {
        fields: ['id', 'firstName', 'email'],  // filterable / sortable / selectable
        relations: ['posts'],                   // traversable / includable
        maxDepth: 5,
    },
});
```

Anything outside a list is rejected with `400`. Omitting an option (or using `'*'`)
allows everything.

## Strict mode — deny by default

```ts
security: { strict: true, fields: ['id', 'firstName'], relations: ['posts'] }
```

Strict mode makes the deny-by-default intent explicit and unbypassable:

| Rule | Behaviour |
|---|---|
| `fields` must be an explicit non-empty list | otherwise `createAutoRead` **throws at startup** |
| `fields: '*'` | rejected at startup |
| `relations: '*'` | rejected at startup |
| `relations` omitted | resolves to **no relations at all** |

Failing at declaration time (not per request) means a misconfigured endpoint can never
reach production silently.

```ts
// throws: strict mode requires an explicit allow-list
createAutoRead({ model: 'User', delegate: prisma.user, security: { strict: true } });
```

## Nesting depth

`maxDepth` (default `12`) caps how deeply a filter or include can nest, rejecting
pathological payloads with `400`:

```
filter[a][b][c][d][e][f][g][h][i][j][k][l][m]=1   → 400 Filter nesting too deep
```

## What is always enforced

- **Schema validation** — every field and relation is checked against the Prisma DMMF;
  unknown names return `400` with the list of valid ones.
- **Type coercion** — values are coerced to the column type before reaching Prisma.
- **Read-only** — no generated route writes data; all operations are safe.
- **Caching is safe** — the query-plan cache key includes method, route, query and
  body, and cached plans were already validated, so caching cannot bypass a policy.

## Recommendations

1. Turn on `strict` for anything public and list only what the client genuinely needs.
2. Keep `maxDepth` low (4–6) unless you have a reason not to.
3. Use `fields` to keep sensitive columns (hashes, tokens) out of filters *and* `select`.
4. Put authentication and rate limiting in front — this library does not do either.
