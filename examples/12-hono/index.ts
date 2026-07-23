/**
 * 12 · Hono
 *
 * Same engine on Hono — runs on Node, Bun, Deno, Cloudflare Workers and friends.
 * Hono is not a dependency of this package; the app is typed structurally.
 */
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = new Hono();

// Mount the endpoint on its own sub-app, then attach it under a path.
const users = new Hono();
createAutoRead({
    model: 'User',
    delegate: prisma.user,
    legacy: false,
    methods: ['GET', 'QUERY'],       // `app.on()` routes any method, QUERY included
    routes: ['list', 'count'],
    output: 'plain',                 // lean payloads for edge runtimes
}).applyToHono(users);

app.route('/users', users);

app.onError((err: any, c) => c.json({ error: err.message }, err.status ?? 500));

export default app;

/* Notes
   - Hono has no deep-object query parser, so the binding parses the query string
     itself: bracket notation works exactly as on Express and Fastify.
   - CSV (or any format with a content type) is returned with the right header:
     GET /users?format=csv

   Try:
     GET   /users?filter[age][gte]=30&sort=-createdAt&limit=20
     GET   /users/count?filter[active]=true
     QUERY /users   { "where": { "role": "admin" } }

   Run on Node:
     import { serve } from '@hono/node-server';
     serve({ fetch: app.fetch, port: 3000 });
*/
