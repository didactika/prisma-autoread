import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import express, { Router } from 'express';
import request from 'supertest';
import AutoReadMiddleware from '../../src/middlewares/auto-read.middleware';
import FilterMiddleware from '../../src/middlewares/filter.middleware';
import { AutoReadConfig, PrismaQueryArgs } from '../../src/types';

// ── Fake data store ────────────────────────────────────────────────────────────

const users = [
    { id: 1, firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', age: 30, active: true },
    { id: 2, firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', age: 25, active: false },
    { id: 3, firstName: 'Charlie', lastName: 'Brown', email: 'charlie@example.com', age: 35, active: true },
];

function fakeFindByFilter({ where }: PrismaQueryArgs): Promise<{ data: any[]; total: number }> {
    let results = [...users];

    for (const [key, value] of Object.entries(where)) {
        results = results.filter(u => (u as any)[key] === value);
    }

    return Promise.resolve({ data: results, total: results.length });
}

// ── App factory ────────────────────────────────────────────────────────────────

function buildApp(config: Partial<AutoReadConfig> = {}) {
    const app = express();

    const router = Router();
    router.use(FilterMiddleware.processQueryFilters('user'));

    AutoReadMiddleware.applyToRouter(router, {
        modelName: 'User',
        findByFilter: fakeFindByFilter,
        ...config,
    });

    app.use('/users', router);

    app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal Server Error' });
    });

    return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AutoReadMiddleware – list endpoint', () => {
    it('returns all records with 200 when no filter is applied', async () => {
        const app = buildApp();
        const res = await request(app).get('/users');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(3);
    });

    it('returns 200 with an empty data array when no records match the filter', async () => {
        const app = buildApp();
        const res = await request(app).get('/users?age=999');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
        expect(res.body.pagination.total).toBe(0);
    });

    it('includes pagination metadata', async () => {
        const app = buildApp();
        const res = await request(app).get('/users?page=1&limit=2');

        expect(res.status).toBe(200);
        expect(res.body.pagination).toMatchObject({
            page: 1,
            limit: 2,
        });
    });

    it('includes HATEOAS self link', async () => {
        const app = buildApp();
        const res = await request(app).get('/users?page=1&limit=10');

        expect(res.status).toBe(200);
        expect(res.body._links?.self).toBeDefined();
    });

    it('filters by integer field (age=30)', async () => {
        const app = buildApp();
        const res = await request(app).get('/users?age=30');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].firstName).toBe('Alice');
    });

    it('filters by boolean field (active=true)', async () => {
        const app = buildApp();
        const res = await request(app).get('/users?active=true');

        expect(res.status).toBe(200);
        expect(res.body.data.every((u: any) => u.active === true)).toBe(true);
    });

    it('does NOT coerce String field "firstName=30" to number', async () => {
        // "30" stays as string, so no user with firstName="30" → empty result set
        const app = buildApp();
        const res = await request(app).get('/users?firstName=30');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
    });

    it('filters by string field (firstName=Alice)', async () => {
        const app = buildApp();
        const res = await request(app).get('/users?firstName=Alice');

        expect(res.status).toBe(200);
        expect(res.body.data[0].firstName).toBe('Alice');
    });

    it('respects defaultLimit config', async () => {
        const app = buildApp({ defaultLimit: 2 });
        const res = await request(app).get('/users');

        expect(res.status).toBe(200);
        expect(res.body.pagination.limit).toBe(2);
    });

    it('respects basePathPrefix in HATEOAS links', async () => {
        const app = buildApp({ basePathPrefix: '/api/v1' });
        const res = await request(app).get('/users');

        expect(res.status).toBe(200);
        const selfLink = res.body._links?.self;
        const selfHref: string = typeof selfLink === 'object' ? selfLink.href : selfLink;
        expect(selfHref).toContain('/api/v1');
    });
});

describe('AutoReadMiddleware – findByFilter callback variants', () => {
    it('handles callback returning a plain array', async () => {
        const app = buildApp({
            findByFilter: async ({ where }) => {
                const data = users.filter(u =>
                    Object.entries(where).every(([k, v]) => (u as any)[k] === v)
                );
                return data; // plain array
            },
        });
        const res = await request(app).get('/users');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});
