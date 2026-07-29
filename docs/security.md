# Security

Checks run inside `QueryBuilder` for every modern dialect — query string, RSQL, OData
and JSON bodies — and, since 1.1.0, on the plan the legacy GET engine produces, so a
policy now applies to *every* protocol the endpoint accepts.

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

`fields` controls what a client may **ask for**. It does not change what comes back:
Prisma returns every column unless a `select` narrows it, so a column left out of
`fields` is still present in each row. To keep a column out of the response, hide it.

## Hidden fields — never queryable, never returned

```ts
security: {
    hidden: ['password', 'resetToken', 'enrolments.internalNote'],
}
```

A hidden field is removed from the response after execution, whatever route the row
took to get there — no `select`, an explicit `select`, an `include`, `include=*`, an
embedded MongoDB document, CSV output. It is also rejected on the way in:

| Where | Behaviour |
|---|---|
| `filter[password]=…`, `sort=password`, `fields=password` | `400 Unknown field 'password'` |
| `distinct`, `group-by`, `_min`/`_max`/`_sum`/`_avg` | `400`, same message |
| `?search=` | the field is dropped from the expansion, never probed |
| Error hints (`Available fields: …`) | hidden names are omitted |
| Response body | key absent |

The rejection is deliberately worded as if the field did not exist, so the endpoint
cannot be used to probe which sensitive columns a model has.

Paths are dotted and case-insensitive. A bare name applies to the root model; a dotted
one reaches into a relation or a MongoDB composite type:

```ts
hidden: [
    'password',                  // User.password
    'enrolments.internalNote',   // only inside the included relation
    'program.subjects.uuid',     // inside an embedded composite document
]
```

`hidden` composes with everything else and always wins — listing a field in both
`fields` and `hidden` still hides it.

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

## Legacy dialect

`legacy: true` (the default) drives the frozen 0.x middleware, which knows nothing
about `security`. The plan it produces is therefore re-validated against the same
policy before it reaches the database, so allow-lists, `hidden` and relation limits
behave identically on both engines.

> **Upgrading from 1.0.x:** allow-lists were silently ignored on the legacy dialect.
> If you set `security.fields` *and* kept `legacy: true`, requests that used to pass
> now return `400` — which was the configured intent all along. Widen the list if a
> client legitimately needs a field.

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
3. Put hashes, tokens and internal flags in `hidden`, not merely outside `fields` —
   only `hidden` keeps them out of the response body.
4. Put authentication and rate limiting in front — this library does not do either.
