/**
 * 13 · Legacy syntax and the migration path
 *
 * Nothing breaks when you upgrade. This file shows the three stages side by side,
 * so you can move at your own pace.
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import {
    createAutoRead,
    // The original 0.x API — still exported, still works.
    AutoReadMiddleware,
    FilterMiddleware,
} from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();

// ── Stage 0 · the original middleware, untouched ──────────────────────────────
// Frozen and still supported. On Express 5 it needs the extended query parser,
// because it reads `req.query`.
app.set('query parser', 'extended');

const legacyUsers = Router();
legacyUsers.use(FilterMiddleware.processQueryFilters('User'));
AutoReadMiddleware.applyToRouter(legacyUsers, {
    modelName: 'User',
    searchableFields: ['firstName', 'lastName', 'email'],
    findByFilter: async ({ where, include, orderBy, take, skip }) => {
        const [data, total] = await Promise.all([
            prisma.user.findMany({ where, include, orderBy, take, skip }),
            prisma.user.count({ where }),
        ]);
        return { data, total };
    },
});
app.use('/v0/users', legacyUsers);

// ── Stage 1 · new declaration, same client-facing syntax ──────────────────────
// `legacy: true` is the default. Clients change nothing; you gain count,
// aggregations, formats, cursor paging, security, cache and telemetry.
const stage1 = Router();
createAutoRead({
    model: 'User',
    delegate: prisma.user,               // no callback needed any more
    routes: ['list', 'count'],
    searchable: ['firstName', 'lastName', 'email'],
}).applyTo(stage1);
app.use('/v1/users', stage1);

// ── Stage 2 · the modern grammar ──────────────────────────────────────────────
const stage2 = Router();
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    legacy: false,
    methods: ['GET', 'QUERY'],
    routes: ['list', 'count', 'aggregate'],
}).applyTo(stage2);
app.use('/v2/users', stage2);

app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* The same question at each stage:

   v0 / v1 (old syntax)          v2 (modern syntax)
   ──────────────────────────    ─────────────────────────────────────────
   ?age=30                       ?filter[age]=30
   ?firstName[LIKE]=al           ?filter[firstName][contains]=al
   ?firstName[STARTS_WITH]=Al    ?filter[firstName][startsWith]=Al
   ?posts[title]=Hello           ?filter[posts][title]=Hello
   ?or[g1][a]=1&or[g1][b]=2      ?filter[or][0][a]=1&filter[or][1][b]=2
   ?metadata[theme]=dark         ?filter[metadata][path][0]=theme&filter[metadata][equals]=dark
   ?sort=age&order=desc          ?sort=-age
   —                             ?fields= ?distinct= ?cursor= RSQL, OData, QUERY bodies

   `legacy: true` and `legacy: false` are mutually exclusive per endpoint, because the
   two GET grammars are ambiguous together — run both endpoints during the transition,
   as above, and retire /v0 and /v1 when your clients have moved.
*/
