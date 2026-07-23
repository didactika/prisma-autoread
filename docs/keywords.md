# Keywords

Every reserved query parameter can be renamed. This matters when one of your columns
is called `fields`, `sort`, `count`, `page`… — rename the control and the name is free
for your data.

## Defaults

| Keyword | Default | Purpose |
|---|---|---|
| `filter` | `filter` | The filter expression / object |
| `sort` | `sort` | Ordering |
| `fields` | `fields` | Field selection (`select`) |
| `include` | `include` | Relation includes |
| `page` / `limit` | `page` / `limit` | Offset pagination |
| `cursor` | `cursor` | Cursor pagination |
| `search` | `search` | Full-text-ish search |
| `distinct` | `distinct` | Distinct fields |
| `format` | `format` | Output format negotiation |
| `count`, `sum`, `avg`, `min`, `max` | same | Aggregations |
| `by`, `having` | same | Group-by |

> OData uses its own `$`-prefixed parameters and is unaffected by renaming.

## Global configuration (once, at bootstrap)

```ts
import { Keywords } from '@didactika/prisma-autoread';

Keywords.configure({ fields: 'select', filter: 'q', limit: 'size' });
```

Every endpoint declared afterwards uses these names:

```
GET /users?q[age][gte]=30&select=id,firstName&size=20
```

Other helpers:

```ts
Keywords.current();      // the effective global map
Keywords.resolve({ … }); // global map + ad-hoc overrides
Keywords.reset();        // back to defaults (handy in tests)
```

## Per-endpoint override

```ts
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    keywords: { fields: 'select' },   // layered on top of the global map
});
```

Resolution order: **defaults → global (`Keywords.configure`) → per-endpoint (`keywords`)**.

## Effect on generated links

Pagination links use the configured names, so clients can follow them blindly:

```jsonc
// with { page: 'p', limit: 'size' }
"_links": { "self": { "href": "https://host/users?p=2&size=10" } }
```

## Worked example — a column named `fields`

```ts
Keywords.configure({ fields: 'select' });
```

```
GET /users?select=id,fields          # `select` picks columns…
GET /users?filter[fields][contains]=x # …and `fields` is now just a column
```
