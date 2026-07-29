# Examples

Runnable snippets, ordered from the simplest possible endpoint to a complete API.
Each folder is one self-contained `index.ts` with the requests to try at the bottom.

> These files are illustrative and are **not** compiled or published with the package.

## Index

| # | Example | Shows |
|---|---|---|
| 01 | [minimal-express](./01-minimal-express) | The smallest working endpoint. |
| 02 | [modern-query](./02-modern-query) | Operators, logical groups, relations, sort, fields, include. |
| 03 | [query-method](./03-query-method) | The `QUERY` HTTP method and `POST` fallback with a JSON body. |
| 04 | [rsql-and-odata](./04-rsql-and-odata) | RSQL and OData on the same endpoint. |
| 05 | [output-formats](./05-output-formats) | HAL, plain, JSON:API, CSV and content negotiation. |
| 06 | [count-and-aggregations](./06-count-and-aggregations) | `count`, `aggregate`, `group-by` and custom paths. |
| 07 | [security](./07-security) | Allow-lists, hidden fields, strict deny-by-default and depth limits. |
| 08 | [custom-keywords](./08-custom-keywords) | Renaming reserved parameters that clash with columns. |
| 09 | [cursor-pagination](./09-cursor-pagination) | Cursor paging for large datasets. |
| 10 | [cache-and-telemetry](./10-cache-and-telemetry) | Query-plan cache and the `onQuery` hook. |
| 11 | [fastify](./11-fastify) | The Fastify binding. |
| 12 | [hono](./12-hono) | The Hono binding. |
| 13 | [legacy-and-migration](./13-legacy-and-migration) | Old syntax and new engine side by side. |
| 14 | [full-api](./14-full-api) | Several resources, every feature, production-shaped. |
| 15 | [mongodb-embedded](./15-mongodb-embedded) | Filtering inside MongoDB composite `type` blocks. |

## Shared schema

Every example assumes this Prisma schema (example 15 brings its own, MongoDB one):

```prisma
model User {
  id        Int      @id @default(autoincrement())
  firstName String
  lastName  String
  email     String   @unique
  age       Int
  role      String   @default("user")
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  metadata  Json?
  posts     Post[]
}

model Post {
  id        Int     @id @default(autoincrement())
  title     String
  published Boolean @default(false)
  authorId  Int
  author    User    @relation(fields: [authorId], references: [id])
}
```

## Running one

```bash
npm install @didactika/prisma-autoread @prisma/client express
npx prisma generate
npx tsx examples/01-minimal-express/index.ts
```

Swap `express` for `fastify` or `hono` in examples 11 and 12.
