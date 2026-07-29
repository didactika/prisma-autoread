# Query language

The modern grammar (`legacy: false`) mirrors Prisma's `where`. Values are coerced to
the column type from your schema; unknown fields return `400`.

## Filtering

```
GET /users?filter[age][gte]=30
GET /users?filter[firstName][contains]=Al&filter[firstName][mode]=insensitive
GET /users?filter[id][in]=1,2,3
GET /users?filter[deletedAt][isNull]=true
```

### Operators

| Alias | Prisma | | Alias | Prisma |
|---|---|---|---|---|
| `eq` / `equals` | `equals` | | `contains` / `like` | `contains` |
| `ne` / `not` | `not` | | `startsWith` / `sw` | `startsWith` |
| `gt` `gte` `lt` `lte` | same | | `endsWith` / `ew` | `endsWith` |
| `in` | `in` | | `mode` | `mode` |
| `nin` / `notIn` | `notIn` | | `isNull` | `equals: null` / `not: null` |

A bare list is treated as `in`: `filter[id]=1,2` → `{ id: { in: [1, 2] } }`.
A bare value is equality: `filter[firstName]=Alice` → `{ firstName: 'Alice' }`.

## Logical groups

```
GET /users?filter[or][0][active]=true&filter[or][1][age][lt]=18
→ { OR: [ { active: true }, { age: { lt: 18 } } ] }

GET /users?filter[not][active]=true
→ { NOT: { active: true } }
```

`and`, `or`, `not` (and their uppercase Prisma spellings) are accepted and can be nested.

## Relations

```
# to-many: auto-wrapped in `some`
GET /users?filter[posts][title][startsWith]=Hello
→ { posts: { some: { title: { startsWith: 'Hello' } } } }

# explicit relation operators
GET /users?filter[posts][none][published]=false
GET /orders?filter[customer][is][email][contains]=@corp

# to-one: direct nesting
GET /orders?filter[customer][email][contains]=@corp
```

Supported relation operators: `some`, `every`, `none`, `is`, `isNot`.

## Embedded documents (MongoDB composite types)

A `type` block in a MongoDB schema is not a model — it is an embedded document — and
Prisma filters it with its own operator set. Those fields are addressed exactly like
relations, and the right wrapper is inserted for you:

```prisma
model CourseSchedule {
  id      String  @id @default(auto()) @map("_id") @db.ObjectId
  uuid    String  @unique
  program Program
}

type Program { shortname String  name String  subjects Subject[] }
type Subject { shortname String  type String  activities Activity[] }
```

```
# single embedded document → wrapped in `is`
GET /course-schedules?filter[program][shortname]=MAT
→ { program: { is: { shortname: 'MAT' } } }

# embedded list → wrapped in `some`
GET /course-schedules?filter[program][subjects][type]=lab
→ { program: { is: { subjects: { some: { type: 'lab' } } } } }

# nesting keeps going, operators and type coercion included
GET /course-schedules?filter[program][subjects][startDate][gte]=2026-01-01
GET /course-schedules?filter[program][subjects][activities][codeSuffix]=A1
```

Write the wrapper yourself when you need a different one:

```
GET /course-schedules?filter[program][isNot][shortname]=MAT
GET /course-schedules?filter[program][is][subjects][every][type]=lab
```

| Shape | Operators |
|---|---|
| single document | `is`, `isNot`, `equals`, `isSet` |
| list of documents | `some`, `every`, `none`, `equals`, `isEmpty`, `isSet` |

Every field inside an embedded document is validated against the composite type and
coerced to its declared type, just like a column on the model.

Two more rules follow from how Prisma models embedded data:

- **`fields=program`** projects the whole document (`select: { program: true }`).
- **`include=program`** is a no-op. Embedded documents always come back with the row,
  and Prisma rejects them inside `include`; `include=*` skips them for the same reason.

The old GET syntax understands the same paths (`?program[shortname]=MAT`,
`?program[shortname][STARTS_WITH]=MA`) and inserts the same wrappers.

## JSON columns

Prisma-native JSON filters, with the `path` normalised to your datasource:

```
GET /users?filter[metadata][path][0]=theme&filter[metadata][equals]=dark
GET /users?filter[metadata][path][0]=bio&filter[metadata][string_contains]=dev
```

## Sorting

```
GET /users?sort=-createdAt,lastName
→ orderBy: [{ createdAt: 'desc' }, { lastName: 'asc' }]
```

## Field selection and includes

```
GET /users?fields=id,firstName,email     → select
GET /users?include=posts[comments]        → include, nested
GET /users?distinct=email                 → distinct
```

> Prisma forbids `select` and `include` together — if both are given, `select` wins.

## Search

```
GET /users?search=alice
```

Expands to `OR` of `contains` across the configured `searchable` fields, AND-ed with
the rest of the filter.

## Pagination

```
GET /users?page=2&limit=20        # offset
GET /users?limit=20&cursor=42     # cursor; response carries pagination.nextCursor
```

## Aggregations

```
GET /users/aggregate?avg=age&count=true&filter[active]=true
GET /users/group-by?by=role&count=true
```

See [Routes](./routes.md) for the full aggregation surface.

## Other dialects

The same semantics are reachable through RSQL, OData and JSON bodies — see
[Protocols](./protocols.md).
