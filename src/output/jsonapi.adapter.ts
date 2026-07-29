import { LinkBuilder } from './link-builder';
import type { OutputAdapter, OutputContext } from '../types/adapters';
import type { QueryResult } from '../types/query';

/**
 * [JSON:API](https://jsonapi.org/) output: `data` as resource objects
 * (`{ type, id, attributes }`), plus `meta` and pagination `links`.
 */
export class JsonApiOutput implements OutputAdapter {
    readonly name = 'jsonapi';

    format(result: QueryResult, ctx: OutputContext): unknown {
        const type = ctx.resource ?? 'items';
        const totalPages = Math.ceil(ctx.total / ctx.limit) || 0;
        const builder = new LinkBuilder(ctx.baseUrl, ctx.query, ctx.keywords);

        const data = result.data.map(row => {
            const { id, ...attributes } = row ?? {};
            return { type, id, attributes };
        });

        const cursorMode = ctx.cursorMode ?? ctx.nextCursor !== undefined;

        const links: Record<string, string> = {
            self: builder.page(ctx.page, ctx.limit),
            first: builder.page(1, ctx.limit),
            last: builder.page(totalPages, ctx.limit),
        };
        if (ctx.page > 1) links.prev = builder.page(ctx.page - 1, ctx.limit);
        if (!cursorMode && ctx.page < totalPages) links.next = builder.page(ctx.page + 1, ctx.limit);
        if (ctx.nextCursor !== undefined) links.next = builder.cursor(ctx.nextCursor, ctx.limit);

        return {
            data,
            meta: {
                page: ctx.page,
                limit: ctx.limit,
                total: ctx.total,
                totalPages,
                ...(ctx.nextCursor !== undefined ? { nextCursor: ctx.nextCursor } : {}),
            },
            links,
        };
    }
}
