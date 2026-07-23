import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import express, { Router } from 'express';
import request from 'supertest';
import { createAutoRead } from '../../src/auto-read';
import { Keywords } from '../../src/config/keywords';
import type { AutoReadOptions } from '../../src/types/options';

const rows = [
    { id: 1, firstName: 'Alice', age: 30 },
    { id: 2, firstName: 'Bob', age: 25 },
];

function makeDelegate() {
    const captured: any = {};
    return {
        captured,
        delegate: {
            findMany: async (args: any) => { captured.args = args; return rows; },
            count: async () => rows.length,
        },
    };
}

const baseOptions = (delegate: any): AutoReadOptions => ({
    model: 'User',
    delegate,
    methods: ['GET'],
    legacy: false,
});

// ── Fastify ────────────────────────────────────────────────────────────────────

describe('[Integration] Fastify binding', () => {
    it('registers routes and serves a list', async () => {
        const { delegate, captured } = makeDelegate();
        const registered: any[] = [];
        const fastify = { route: (opts: any) => { registered.push(opts); return fastify; } };

        createAutoRead({ ...baseOptions(delegate), routes: ['list', 'count'] }).applyToFastify(fastify);

        expect(registered).toHaveLength(2);
        expect(registered.map(r => r.url)).toEqual(['/', '/count']);
        expect(registered[0].method).toEqual(['GET']);

        const reply = {
            statusCode: 0, payload: undefined as any, contentType: undefined as any,
            code(status: number) { this.statusCode = status; return this; },
            send(body: any) { this.payload = body; return this; },
            type(ct: string) { this.contentType = ct; return this; },
        };
        await registered[0].handler(
            {
                method: 'GET',
                url: '/users?filter[age][gte]=30',
                headers: { host: 'localhost' },
                protocol: 'http',
            },
            reply,
        );

        expect(captured.args.where).toEqual({ age: { gte: 30 } });
        expect(reply.statusCode).toBe(200);
        expect(JSON.parse(JSON.stringify(reply.payload)).data).toHaveLength(2);
    });

    it('serves the count route', async () => {
        const { delegate } = makeDelegate();
        const registered: any[] = [];
        const fastify = { route: (opts: any) => { registered.push(opts); return fastify; } };
        createAutoRead({ ...baseOptions(delegate), routes: ['count'] }).applyToFastify(fastify);

        const reply = {
            payload: undefined as any,
            code() { return this; },
            send(body: any) { this.payload = body; return this; },
            type() { return this; },
        };
        await registered[0].handler({ method: 'GET', url: '/users/count', headers: {} }, reply);
        expect(reply.payload).toEqual({ count: 2 });
    });
});

// ── Hono ───────────────────────────────────────────────────────────────────────

function honoContext(url: string, method = 'GET') {
    return {
        req: { url, method, raw: { headers: new Map<string, string>() }, json: async () => ({}) },
        json: (body: any, status: number) => ({ body, status }),
        body: (body: any, status: number, headers: any) => ({ body, status, headers }),
    };
}

describe('[Integration] Hono binding', () => {
    it('registers routes and parses bracket query params', async () => {
        const { delegate, captured } = makeDelegate();
        const registered: any[] = [];
        const app = { on: (m: any, p: any, h: any) => { registered.push({ m, p, h }); return app; } };

        createAutoRead({ ...baseOptions(delegate), routes: ['list'] }).applyToHono(app);
        expect(registered).toHaveLength(1);
        expect(registered[0].p).toBe('/');

        const res: any = await registered[0].h(
            honoContext('http://host/users?filter[age][gte]=30&limit=5'),
        );

        expect(captured.args.where).toEqual({ age: { gte: 30 } });
        expect(captured.args.take).toBe(5);
        expect(res.status).toBe(200);
        expect(JSON.parse(JSON.stringify(res.body)).data).toHaveLength(2);
    });

    it('returns CSV with its content type', async () => {
        const { delegate } = makeDelegate();
        const registered: any[] = [];
        const app = { on: (m: any, p: any, h: any) => { registered.push({ m, p, h }); return app; } };
        createAutoRead({ ...baseOptions(delegate), routes: ['list'] }).applyToHono(app);

        const res: any = await registered[0].h(honoContext('http://host/users?format=csv'));
        expect(res.headers['content-type']).toContain('text/csv');
        expect(String(res.body).split('\r\n')[0]).toBe('id,firstName,age');
    });
});

// ── Configurable keywords, end to end ──────────────────────────────────────────

describe('[Integration] configurable keywords', () => {
    afterEach(() => Keywords.reset());

    function buildApp(config: Partial<AutoReadOptions> = {}) {
        const { delegate, captured } = makeDelegate();
        const app = express();
        const router = Router();
        createAutoRead({ ...baseOptions(delegate), ...config }).applyTo(router);
        app.use('/users', router);
        app.use((err: any, _req: any, res: any, _next: any) =>
            res.status(err.status ?? 500).json({ error: err.message }),
        );
        return { app, captured };
    }

    it('renames a keyword per endpoint (fields → select)', async () => {
        const { app, captured } = buildApp({ keywords: { fields: 'select' } });
        await request(app).get('/users?select=id,firstName');
        expect(captured.args.select).toEqual({ id: true, firstName: true });
    });

    it('frees the original name so a model field can use it', async () => {
        // With `fields` renamed, `filter[fields]` would hit the model — here we prove
        // the control no longer reacts to `?fields=`.
        const { app, captured } = buildApp({ keywords: { fields: 'select' } });
        await request(app).get('/users?fields=id');
        expect(captured.args.select).toBeUndefined();
    });

    it('honours the global configuration', async () => {
        Keywords.configure({ limit: 'size' });
        const { app, captured } = buildApp();
        await request(app).get('/users?size=3');
        expect(captured.args.take).toBe(3);
    });

    it('uses the renamed keyword in generated links', async () => {
        const { app } = buildApp({ keywords: { page: 'p', limit: 'size' } });
        const res = await request(app).get('/users?p=1&size=1');
        expect(res.body._links.self.href).toContain('p=1&size=1');
    });
});

// ── Strict security, end to end ────────────────────────────────────────────────

describe('[Integration] strict security', () => {
    function buildStrictApp() {
        const { delegate } = makeDelegate();
        const app = express();
        const router = Router();
        createAutoRead({
            ...baseOptions(delegate),
            security: { strict: true, fields: ['id', 'firstName'] },
        }).applyTo(router);
        app.use('/users', router);
        app.use((err: any, _req: any, res: any, _next: any) =>
            res.status(err.status ?? 500).json({ error: err.message }),
        );
        return app;
    }

    it('allows a listed field', async () => {
        const res = await request(buildStrictApp()).get('/users?filter%5BfirstName%5D=Alice');
        expect(res.status).toBe(200);
    });

    it('denies an unlisted field', async () => {
        const res = await request(buildStrictApp()).get('/users?filter%5Bage%5D=30');
        expect(res.status).toBe(400);
    });

    it('denies relation traversal by default', async () => {
        const res = await request(buildStrictApp()).get('/users?filter%5Benrolments%5D%5BcampusId%5D=1');
        expect(res.status).toBe(400);
    });
});
