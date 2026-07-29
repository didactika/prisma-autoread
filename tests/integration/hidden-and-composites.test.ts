import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import express, { Router } from 'express';
import request from 'supertest';
import { createAutoRead } from '../../src/auto-read';
import { AutoReadOptions } from '../../src/types/options';

function buildApp(config: Partial<AutoReadOptions>, rows: any[]) {
    const captured: { args?: any } = {};
    const delegate = {
        findMany: async (args: any) => { captured.args = args; return rows; },
        count: async () => rows.length,
    };

    const app = express();
    const router = Router();
    createAutoRead({ model: 'User', delegate, output: 'plain', ...config }).applyTo(router);
    app.use('/rows', router);
    app.use((err: any, _req: any, res: any, _next: any) =>
        res.status(err.status ?? 500).json({ error: err.message }),
    );

    return { app, captured };
}

describe('[Integration] security.hidden – never returned', () => {
    const rows = [
        { id: 1, firstName: 'Alice', email: 'alice@example.com', password: 'hash-1' },
        { id: 2, firstName: 'Bob', email: 'bob@example.com', password: 'hash-2' },
    ];

    it('strips hidden columns from the response even without a select', async () => {
        const { app } = buildApp(
            { legacy: false, security: { hidden: ['password'] } },
            rows,
        );
        const res = await request(app).get('/rows');
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([
            { id: 1, firstName: 'Alice', email: 'alice@example.com' },
            { id: 2, firstName: 'Bob', email: 'bob@example.com' },
        ]);
    });

    it('strips hidden columns from included relation rows', async () => {
        const { app } = buildApp(
            { legacy: false, security: { hidden: ['enrolments.campusId'] } },
            [{ id: 1, enrolments: [{ id: 9, userId: 1, campusId: 3 }] }],
        );
        const res = await request(app).get('/rows?include=enrolments');
        expect(res.body.data[0].enrolments).toEqual([{ id: 9, userId: 1 }]);
    });

    it('rejects a hidden column in a modern filter', async () => {
        const { app } = buildApp({ legacy: false, security: { hidden: ['password'] } }, rows);
        const res = await request(app).get('/rows?filter%5Bpassword%5D=hash-1');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Unknown field 'password'/);
        expect(res.body.error).not.toMatch(/password.*password/);
    });

    it('rejects a hidden column in a legacy filter too', async () => {
        const { app } = buildApp({ legacy: true, security: { hidden: ['email'] } }, rows);
        const res = await request(app).get('/rows?email=alice@example.com');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Unknown field 'email'/);
    });

    it('still redacts the response on the legacy path', async () => {
        const { app } = buildApp({ legacy: true, security: { hidden: ['password'] } }, rows);
        const res = await request(app).get('/rows?firstName=Alice');
        expect(res.status).toBe(200);
        expect(res.body.data[0].password).toBeUndefined();
    });

    it('enforces the fields allow-list on the legacy path', async () => {
        const { app } = buildApp(
            { legacy: true, security: { fields: ['id', 'firstName'] } },
            rows,
        );
        const res = await request(app).get('/rows?age=30');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Cannot filter by field 'age'/);
    });
});

describe('[Integration] MongoDB composite types', () => {
    const rows = [{ id: 'a', uuid: 'U1', program: { shortname: 'MAT', subjects: [] } }];

    it('filters inside an embedded document (modern brackets)', async () => {
        const { app, captured } = buildApp(
            { model: 'CourseSchedule', legacy: false, defaults: { sort: 'uuid' } },
            rows,
        );
        const res = await request(app).get('/rows?filter%5Bprogram%5D%5Bshortname%5D=MAT');
        expect(res.status).toBe(200);
        expect(captured.args.where).toEqual({ program: { is: { shortname: 'MAT' } } });
    });

    it('filters inside an embedded list (modern brackets)', async () => {
        const { app, captured } = buildApp(
            { model: 'CourseSchedule', legacy: false, defaults: { sort: 'uuid' } },
            rows,
        );
        await request(app).get('/rows?filter%5Bprogram%5D%5Bsubjects%5D%5Btype%5D=lab');
        expect(captured.args.where).toEqual({
            program: { is: { subjects: { some: { type: 'lab' } } } },
        });
    });

    it('filters inside an embedded document (legacy syntax)', async () => {
        const { app, captured } = buildApp(
            { model: 'CourseSchedule', legacy: true, defaults: { sort: 'uuid' } },
            rows,
        );
        const res = await request(app).get('/rows?program%5Bshortname%5D=MAT');
        expect(res.status).toBe(200);
        expect(captured.args.where).toEqual({ program: { is: { shortname: 'MAT' } } });
    });

    it('supports legacy string operators inside embedded documents', async () => {
        const { app, captured } = buildApp(
            { model: 'CourseSchedule', legacy: true, defaults: { sort: 'uuid' } },
            rows,
        );
        await request(app).get('/rows?program%5Bshortname%5D%5BSTARTS_WITH%5D=MA');
        expect(captured.args.where).toEqual({
            program: { is: { shortname: { startsWith: 'MA' } } },
        });
    });

    it('never puts a composite field into include', async () => {
        const { app, captured } = buildApp(
            { model: 'CourseSchedule', legacy: true, defaults: { sort: 'uuid' } },
            rows,
        );
        await request(app).get('/rows?include=*');
        expect(captured.args.include).toBeUndefined();
    });
});
