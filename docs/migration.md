# Migration from 0.x

**Nothing breaks.** The original middleware still ships, is still exported, and behaves
exactly as before. Migrating is opt-in and can be done in two steps.

## Step 0 — keep what you have

```ts
import { AutoReadMiddleware, FilterMiddleware } from '@didactika/prisma-autoread';

router.use(FilterMiddleware.processQueryFilters('User'));
AutoReadMiddleware.applyToRouter(router, { modelName: 'User', findByFilter });
```

This path is frozen under `src/legacy/` and covered by its original test suite. It is
deprecated in favour of `createAutoRead`, but it is not going away in 1.x.

## Step 1 — new declaration, same query syntax

Swap the declaration while your clients keep sending the old query strings
(`legacy: true` is the default):

```ts
createAutoRead({
    model: 'User',
    delegate: prisma.user,      // or keep findByFilter
    methods: ['GET'],
    routes: ['list'],
    searchable: ['firstName', 'lastName', 'email'],
}).applyTo(router);
```

You immediately gain: `count`/`aggregate`/`group-by` routes, output formats, cursor
pagination, security allow-lists, the plan cache and telemetry — with no client change.

The old GET grammar is served by driving the frozen legacy engine, so results are
identical:

| Old syntax | Still works |
|---|:---:|
| `?age=30` | ✔ |
| `?firstName[LIKE]=al` (`EXACT`, `STARTS_WITH`, `ENDS_WITH`) | ✔ |
| `?campus[uuid]=A` (relations) | ✔ |
| `?or[g1][firstName]=Alice` (OR/AND groups) | ✔ |
| `?metadata[theme]=dark` (JSON columns) | ✔ |
| `?search=`, `?include=`, `?page=`, `?limit=`, `?sort=`, `?order=` | ✔ |

## Step 2 — adopt the modern grammar

Set `legacy: false` when your clients are ready:

```ts
createAutoRead({ model: 'User', delegate: prisma.user, legacy: false });
```

| Old | New |
|---|---|
| `?firstName[LIKE]=al` | `?filter[firstName][contains]=al` |
| `?firstName[STARTS_WITH]=Al` | `?filter[firstName][startsWith]=Al` |
| `?campus[uuid]=A` | `?filter[campus][uuid]=A` |
| `?or[g1][a]=1&or[g1][b]=2` | `?filter[or][0][a]=1&filter[or][1][b]=2` |
| `?metadata[theme]=dark` | `?filter[metadata][path][0]=theme&filter[metadata][equals]=dark` |
| `?sort=age&order=desc` | `?sort=-age` |
| — | `?fields=`, `?distinct=`, `?cursor=`, RSQL, OData, `QUERY` bodies |

> `legacy: true` and `legacy: false` are mutually exclusive **per endpoint** — the two
> GET grammars are ambiguous together. Run two endpoints during a transition if you need
> to support both at once.

## Configuration mapping

| 0.x (`AutoReadConfig`) | 1.x (`AutoReadOptions`) |
|---|---|
| `modelName` | `model` |
| `findByFilter` | `findByFilter` (or, better, `delegate`) |
| `searchableFields` | `searchable` |
| `defaultLimit` / `maxLimit` | `defaults.limit` / `defaults.maxLimit` |
| `basePathPrefix` | `basePathPrefix` |
| `jsonPathSyntax` | `jsonPathSyntax` (now auto-detected from the provider) |

## Checklist

- [ ] Upgrade the package; run your test suite — the old path should be untouched.
- [ ] Replace the middleware pair with `createAutoRead({ … })` (`legacy: true`).
- [ ] Add `routes: ['list', 'count']` and any format you want.
- [ ] Add a `security` allow-list for public endpoints.
- [ ] When clients are ready, flip `legacy: false` and update their query strings.
