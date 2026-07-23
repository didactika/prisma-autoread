/**
 * 01 · Minimal Express endpoint
 *
 * The smallest thing that works: one model, one route, sensible defaults.
 * What you get for free: GET only, the legacy query grammar, HAL output,
 * 10 items per page (capped at 100), sorted by `id`.
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
}).applyTo(users);

app.use('/users', users);

// Errors carry `.status` — register a handler after your routes.
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal Server Error' });
});

app.listen(3000, () => console.log('http://localhost:3000/users'));

/* Try:
   GET /users
   GET /users?page=2&limit=5
   GET /users?sort=lastName&order=desc
   GET /users?age=30                     (legacy grammar, enabled by default)
*/
