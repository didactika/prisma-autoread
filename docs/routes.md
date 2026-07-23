# Routes

## Available routes

| Route | Prisma call | Default path | Response |
|---|---|---|---|
| `list` | `findMany` + `count` | `/` | Rendered by the output format |
| `count` | `count` | `/count` | `{ "count": 12 }` |
| `aggregate` | `aggregate` | `/aggregate` | `{ "_count": 3, "_avg": { "age": 30 } }` |
| `groupBy` | `groupBy` | `/group-by` | `{ "data": [ … ] }` |

All routes share the same filter, so `?filter[...]` behaves identically everywhere.

## Declaring routes

```ts
// Short form — default paths
routes: ['list', 'count', 'aggregate', 'groupBy']

// Map form — custom path per route
routes: {
    list:  true,                  // GET|QUERY /
    count: { path: '/total' },    // GET|QUERY /total
}
```

`RouteConfig` is an object so future per-route options (methods, output) can be added
without a breaking change.

## Aggregations

Query-string parameters (or their body equivalents):

| Parameter | Meaning | Example |
|---|---|---|
| `sum`, `avg`, `min`, `max` | Field lists | `?sum=age,score` |
| `count` | `true` or a field list | `?count=true` |
| `by` | Group-by fields (group-by only) | `?by=role,active` |
| `having` | Prisma-native `having` (body only) | `{ "having": { "age": { "_avg": { "gt": 30 } } } }` |

```
GET /users/aggregate?avg=age&count=true&filter[active]=true
→ { "_count": 2, "_avg": { "age": 32.5 } }

GET /users/group-by?by=role&count=true
→ { "data": [ { "role": "admin", "_count": 2 }, { "role": "user", "_count": 9 } ] }
```

If no aggregation is requested, `aggregate` defaults to `_count: true`.

> **Group-by and Prisma constraints:** when `by` is present the engine does *not* apply
> the default sort or page size, because Prisma requires `orderBy`/`take` on a group-by
> to reference the grouped fields. Pass them explicitly if you need them.

## Requirements

`count`, `aggregate` and `groupBy` need a real Prisma `delegate`. With `findByFilter`
only `list` (and a derived count) is available.

## Adding your own route

```ts
import { Route, RouteRegistry } from '@didactika/prisma-autoread';

class ExistsRoute extends Route {
    readonly name = 'list';          // reuse a slot, or extend RouteName
    async execute(spec, ctx) {
        return { body: { exists: (await ctx.executor.count(spec)) > 0 } };
    }
}
```

Register it in a `RouteRegistry` and drive it through `EndpointController` — the core
stays untouched.
