# Getting started

## Install

```bash
npm install @didactika/prisma-autoread
npm install @prisma/client express   # peer dependencies
npx prisma generate                  # the engine reads Prisma's DMMF at runtime
```

## Declare an endpoint

```ts
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();
const router = Router();

createAutoRead({
    model: 'User',
    delegate: prisma.user,               // unlocks list, count, aggregate and group-by
    methods: ['GET', 'QUERY'],
    routes: ['list', 'count'],
    legacy: false,                       // modern query grammar
    searchable: ['firstName', 'lastName', 'email'],
}).applyTo(router);

app.use('/users', router);

// Errors carry `.status`; register a handler after your routes.
app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));

app.listen(3000);
```

## First requests

```
GET   /users
GET   /users?filter[age][gte]=30&sort=-createdAt&limit=20
GET   /users?fields=id,firstName&include=posts
GET   /users/count?filter[active]=true
QUERY /users     { "where": { "age": { "gte": 30 } }, "orderBy": [{ "createdAt": "desc" }] }
```

## What you get by default

| | |
|---|---|
| Routes | `list` only (add `count`, `aggregate`, `groupBy` explicitly) |
| Methods | `GET` |
| GET grammar | the **legacy** syntax (`legacy: true`) — set `legacy: false` for the modern one |
| Output | HAL (`data` + `pagination` + `_links`) |
| Page size | 10, capped at 100 |
| Sort | `id` ascending |
| Security | everything allowed (see [Security](./security.md)) |

## Next

- [Query language](./query-language.md) — operators, relations, JSON, sorting, selection.
- [Configuration](./configuration.md) — the full option reference.
- [Migration](./migration.md) — if you are coming from 0.x.
