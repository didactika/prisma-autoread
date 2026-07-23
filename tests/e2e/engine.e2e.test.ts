import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '../../src/auto-read';

let prisma: PrismaClient;

beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
});

afterAll(async () => {
    await prisma.$disconnect();
});

function buildApp() {
    const app = express();

    // Modern engine (GET brackets + JSON body), list + count.
    app.use(
        '/users',
        createAutoRead({
            model: 'User',
            delegate: prisma.user,
            methods: ['GET', 'POST'],
            routes: ['list', 'count', 'aggregate', 'groupBy'],
            legacy: false,
            searchable: ['firstName', 'lastName', 'email'],
        }).applyTo(express.Router()),
    );

    // Same model, legacy GET dialect.
    app.use(
        '/legacy-users',
        createAutoRead({
            model: 'User',
            delegate: prisma.user,
            methods: ['GET'],
            legacy: true,
        }).applyTo(express.Router()),
    );

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) =>
        res.status(err.status ?? 500).json({ error: err.message ?? 'Error' }),
    );
    return app;
}

describe('[E2E] createAutoRead – modern GET', () => {
    it('filters with an operator (age >= 30)', async () => {
        const res = await request(buildApp()).get('/users?filter%5Bage%5D%5Bgte%5D=30');
        expect(res.status).toBe(200);
        // Alice (30) and Charlie (35)
        expect(res.body.data.length).toBe(2);
        expect(res.body.data.every((u: any) => u.age >= 30)).toBe(true);
    });

    it('filters a boolean field', async () => {
        const res = await request(buildApp()).get('/users?filter%5Bactive%5D=true');
        expect(res.status).toBe(200);
        expect(res.body.data.every((u: any) => u.active === true)).toBe(true);
    });

    it('sorts descending and limits', async () => {
        const res = await request(buildApp()).get('/users?sort=-age&limit=1');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].firstName).toBe('Charlie'); // age 35
    });

    it('selects a subset of fields', async () => {
        const res = await request(buildApp()).get('/users?fields=id,firstName&limit=1');
        expect(res.status).toBe(200);
        expect(Object.keys(res.body.data[0]).sort()).toEqual(['firstName', 'id']);
    });
});

describe('[E2E] createAutoRead – count route', () => {
    it('counts all users', async () => {
        const res = await request(buildApp()).get('/users/count');
        expect(res.status).toBe(200);
        expect(res.body.count).toBeGreaterThanOrEqual(3);
    });

    it('counts with the same filter', async () => {
        const res = await request(buildApp()).get('/users/count?filter%5Bactive%5D=true');
        expect(res.status).toBe(200);
        // Alice + Charlie are active
        expect(res.body.count).toBe(2);
    });
});

describe('[E2E] createAutoRead – aggregate & group-by', () => {
    it('aggregates avg + count', async () => {
        const res = await request(buildApp()).get('/users/aggregate?avg=age&count=true');
        expect(res.status).toBe(200);
        expect(res.body._count).toBeGreaterThanOrEqual(3);
        expect(typeof res.body._avg.age).toBe('number');
    });

    it('groups by a boolean field', async () => {
        const res = await request(buildApp()).get('/users/group-by?by=active&count=true');
        expect(res.status).toBe(200);
        // active = true (Alice, Charlie) and false (Bob)
        expect(res.body.data.length).toBe(2);
        const total = res.body.data.reduce((n: number, g: any) => n + g._count, 0);
        expect(total).toBeGreaterThanOrEqual(3);
    });
});

describe('[E2E] createAutoRead – JSON body (POST)', () => {
    it('filters via a Prisma-native body', async () => {
        const res = await request(buildApp())
            .post('/users')
            .send({ where: { age: { lt: 30 } } });
        expect(res.status).toBe(200);
        // Only Bob (25)
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].firstName).toBe('Bob');
    });
});

describe('[E2E] createAutoRead – legacy GET dialect', () => {
    it('still understands the old syntax', async () => {
        const res = await request(buildApp()).get('/legacy-users?age=30');
        expect(res.status).toBe(200);
        expect(res.body.data[0].firstName).toBe('Alice');
    });
});
