/**
 * 14 · A complete API
 *
 * Two resources, every feature, shaped the way a real service would be: a public
 * surface locked down by an allow-list, an internal one that is wide open, shared
 * house-style parameter names, and one telemetry hook for the lot.
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import {
    createAutoRead,
    Keywords,
    type AutoReadOptions,
    type QueryTelemetry,
} from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();

// House style for the whole API, applied once.
Keywords.configure({ filter: 'q' });

const telemetry = (t: QueryTelemetry) => {
    if (t.execMs > 300) console.warn(`[slow] ${t.route} ${t.execMs}ms`);
};

/** Defaults every endpoint in this API shares. */
const base = (over: AutoReadOptions): AutoReadOptions => ({
    legacy: false,
    methods: ['GET', 'QUERY'],
    defaults: { limit: 25, maxLimit: 200, sort: 'id', order: 'desc' },
    cache: true,
    onQuery: telemetry,
    basePathPrefix: '/api/v1',
    ...over,
});

// ── Public: users ─────────────────────────────────────────────────────────────
const publicUsers = Router();
createAutoRead(base({
    model: 'User',
    delegate: prisma.user,
    routes: { list: true, count: { path: '/total' }, aggregate: { path: '/stats' } },
    searchable: ['firstName', 'lastName'],
    security: {
        strict: true,
        fields: ['id', 'firstName', 'lastName', 'role', 'active', 'createdAt'],
        relations: ['posts'],
        maxDepth: 4,
    },
})).applyTo(publicUsers);

// ── Public: posts ─────────────────────────────────────────────────────────────
const publicPosts = Router();
createAutoRead(base({
    model: 'Post',
    delegate: prisma.post,
    routes: ['list', 'count', 'groupBy'],
    searchable: ['title'],
    security: {
        strict: true,
        fields: ['id', 'title', 'published', 'authorId'],
        relations: ['author'],
        maxDepth: 3,
    },
})).applyTo(publicPosts);

// ── Internal: no allow-list, CSV-friendly, bigger pages ───────────────────────
const internalUsers = Router();
createAutoRead(base({
    model: 'User',
    delegate: prisma.user,
    routes: ['list', 'count', 'aggregate', 'groupBy'],
    defaults: { limit: 200, maxLimit: 5000, sort: 'id', order: 'asc' },
    cache: { max: 5000 },
})).applyTo(internalUsers);

app.use('/api/v1/users', publicUsers);
app.use('/api/v1/posts', publicPosts);
app.use('/internal/users', internalUsers);

app.use((err: any, _req: any, res: any, _next: any) => {
    if (!err.status) console.error(err);
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal Server Error' });
});

app.listen(3000, () => console.log('http://localhost:3000/api/v1/users'));

/* The surface this produces:

   GET|QUERY  /api/v1/users            list        (HAL, 25/page, cached)
   GET|QUERY  /api/v1/users/total      count
   GET|QUERY  /api/v1/users/stats      aggregate
   GET|QUERY  /api/v1/posts            list
   GET|QUERY  /api/v1/posts/count      count
   GET|QUERY  /api/v1/posts/group-by   grouping
   GET|QUERY  /internal/users(/count|/aggregate|/group-by)

   Try:
     GET /api/v1/users?q[role]=admin&sort=-createdAt&fields=id,firstName
     GET /api/v1/users?q[posts][some][published]=true
     GET /api/v1/users/stats?avg=age&count=true
     GET /api/v1/posts/group-by?by=published&count=true
     GET /api/v1/users?q[email][contains]=@corp     → 400, email is not exposed
     GET /internal/users?format=csv&limit=5000
     QUERY /api/v1/users   { "where": { "active": true }, "limit": 50 }

   Still to add in front of this: authentication, rate limiting and CORS —
   deliberately out of scope for the library.
*/
