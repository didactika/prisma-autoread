/**
 * 05 · Output formats and content negotiation
 *
 * Four formats ship in the box. Pick a default with `output`, and let clients
 * override it per request with `?format=` or an `Accept` header.
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();

// Default HAL: data + pagination + HATEOAS links.
const users = Router();
createAutoRead({ model: 'User', delegate: prisma.user, legacy: false }).applyTo(users);
app.use('/users', users);

// Same resource, JSON:API by default — handy for a second, spec-bound surface.
const jsonApiUsers = Router();
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    legacy: false,
    output: 'jsonapi',
}).applyTo(jsonApiUsers);
app.use('/jsonapi/users', jsonApiUsers);

// A reporting surface that defaults to CSV.
const exports_ = Router();
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    legacy: false,
    output: 'csv',
    defaults: { limit: 1000, maxLimit: 5000, sort: 'id', order: 'asc' },
}).applyTo(exports_);
app.use('/exports/users', exports_);

app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try — per-request negotiation:
   GET /users                                  → HAL      (data + pagination + _links)
   GET /users?format=plain                     → { data, meta }
   GET /users?format=jsonapi                   → { data: [{ type, id, attributes }], links }
   GET /users?format=csv                       → text/csv
   GET /users     Accept: text/csv             → text/csv
   GET /users     Accept: application/vnd.api+json → JSON:API

   Per-endpoint defaults:
   GET /jsonapi/users
   GET /exports/users?filter[active]=true&fields=id,email
*/
