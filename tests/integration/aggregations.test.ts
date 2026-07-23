import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import express, { Router } from 'express';
import request from 'supertest';
import { createAutoRead } from '../../src/auto-read';

const rows = [
    { id: 1, firstName: 'Alice', age: 30 },
    { id: 2, firstName: 'Bob', age: 25 },
];

function buildApp() {
    const captured: any = {};
    const delegate = {
        findMany: async (a: any) => { captured.listArgs = a; return rows; },
        count: async () => rows.length,
        aggregate: async (a: any) => { captured.aggArgs = a; return { _count: 2, _avg: { age: 27.5 } }; },
        groupBy: async (a: any) => { captured.groupArgs = a; return [{ active: true, _count: 2 }]; },
    };

    const app = express();
    const router = Router();
    createAutoRead({
        model: 'User',
        delegate,
        methods: ['GET', 'POST'],
        routes: ['list', 'count', 'aggregate', 'groupBy'],
        legacy: false,
    }).applyTo(router);
    app.use('/users', router);
    app.use((err: any, _req: any, res: any, _next: any) =>
        res.status(err.status ?? 500).json({ error: err.message }),
    );
    return { app, captured };
}

describe('[Integration] aggregate route', () => {
    it('builds _avg + _count from query params', async () => {
        const { app, captured } = buildApp();
        const res = await request(app).get('/users/aggregate?avg=age&count=true');
        expect(res.status).toBe(200);
        expect(captured.aggArgs).toMatchObject({ _avg: { age: true }, _count: true });
        expect(res.body).toEqual({ _count: 2, _avg: { age: 27.5 } });
    });

    it('reuses the filter and defaults to _count when only where is given', async () => {
        const { app, captured } = buildApp();
        await request(app).get('/users/aggregate?filter%5Bage%5D%5Bgte%5D=30&sum=age');
        expect(captured.aggArgs.where).toEqual({ age: { gte: 30 } });
        expect(captured.aggArgs._sum).toEqual({ age: true });
    });

    it('accepts a Prisma-native body via POST', async () => {
        const { app, captured } = buildApp();
        await request(app).post('/users/aggregate').send({ where: { age: { gte: 30 } }, _avg: { age: true } });
        expect(captured.aggArgs.where).toEqual({ age: { gte: 30 } });
        expect(captured.aggArgs._avg).toEqual({ age: true });
    });
});

describe('[Integration] group-by route', () => {
    it('groups by a field with a count', async () => {
        const { app, captured } = buildApp();
        const res = await request(app).get('/users/group-by?by=active&count=true');
        expect(res.status).toBe(200);
        expect(captured.groupArgs).toMatchObject({ by: ['active'], _count: true });
        expect(res.body).toEqual({ data: [{ active: true, _count: 2 }] });
    });
});

describe('[Integration] distinct on list', () => {
    it('passes distinct through to findMany', async () => {
        const { app, captured } = buildApp();
        await request(app).get('/users?distinct=firstName');
        expect(captured.listArgs.distinct).toEqual(['firstName']);
    });
});
