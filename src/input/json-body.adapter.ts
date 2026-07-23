import { QueryBuilder } from '../core/query-builder';
import type { InputAdapter, AdapterContext } from '../types/adapters';
import type { RequestInput, RawSpec, QuerySpec } from '../types/query';

/**
 * Body adapter for the `QUERY` HTTP method (and the `POST` fallback). The body is
 * the query in Prisma-native shape and goes through the same validation and
 * coercion as the query-string dialects:
 *
 * ```jsonc
 * { "where": { "age": { "gte": 30 } }, "orderBy": [{ "createdAt": "desc" }],
 *   "select": { "id": true }, "page": 1, "limit": 20 }
 * ```
 */
export class JsonBodyAdapter implements InputAdapter {
    readonly name = 'json';

    supports(input: RequestInput): boolean {
        return (
            (input.method === 'QUERY' || input.method === 'POST') &&
            input.body != null &&
            typeof input.body === 'object'
        );
    }

    parse(input: RequestInput, ctx: AdapterContext): QuerySpec {
        const body = input.body ?? {};
        const raw: RawSpec = {};

        if (body.where && typeof body.where === 'object') raw.where = body.where;

        if (Array.isArray(body.orderBy)) raw.orderBy = body.orderBy;
        else if (body.orderBy && typeof body.orderBy === 'object') raw.orderBy = [body.orderBy];

        if (body.select && typeof body.select === 'object') raw.select = body.select;
        if (body.include && typeof body.include === 'object') raw.include = body.include;

        if (typeof body.page === 'number') raw.page = body.page;
        if (typeof body.limit === 'number') raw.limit = body.limit;
        if (typeof body.skip === 'number') raw.skip = body.skip;
        if (typeof body.take === 'number') raw.take = body.take;
        if (typeof body.search === 'string') raw.search = body.search;

        if (body.distinct) raw.distinct = body.distinct;
        if (body.cursor !== undefined) raw.cursor = body.cursor;
        if (body.by) raw.by = body.by;
        if (body.having && typeof body.having === 'object') raw.having = body.having;

        // Aggregations: friendly (`sum: ['age']`) or Prisma-native (`_sum: { age: true }`).
        raw.sum = JsonBodyAdapter.aggregationList(body.sum, body._sum);
        raw.avg = JsonBodyAdapter.aggregationList(body.avg, body._avg);
        raw.min = JsonBodyAdapter.aggregationList(body.min, body._min);
        raw.max = JsonBodyAdapter.aggregationList(body.max, body._max);
        if (body.count !== undefined) raw.count = body.count;
        else if (body._count === true) raw.count = true;
        else if (body._count && typeof body._count === 'object') raw.count = Object.keys(body._count);

        return QueryBuilder.build(raw, ctx.model as any, ctx.build);
    }

    private static aggregationList(friendly: any, native: any): string[] | undefined {
        if (friendly) return Array.isArray(friendly) ? friendly : [friendly];
        if (native && typeof native === 'object') return Object.keys(native);
        return undefined;
    }
}
