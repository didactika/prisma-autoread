import halson from 'halson';
import { LinkBuilder } from './link-builder';
import type { OutputAdapter, OutputContext } from '../types/adapters';
import type { QueryResult } from '../types/query';

/**
 * Default output: a [HAL](https://stateless.group/hal_specification.html) payload
 * with `data`, a `pagination` summary and `self`/`first`/`last`/`prev`/`next` links.
 */
export class HalOutput implements OutputAdapter {
    readonly name = 'hal';

    format(result: QueryResult, ctx: OutputContext): unknown {
        const { page, limit, total } = ctx;
        const totalPages = Math.ceil(total / limit) || 0;
        const links = new LinkBuilder(ctx.baseUrl, ctx.query, ctx.keywords);
        const cursorMode = ctx.nextCursor !== undefined;

        const payload = halson({
            data: result.data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: cursorMode ? true : page < totalPages,
                hasPrev: page > 1,
                ...(cursorMode ? { nextCursor: ctx.nextCursor } : {}),
            },
        });

        if (cursorMode) {
            payload.addLink('self', links.limitOnly(limit));
            payload.addLink('next', links.cursor(ctx.nextCursor!, limit));
            return payload;
        }

        payload.addLink('self', links.page(page, limit));
        payload.addLink('first', links.page(1, limit));
        payload.addLink('last', links.page(totalPages, limit));
        if (page > 1) payload.addLink('prev', links.page(page - 1, limit));
        if (page < totalPages) payload.addLink('next', links.page(page + 1, limit));

        return payload;
    }
}
