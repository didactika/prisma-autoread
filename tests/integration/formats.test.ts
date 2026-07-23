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
        findMany: async (a: any) => { captured.args = a; return rows; },
        count: async () => rows.length,
    };
    const app = express();
    const router = Router();
    createAutoRead({
        model: 'User',
        delegate,
        methods: ['GET'],
        legacy: false, // enables query + rsql + odata
        searchable: ['firstName', 'email'],
    }).applyTo(router);
    app.use('/users', router);
    app.use((err: any, _req: any, res: any, _next: any) =>
        res.status(err.status ?? 500).json({ error: err.message }),
    );
    return { app, captured };
}

const enc = encodeURIComponent;

describe('[Integration] input protocols on GET', () => {
    it('modern brackets (query dialect)', async () => {
        const { app, captured } = buildApp();
        await request(app).get('/users?filter%5Bage%5D%5Bgte%5D=30');
        expect(captured.args.where).toEqual({ age: { gte: 30 } });
    });

    it('RSQL (string filter)', async () => {
        const { app, captured } = buildApp();
        await request(app).get(`/users?filter=${enc('age=ge=30;firstName==Al*')}`);
        expect(captured.args.where).toEqual({
            AND: [{ age: { gte: 30 } }, { firstName: { startsWith: 'Al' } }],
        });
    });

    it('OData ($filter)', async () => {
        const { app, captured } = buildApp();
        await request(app).get(`/users?$filter=${enc("age gt 30 and startswith(firstName,'Al')")}`);
        expect(captured.args.where).toEqual({
            AND: [{ age: { gt: 30 } }, { firstName: { startsWith: 'Al' } }],
        });
    });
});

describe('[Integration] output formats + negotiation', () => {
    it('renders JSON:API via ?format=jsonapi', async () => {
        const { app } = buildApp();
        const res = await request(app).get('/users?format=jsonapi');
        expect(res.status).toBe(200);
        expect(res.body.data[0]).toEqual({ type: 'User', id: 1, attributes: { firstName: 'Alice', age: 30 } });
        expect(res.body.links.self).toBeDefined();
    });

    it('renders CSV via ?format=csv', async () => {
        const { app } = buildApp();
        const res = await request(app).get('/users?format=csv');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.text.split('\r\n')[0]).toBe('id,firstName,age');
        expect(res.text).toContain('1,Alice,30');
    });

    it('negotiates CSV via the Accept header', async () => {
        const { app } = buildApp();
        const res = await request(app).get('/users').set('Accept', 'text/csv');
        expect(res.headers['content-type']).toContain('text/csv');
    });

    it('defaults to HAL', async () => {
        const { app } = buildApp();
        const res = await request(app).get('/users');
        expect(res.body._links).toBeDefined();
    });
});
