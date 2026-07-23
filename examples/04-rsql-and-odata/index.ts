/**
 * 04 · RSQL and OData on the same endpoint
 *
 * With `legacy: false` the three GET dialects are all enabled and picked by the
 * shape of the request, so they never collide:
 *
 *   filter is an object  → bracket grammar
 *   filter is a string   → RSQL / FIQL
 *   $filter is present   → OData
 *
 * Narrow the set with `formats: ['query', 'rsql']` if you prefer.
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
    legacy: false,
    formats: ['query', 'rsql', 'odata'],   // the default when legacy is false
}).applyTo(users);

app.use('/users', users);
app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try — one question, three dialects:

   bracket : GET /users?filter[age][gte]=30&filter[firstName][startsWith]=Al
   RSQL    : GET /users?filter=age=ge=30;firstName==Al*
   OData   : GET /users?$filter=age ge 30 and startswith(firstName,'Al')

   More RSQL (`;` = AND, `,` = OR, `*` = wildcard):
   GET /users?filter=active==true,age=lt=18
   GET /users?filter=role=in=(admin,editor)
   GET /users?filter=(role==admin,role==editor);active==true
   GET /users?filter=email==*@corp.com
   GET /users?filter=posts.title==Hello*          (through a relation)

   More OData:
   GET /users?$filter=active eq true or age lt 18
   GET /users?$filter=not (age lt 18)
   GET /users?$filter=contains(email,'@corp')
   GET /users?$orderby=age desc,lastName&$select=id,firstName&$top=20&$skip=40
*/
