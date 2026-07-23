/**
 * 08 · Renaming reserved parameters
 *
 * Every control parameter can be renamed, which matters when one of your columns
 * is called `fields`, `sort`, `count`, `page`… Rename the control and the name is
 * free for your data.
 *
 * Resolution order: defaults → global (`Keywords.configure`) → per endpoint.
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAutoRead, Keywords } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();

// ── Global, once at bootstrap ─────────────────────────────────────────────────
// House style for the whole API: `q` for the filter, `select` for field selection.
Keywords.configure({ filter: 'q', fields: 'select' });

const users = Router();
createAutoRead({ model: 'User', delegate: prisma.user, legacy: false }).applyTo(users);
app.use('/users', users);

// ── Per endpoint, layered on top of the global map ────────────────────────────
// This resource has a `page` column, so the pagination control moves out of the way.
const posts = Router();
createAutoRead({
    model: 'Post',
    delegate: prisma.post,
    legacy: false,
    keywords: { page: 'pageNumber', limit: 'pageSize' },
}).applyTo(posts);
app.use('/posts', posts);

app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try — the global renames:
   GET /users?q[age][gte]=30&select=id,firstName
   GET /users?fields=id                 → ignored: `fields` is now just a column name
   GET /users?q[fields][contains]=x     → filters a column literally called `fields`

   Per-endpoint renames (they inherit `q` and `select` from the global map):
   GET /posts?q[published]=true&pageNumber=2&pageSize=50

   Generated links use the configured names, so clients can follow them blindly:
   "_links": { "self": { "href": "…/posts?pageNumber=2&pageSize=50" } }

   Useful in tests:
   Keywords.current();   // the effective global map
   Keywords.reset();     // back to defaults
*/
