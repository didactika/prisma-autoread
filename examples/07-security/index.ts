/**
 * 07 · Security: allow-lists, strict mode and depth limits
 *
 * Checks live in the query builder, so they apply to every protocol — brackets,
 * RSQL, OData and JSON bodies alike.
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();

// ── Public surface: deny by default ───────────────────────────────────────────
// `strict` refuses to start unless you list the fields, and rejects wildcards.
// Relations default to none, so nothing can be traversed unless named.
const publicUsers = Router();
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    legacy: false,
    security: {
        strict: true,
        fields: ['id', 'firstName', 'lastName', 'role', 'active', 'createdAt'],
        relations: ['posts'],
        maxDepth: 4,
    },
}).applyTo(publicUsers);
app.use('/public/users', publicUsers);

// ── Internal surface: allow-lists without strict ──────────────────────────────
const internalUsers = Router();
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    legacy: false,
    security: { fields: '*', relations: '*', maxDepth: 8 },
}).applyTo(internalUsers);
app.use('/internal/users', internalUsers);

app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try:
   GET /public/users?filter[role]=admin        → 200
   GET /public/users?filter[email][contains]=@ → 400  (email is not listed)
   GET /public/users?fields=id,email           → 400  (select is checked too)
   GET /public/users?filter[posts][some][published]=true → 200 (posts is listed)
   GET /public/users?filter[a][b][c][d][e]=1   → 400  (deeper than maxDepth)

   These throw at startup, not per request — a misconfigured endpoint never ships:
     security: { strict: true }                       → no field allow-list
     security: { strict: true, fields: '*' }          → wildcard rejected
     security: { strict: true, fields: ['id'], relations: '*' } → wildcard rejected

   Keep out of the allow-list anything you never want filtered or selected:
   password hashes, tokens, internal flags.
   Authentication and rate limiting belong in front of this — they are not its job.
*/
