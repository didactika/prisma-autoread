/**
 * 03 · The QUERY method (and the POST fallback)
 *
 * `QUERY` is a safe, idempotent HTTP method that carries a body — a GET you can
 * put a long question in. Enable it with `methods`, and the body is read as a
 * Prisma-shaped query. `POST` is offered for clients that don't speak QUERY yet.
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();
const users = Router();

createAutoRead({
    model: 'User',
    delegate: prisma.user,
    methods: ['GET', 'QUERY', 'POST'],   // body parsing is wired up for you
    legacy: false,
    routes: ['list', 'count'],
}).applyTo(users);

app.use('/users', users);
app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try — the same question three ways:

   GET   /users?filter[age][gte]=30&sort=-createdAt

   QUERY /users
   Content-Type: application/json
   {
     "where":   { "age": { "gte": 30 }, "OR": [{ "role": "admin" }, { "active": true }] },
     "orderBy": [{ "createdAt": "desc" }],
     "select":  { "id": true, "firstName": true, "email": true },
     "page": 1,
     "limit": 20
   }

   POST  /users            (identical body, for clients without QUERY)

   Nested relations read naturally in a body:
   QUERY /users
   { "where": { "posts": { "some": { "published": true, "title": { "contains": "release" } } } } }

   curl:
   curl -X QUERY http://localhost:3000/users \
        -H 'content-type: application/json' \
        -d '{"where":{"age":{"gte":30}},"limit":5}'
*/
