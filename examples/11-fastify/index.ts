/**
 * 11 · Fastify
 *
 * Same engine, different binding. Fastify is not a dependency of this package —
 * the instance is typed structurally, so nothing extra is pulled in.
 */
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

// Fastify v5 needs non-standard methods registered once before they can be routed.
app.addHttpMethod('QUERY', { hasBody: true });

createAutoRead({
    model: 'User',
    delegate: prisma.user,
    legacy: false,
    methods: ['GET', 'QUERY'],
    routes: ['list', 'count', 'aggregate'],
    searchable: ['firstName', 'lastName', 'email'],
    basePathPrefix: '/api/v1',        // only affects generated links
}).applyToFastify(app);

// Fastify's own error shape; the engine's errors carry `.status`.
app.setErrorHandler((err: any, _req, reply) => {
    reply.code(err.status ?? 500).send({ error: err.message });
});

await app.listen({ port: 3000 });

/* Notes
   - Routes are registered at the configured paths (`/`, `/count`, `/aggregate`).
     To mount them under a prefix, wrap them in a Fastify plugin:

       app.register(async (scope) => {
         createAutoRead({ model: 'User', delegate: prisma.user }).applyToFastify(scope);
       }, { prefix: '/users' });

   - Fastify parses JSON bodies itself; the binding reads the query string directly,
     so bracket notation works regardless of Fastify's own query parser.

   Try:
     GET   /users?filter[age][gte]=30&sort=-createdAt
     GET   /users/count?filter[active]=true
     GET   /users/aggregate?avg=age&count=true
     QUERY /users   { "where": { "age": { "gte": 30 } }, "limit": 20 }
*/
