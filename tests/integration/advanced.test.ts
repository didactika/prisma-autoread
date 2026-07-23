import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import express, { Router } from 'express';
import request from 'supertest';
import { createAutoRead } from '../../src/auto-read';
import { AutoReadOptions, QueryTelemetry } from '../../src/types/options';

const rows = [
    { id: 1, firstName: 'Alice', age: 30 },
    { id: 2, firstName: 'Bob', age: 25 },
];

function buildApp(config: Partial<AutoReadOptions> = {}) {
    const captured: any = { calls: 0 };
    const delegate = {
        findMany: async (a: any) => { captured.args = a; captured.calls++; return rows; },
        count: async () => rows.length,
    };
    const app = express();
    const router = Router();
    createAutoRead({
        model: 'User',
        delegate,
        methods: ['GET'],
        legacy: false,
        ...config,
    }).applyTo(router);
    app.use('/users', router);
    app.use((err: any, _req: any, res: any, _next: any) =>
        res.status(err.status ?? 500).json({ error: err.message }),
    );
    return { app, captured };
}

describe('[Integration] cursor pagination', () => {
    it('passes a cursor + skip:1 and exposes nextCursor', async () => {
        const { app, captured } = buildApp();
        const res = await request(app).get('/users?cursor=1&limit=1');
        expect(res.status).toBe(200);
        expect(captured.args.cursor).toEqual({ id: 1 });
        expect(captured.args.skip).toBe(1);
        expect(captured.args.take).toBe(1);
        expect(res.body.pagination.nextCursor).toBeDefined();
        const nextHref = typeof res.body._links.next === 'string'
            ? res.body._links.next
            : res.body._links.next.href;
        expect(nextHref).toContain('cursor=');
    });
});

describe('[Integration] query-plan cache + telemetry', () => {
    it('reports a cache hit on the second identical request', async () => {
        const events: QueryTelemetry[] = [];
        const { app } = buildApp({ cache: true, onQuery: e => events.push(e) });

        await request(app).get('/users?filter%5Bage%5D%5Bgte%5D=30');
        await request(app).get('/users?filter%5Bage%5D%5Bgte%5D=30');

        expect(events).toHaveLength(2);
        expect(events[0].cacheHit).toBe(false);
        expect(events[1].cacheHit).toBe(true);
        expect(events[0].route).toBe('list');
        expect(typeof events[0].parseMs).toBe('number');
        expect(typeof events[0].execMs).toBe('number');
    });

    it('does not report cache hits when caching is disabled', async () => {
        const events: QueryTelemetry[] = [];
        const { app } = buildApp({ onQuery: e => events.push(e) });

        await request(app).get('/users');
        await request(app).get('/users');

        expect(events.every(e => e.cacheHit === false)).toBe(true);
    });
});
