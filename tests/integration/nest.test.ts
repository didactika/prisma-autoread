import 'reflect-metadata';
import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AutoReadModule } from '../../src/nest';

const rows = [
    { id: 1, firstName: 'Alice', age: 30 },
    { id: 2, firstName: 'Bob', age: 25 },
];

function makeDelegate() {
    const captured: { args?: any } = {};
    return {
        captured,
        delegate: {
            findMany: async (args: any) => {
                captured.args = args;
                return rows;
            },
            count: async () => rows.length,
        },
    };
}

async function buildNestApp() {
    const { delegate, captured } = makeDelegate();
    const generated = AutoReadModule.register({
        path: 'users',
        model: 'User',
        delegate,
        methods: ['GET', 'POST'],
        routes: ['list', 'count'],
        legacy: false,
    });

    class TestAppModule {}
    Module({ imports: [generated] })(TestAppModule);

    const logs: Array<{ message: unknown; context?: string }> = [];
    const noop = () => undefined;
    const app = await NestFactory.create(TestAppModule, {
        logger: {
            log: (message: unknown, context?: string) => logs.push({ message, context }),
            error: noop,
            warn: noop,
            debug: noop,
            verbose: noop,
            fatal: noop,
        },
    });
    await app.init();
    return { app, captured, logs };
}

describe('[Integration] Nest binding', () => {
    it('registers native routes and emits RouterExplorer mapping logs', async () => {
        const { app, captured, logs } = await buildNestApp();

        try {
            const response = await request(app.getHttpServer())
                .get('/users?filter[age][gte]=30')
                .expect(200);

            expect(captured.args?.where).toEqual({ age: { gte: 30 } });
            expect(response.body.data).toHaveLength(2);
            expect(logs).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    context: 'RouterExplorer',
                    message: expect.stringContaining('Mapped {/users, GET} route'),
                }),
            ]));
        } finally {
            await app.close();
        }
    });

    it('is discovered by Nest Swagger with generated operation and query metadata', async () => {
        const { app } = await buildNestApp();

        try {
            const document = SwaggerModule.createDocument(app, {
                openapi: '3.0.0',
                info: { title: 'Test', version: '1.0.0' },
            });
            const operation = document.paths['/users']?.get;

            expect(operation?.operationId).toBe('User_list_get');
            expect(operation?.tags).toEqual(['User']);
            expect(operation?.parameters).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'filter', in: 'query', style: 'deepObject' }),
                expect.objectContaining({ name: 'limit', in: 'query' }),
            ]));
            expect(document.paths['/users']?.post?.requestBody).toBeDefined();
            expect(document.paths['/users/count']?.get).toBeDefined();
        } finally {
            await app.close();
        }
    });

    it('turns engine client errors into Nest HTTP responses', async () => {
        const { app } = await buildNestApp();

        try {
            const response = await request(app.getHttpServer())
                .get('/users?filter[unknown]=value')
                .expect(400);

            expect(response.body.message).toContain('unknown');
        } finally {
            await app.close();
        }
    });
});
