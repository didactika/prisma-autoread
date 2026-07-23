/**
 * 02 · The modern query grammar
 *
 * `legacy: false` switches GET to the Prisma-shaped grammar: one `filter`
 * parameter that mirrors `where`, plus sort / fields / include / pagination.
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
    legacy: false,                                  // modern grammar
    searchable: ['firstName', 'lastName', 'email'], // powers ?search=
    defaults: { limit: 20, maxLimit: 100, sort: 'createdAt', order: 'desc' },
}).applyTo(users);

app.use('/users', users);
app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try — comparisons:
   GET /users?filter[age][gte]=30
   GET /users?filter[age][gte]=18&filter[age][lte]=65
   GET /users?filter[role][in]=admin,editor
   GET /users?filter[email][endsWith]=@corp.com
   GET /users?filter[firstName][contains]=al&filter[firstName][mode]=insensitive
   GET /users?filter[metadata][path][0]=theme&filter[metadata][equals]=dark

   Logical groups:
   GET /users?filter[or][0][role]=admin&filter[or][1][age][gte]=65
   GET /users?filter[not][active]=false

   Relations (to-many is wrapped in `some` automatically):
   GET /users?filter[posts][title][startsWith]=Hello
   GET /users?filter[posts][none][published]=false

   Shaping the answer:
   GET /users?sort=-createdAt,lastName
   GET /users?fields=id,firstName,email
   GET /users?include=posts
   GET /users?distinct=role
   GET /users?search=alice
   GET /users?page=2&limit=50
*/
