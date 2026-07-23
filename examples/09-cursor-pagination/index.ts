/**
 * 09 · Cursor pagination
 *
 * Offset paging degrades as `skip` grows. For deep lists and infinite scroll, ask
 * for a cursor instead: the answer carries `pagination.nextCursor` and a `next`
 * link, and the engine skips the cursor row for you.
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();
const posts = Router();

createAutoRead({
    model: 'Post',
    delegate: prisma.post,
    legacy: false,
    methods: ['GET', 'QUERY'],
    defaults: { limit: 50, maxLimit: 200, sort: 'id', order: 'asc' },
}).applyTo(posts);

app.use('/posts', posts);
app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try — walk the list:

   1) First page
      GET /posts?limit=50
      → { "data": [...],
          "pagination": { "limit": 50, "nextCursor": 50, "hasNext": true },
          "_links": { "next": { "href": "…/posts?cursor=50&limit=50" } } }

   2) Follow the cursor (or just follow `_links.next`)
      GET /posts?limit=50&cursor=50

   3) The last page has no `nextCursor`.

   Cursors combine with filters, and the filter is preserved in the links:
      GET /posts?filter[published]=true&limit=50
      GET /posts?filter[published]=true&limit=50&cursor=120

   In a body:
      QUERY /posts   { "where": { "published": true }, "cursor": 120, "limit": 50 }

   Notes
   - The cursor is the last row's id; pass an object for a composite key:
     QUERY /posts   { "cursor": { "id": 120 } }
   - Keep the sort stable and indexed (here `id`); cursor paging assumes a
     deterministic order.
   - `page` and `cursor` are alternatives — if you send `page`, offset paging wins.
*/
