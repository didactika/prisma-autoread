/**
 * 06 · Counts, aggregations and grouping
 *
 * `routes` decides which operations exist. All of them share the same filter, so
 * `?filter[...]` behaves identically on every one. Paths are configurable.
 *
 * These routes need a real Prisma `delegate` (not a `findByFilter` callback).
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
    legacy: false,
    methods: ['GET', 'QUERY'],
    // Short form would be ['list','count','aggregate','groupBy'];
    // the map form lets you rename the paths.
    routes: {
        list: true,                          // GET|QUERY /
        count: { path: '/total' },           // GET|QUERY /total
        aggregate: { path: '/stats' },       // GET|QUERY /stats
        groupBy: { path: '/breakdown' },     // GET|QUERY /breakdown
    },
}).applyTo(users);

app.use('/users', users);
app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try:

   Count, reusing any filter:
   GET /users/total
   GET /users/total?filter[active]=true            → { "count": 42 }

   Aggregate (sum / avg / min / max / count):
   GET /users/stats?avg=age&count=true
   GET /users/stats?min=age&max=age&filter[role]=admin
   → { "_count": 42, "_avg": { "age": 31.4 } }

   Group by one or more fields:
   GET /users/breakdown?by=role&count=true
   GET /users/breakdown?by=role,active&count=true&avg=age
   → { "data": [ { "role": "admin", "_count": 3, "_avg": { "age": 41 } }, … ] }

   In a body, aggregations accept the friendly or the Prisma-native spelling:
   QUERY /users/stats   { "where": { "active": true }, "avg": ["age"], "count": true }
   QUERY /users/stats   { "where": { "active": true }, "_avg": { "age": true }, "_count": true }

   `having` filters the groups (Prisma-native shape, body only):
   QUERY /users/breakdown
   { "by": ["role"], "count": true, "having": { "age": { "_avg": { "gt": 30 } } } }

   Note: when `by` is present the default sort and page size are not applied, because
   Prisma requires them to reference the grouped fields. Pass them explicitly if needed.
*/
