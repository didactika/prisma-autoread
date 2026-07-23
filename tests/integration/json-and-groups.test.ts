import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import express, { Router } from 'express';
import request from 'supertest';
import AutoReadMiddleware from '../../src/legacy/auto-read.middleware';
import FilterMiddleware from '../../src/legacy/filter.middleware';
import { AutoReadConfig, PrismaQueryArgs } from '../../src/types';

/**
 * Build an app whose `findByFilter` records the Prisma `where` it receives, so the
 * tests can assert exactly what the middleware produced.
 */
function buildApp(
    modelName: string,
    entity: string,
    config: Partial<AutoReadConfig> = {}
) {
    const captured: { where?: any } = {};
    const app = express();
    // The legacy middleware reads `req.query`, so it needs the extended parser.
    // Express 4 defaults to it; Express 5 does not. (The v1 engine parses the query
    // string itself and works on both without configuration.)
    app.set('query parser', 'extended');
    const router = Router();

    router.use(FilterMiddleware.processQueryFilters(entity));
    AutoReadMiddleware.applyToRouter(router, {
        modelName,
        findByFilter: async ({ where }: PrismaQueryArgs) => {
            captured.where = where;
            return { data: [], total: 0 };
        },
        searchableFields: ['firstName', 'lastName', 'email'],
        ...config,
    });

    app.use('/list', router);
    app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.status ?? 500).json({ error: err.message });
    });

    return { app, captured };
}

// Brackets are percent-encoded so the qs parser turns them into nested objects
// regardless of the HTTP client's URL handling.
const B = '%5B';
const E = '%5D';

describe('[Integration] Json filters', () => {
    it('builds a Prisma JSON path filter (array syntax by default)', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?metadata${B}theme${E}=dark`);

        expect(captured.where.AND).toEqual([
            { metadata: { path: ['theme'], equals: 'dark' } },
        ]);
    });

    it('coerces the compared value inside the JSON filter', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?metadata${B}count${E}=5`);

        expect(captured.where.AND).toEqual([
            { metadata: { path: ['count'], equals: 5 } },
        ]);
    });

    it('supports a deep path', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?metadata${B}address${E}${B}city${E}=Vigo`);

        expect(captured.where.AND).toEqual([
            { metadata: { path: ['address', 'city'], equals: 'Vigo' } },
        ]);
    });

    it('maps LIKE to string_contains', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?metadata${B}bio${E}${B}LIKE${E}=dev`);

        expect(captured.where.AND).toEqual([
            { metadata: { path: ['bio'], string_contains: 'dev' } },
        ]);
    });

    it('honours jsonPathSyntax: "string" (MySQL-style path)', async () => {
        const { app, captured } = buildApp('User', 'user', { jsonPathSyntax: 'string' });
        await request(app).get(`/list?metadata${B}address${E}${B}city${E}=Vigo`);

        expect(captured.where.AND).toEqual([
            { metadata: { path: '$.address.city', equals: 'Vigo' } },
        ]);
    });

    it('filters a Json column on a related model', async () => {
        const { app, captured } = buildApp('UserEnrolment', 'userEnrolment');
        await request(app).get(`/list?campus${B}settings${E}${B}active${E}=true`);

        expect(captured.where.AND).toEqual([
            { campus: { settings: { path: ['active'], equals: true } } },
        ]);
    });

    it('does NOT treat a Json field as a relation (no BadRequest)', async () => {
        const { app } = buildApp('User', 'user');
        const res = await request(app).get(`/list?metadata${B}theme${E}=dark`);
        expect(res.status).toBe(200);
    });
});

describe('[Integration] OR / AND groups', () => {
    it('combines the fields of a single OR group', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?or${B}g1${E}${B}firstName${E}=Alice&or${B}g1${E}${B}lastName${E}=Jones`);

        expect(captured.where.AND).toEqual([
            { OR: [{ firstName: 'Alice' }, { lastName: 'Jones' }] },
        ]);
    });

    it('ANDs a base equality filter with an OR group', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?active=true&or${B}g1${E}${B}firstName${E}=Alice&or${B}g1${E}${B}lastName${E}=Jones`);

        expect(captured.where.active).toBe(true);
        expect(captured.where.AND).toEqual([
            { OR: [{ firstName: 'Alice' }, { lastName: 'Jones' }] },
        ]);
    });

    it('keeps independent OR groups separate (AND of two ORs)', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?or${B}g1${E}${B}firstName${E}=Alice&or${B}g2${E}${B}age${E}=30`);

        expect(captured.where.AND).toEqual([
            { OR: [{ firstName: 'Alice' }] },
            { OR: [{ age: 30 }] },
        ]);
    });

    it('flattens an AND group into the AND list', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?and${B}g1${E}${B}firstName${E}=Alice&and${B}g1${E}${B}active${E}=true`);

        expect(captured.where.AND).toEqual([
            { firstName: 'Alice' },
            { active: true },
        ]);
    });

    it('supports string operators inside an OR group', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get(`/list?or${B}g1${E}${B}firstName${E}${B}STARTS_WITH${E}=Al&or${B}g1${E}${B}lastName${E}=Jones`);

        expect(captured.where.AND).toHaveLength(1);
        expect(captured.where.AND[0].OR).toHaveLength(2);
        expect(captured.where.AND[0].OR).toEqual(
            expect.arrayContaining([
                { firstName: { startsWith: 'Al' } },
                { lastName: 'Jones' },
            ])
        );
    });

    it('supports a relation condition inside an OR group', async () => {
        const { app, captured } = buildApp('UserEnrolment', 'userEnrolment');
        await request(app).get(`/list?or${B}g1${E}${B}campus${E}${B}uuid${E}=A&or${B}g1${E}${B}userId${E}=1`);

        expect(captured.where.AND).toHaveLength(1);
        expect(captured.where.AND[0].OR).toEqual(
            expect.arrayContaining([
                { campus: { uuid: 'A' } },
                { userId: 1 },
            ])
        );
    });

    it('defaults to AND when no groups are used', async () => {
        const { app, captured } = buildApp('User', 'user');
        await request(app).get('/list?active=true&age=30');

        expect(captured.where).toEqual({ active: true, age: 30 });
        expect(captured.where.AND).toBeUndefined();
    });
});
