import type { OutputAdapter, OutputContext } from '../types/adapters';
import type { QueryResult } from '../types/query';

/** Minimal output: a `data` array plus a `meta` pagination summary, no links. */
export class PlainOutput implements OutputAdapter {
    readonly name = 'plain';

    format(result: QueryResult, ctx: OutputContext): unknown {
        const { page, limit, total } = ctx;
        const totalPages = Math.ceil(total / limit) || 0;
        const cursorMode = ctx.cursorMode ?? ctx.nextCursor !== undefined;

        return {
            data: result.data,
            meta: {
                page,
                limit,
                total,
                totalPages,
                hasNext: cursorMode ? ctx.nextCursor !== undefined : page < totalPages,
                hasPrev: page > 1,
                ...(cursorMode ? { nextCursor: ctx.nextCursor } : {}),
            },
        };
    }
}
