import express from 'express';
import FilterMiddleware from '../legacy/filter.middleware';
import AutoReadMiddleware from '../legacy/auto-read.middleware';
import type { InputAdapter, AdapterContext } from '../types/adapters';
import type { RequestInput, QuerySpec } from '../types/query';

export interface LegacyAdapterOptions {
    /** Prisma model name, as accepted by the legacy `FilterMiddleware`. */
    modelName: string;
    /** Fields scanned by the legacy `?search=`. */
    searchableFields?: string[];
}

/**
 * Backward-compatibility adapter: understands the **original** GET query syntax
 * (`field[LIKE]=…`, `relation[field]=…`, `or[g][…]`, `field[jsonKey]=…`, `search=…`).
 *
 * Rather than re-implement any of it, it drives the **frozen** legacy middleware
 * pipeline and captures the exact Prisma args it builds, so behaviour can never
 * drift from the original engine.
 */
export class LegacyAdapter implements InputAdapter {
    readonly name = 'legacy';

    constructor(private readonly options: LegacyAdapterOptions) {}

    supports(input: RequestInput): boolean {
        return input.method === 'GET';
    }

    parse(input: RequestInput, _ctx?: AdapterContext): Promise<QuerySpec> {
        return new Promise<QuerySpec>((resolve, reject) => {
            let captured: QuerySpec = {};

            const router = express.Router();
            router.use(FilterMiddleware.processQueryFilters(this.options.modelName));
            AutoReadMiddleware.applyToRouter(router, {
                modelName: this.options.modelName,
                searchableFields: this.options.searchableFields,
                findByFilter: async (args: any) => {
                    captured = {
                        where: args.where,
                        include: args.include,
                        orderBy: args.orderBy ? [args.orderBy] : undefined,
                        take: args.take,
                        skip: args.skip,
                    };
                    return { data: [], total: 0 };
                },
            });

            const request: any = {
                method: 'GET',
                url: '/',
                originalUrl: '/',
                baseUrl: '',
                path: '/',
                query: input.query ?? {},
                headers: { host: 'localhost' },
                protocol: 'http',
            };
            const response: any = {
                statusCode: 200,
                status() { return this; },
                json() { resolve(captured); return this; },
                set() { return this; },
                setHeader() { return this; },
            };

            (router as unknown as express.RequestHandler)(request, response, (err?: any) =>
                err ? reject(err) : resolve(captured),
            );
        });
    }
}
