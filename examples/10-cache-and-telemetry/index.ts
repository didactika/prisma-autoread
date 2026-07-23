/**
 * 10 · Query-plan cache and telemetry
 *
 * Parsing, validating and coercing a request is pure CPU work that repeats for
 * identical requests. `cache` remembers the plan; `onQuery` tells you what each
 * request cost. The database is always queried — only the parsing is cached.
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAutoRead, type QueryTelemetry } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();
const users = Router();

createAutoRead({
    model: 'User',
    delegate: prisma.user,
    legacy: false,
    methods: ['GET', 'QUERY'],
    routes: ['list', 'count'],

    // true → a 500-entry LRU; or { max: 2000 } to size it yourself.
    cache: { max: 2000 },

    onQuery: (t: QueryTelemetry) => {
        // Ship these wherever your metrics live.
        console.log(
            `[autoread] ${t.method} ${t.route} format=${t.format} ` +
            `parse=${t.parseMs}ms exec=${t.execMs}ms cache=${t.cacheHit ? 'HIT' : 'MISS'}`,
        );

        // metrics.histogram('autoread.parse_ms', t.parseMs, { route: t.route });
        // metrics.histogram('autoread.exec_ms',  t.execMs,  { route: t.route });
        // if (t.cacheHit) metrics.increment('autoread.cache_hit');
        if (t.execMs > 500) console.warn(`[autoread] slow ${t.route}: ${t.execMs}ms`);
    },
}).applyTo(users);

app.use('/users', users);
app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try — issue the same request twice and watch the log:
   GET /users?filter[age][gte]=30
   → parse=3ms exec=12ms cache=MISS
   GET /users?filter[age][gte]=30
   → parse=0ms exec=11ms cache=HIT

   The cache key is method + route + query + body, so a different filter is a
   different plan. Cached plans were already validated and authorised, so caching
   can never bypass the access policy.

   What to watch:
   - `parseMs` climbing → very large or deeply nested filters.
   - `execMs` climbing → missing database indexes on what clients filter and sort.
   - a low hit rate → highly variable queries; the cache may not be worth it.
*/
