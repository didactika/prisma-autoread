import express, { Router, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import AutoReadMiddleware from '../../src/middlewares/auto-read.middleware';
import FilterMiddleware from '../../src/middlewares/filter.middleware';
import {
    PrismaQueryArgs,
    AutoReadConfig,
} from '../../src/types';

// ── Prisma client shared for all E2E tests ─────────────────────────────────────

let prisma: PrismaClient;

beforeAll(() => {
    prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

// ── findByFilter implementations (direct Prisma, no prisma-entity-framework) ──

async function findUsers(
    { where, include, orderBy, take, skip }: PrismaQueryArgs
): Promise<{ data: any[]; total: number }> {
    const [data, total] = await Promise.all([
        prisma.user.findMany({ where, include, orderBy, take, skip }),
        prisma.user.count({ where }),
    ]);

    return { data, total };
}

async function findEnrolments(
    { where, include, orderBy, take, skip }: PrismaQueryArgs
): Promise<{ data: any[]; total: number }> {
    const resolvedInclude = include ?? { user: true, campus: true };
    const [data, total] = await Promise.all([
        prisma.userEnrolment.findMany({ where, include: resolvedInclude, orderBy, take, skip }),
        prisma.userEnrolment.count({ where }),
    ]);

    return { data, total };
}

// ── App factories ──────────────────────────────────────────────────────────────

function buildUserApp(config: Partial<AutoReadConfig> = {}) {
    const app = express();

    const router = Router();
    router.use(FilterMiddleware.processQueryFilters('user'));
    AutoReadMiddleware.applyToRouter(router, {
        modelName: 'User',
        findByFilter: findUsers,
        searchableFields: ['firstName', 'lastName', 'email'],
        ...config,
    });

    app.use('/users', router);
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        res.status(err.status ?? 500).json({ error: err.message ?? 'Error' });
    });

    return app;
}

function buildEnrolmentApp(config: Partial<AutoReadConfig> = {}) {
    const app = express();

    const router = Router();
    router.use(FilterMiddleware.processQueryFilters('userEnrolment'));
    AutoReadMiddleware.applyToRouter(router, {
        modelName: 'UserEnrolment',
        findByFilter: findEnrolments,
        ...config,
    });

    app.use('/enrolments', router);
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        res.status(err.status ?? 500).json({ error: err.message ?? 'Error' });
    });

    return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('[E2E] User list endpoint', () => {
    it('returns 200 with all users', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('paginates results', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users?page=1&limit=2');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.pagination.limit).toBe(2);
        expect(res.body._links.next).toBeDefined();
    });

    it('filters by integer field (age=30)', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users?age=30');

        expect(res.status).toBe(200);
        expect(res.body.data.every((u: any) => u.age === 30)).toBe(true);
    });

    it('filters by boolean field (active=false)', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users?active=false');

        expect(res.status).toBe(200);
        expect(res.body.data.every((u: any) => u.active === false)).toBe(true);
    });

    it('does NOT coerce String field – firstName="30" returns empty result', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users?firstName=30');
        // "30" must stay as string; no user has firstName "30" → empty result set
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
    });

    it('filters by exact String field (firstName=Alice)', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users?firstName=Alice');

        expect(res.status).toBe(200);
        expect(res.body.data[0].firstName).toBe('Alice');
    });

    it('normalises field name casing (firstname → firstName)', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users?firstname=Alice');

        expect(res.status).toBe(200);
        expect(res.body.data[0].firstName).toBe('Alice');
    });

    it('returns 200 with empty data when no users match', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users?age=9999');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
        expect(res.body.pagination.total).toBe(0);
    });

    it('includes HATEOAS links', async () => {
        const app = buildUserApp();
        const res = await request(app).get('/users');

        expect(res.body._links.self).toBeDefined();
        expect(res.body._links.first).toBeDefined();
        expect(res.body._links.last).toBeDefined();
    });
});

describe('[E2E] UserEnrolment endpoint – nested relation filters', () => {
    it('returns 200 with all enrolments', async () => {
        const app = buildEnrolmentApp();
        const res = await request(app).get('/enrolments');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('filters by campus.uuid using bracket notation (String field preserved)', async () => {
        const app = buildEnrolmentApp();
        const res = await request(app).get('/enrolments?campus%5Buuid%5D=campus-uuid-alpha');

        expect(res.status).toBe(200);
        // Both Alice and Bob are enrolled in Alpha Campus
        expect(res.body.data.length).toBe(2);
        res.body.data.forEach((e: any) => {
            expect(e.campus.uuid).toBe('campus-uuid-alpha');
        });
    });

    it('filters by user.age using bracket notation (Int field coerced)', async () => {
        const app = buildEnrolmentApp();
        const res = await request(app).get('/enrolments?user%5Bage%5D=30');

        expect(res.status).toBe(200);
        expect(res.body.data[0].user.age).toBe(30);
    });

    it('returns 200 with empty data for non-existent campus uuid', async () => {
        const app = buildEnrolmentApp();
        const res = await request(app).get('/enrolments?campus%5Buuid%5D=nonexistent-uuid');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
    });
});
