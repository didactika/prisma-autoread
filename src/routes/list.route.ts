import { Route, RouteExecutionContext, RouteResult } from './route';
import { Serializer } from '../output/serializer';
import { FieldMask } from '../core/mask';
import { NotImplementedError } from '../errors';
import type { QuerySpec } from '../types/query';
import type { RouteName } from '../types/options';

/** `findMany` + `count`, rendered through the negotiated output format. */
export class ListRoute extends Route {
    readonly name: RouteName = 'list';

    async execute(spec: QuerySpec, ctx: RouteExecutionContext): Promise<RouteResult> {
        const adapter = ctx.output.get(ctx.outputFormat);
        if (!adapter) throw new NotImplementedError(`output format '${ctx.outputFormat}'`);

        const result = await ctx.executor.list(spec);
        // Redact last, so a hidden column cannot slip through `include`, a wildcard
        // or an embedded document, whichever way the row was fetched.
        const data = result.data.map(item => FieldMask.apply(Serializer.sanitize(item), ctx.hidden));

        const body = adapter.format(
            { data, total: result.total },
            {
                page: ctx.page,
                limit: ctx.limit,
                total: result.total,
                baseUrl: ctx.baseUrl,
                query: ctx.query,
                resource: ctx.resource,
                keywords: ctx.keywords,
                cursorMode: spec.cursor !== undefined,
                nextCursor: ListRoute.nextCursor(spec, data, ctx),
            },
        );

        return { body, contentType: adapter.contentType };
    }

    /** In cursor mode, expose the last row's id while a full page came back. */
    private static nextCursor(
        spec: QuerySpec,
        data: any[],
        ctx: RouteExecutionContext,
    ): string | number | undefined {
        if (spec.cursor === undefined || !ctx.idField || data.length === 0) return undefined;
        const take = spec.take ?? data.length;
        return data.length >= take ? (data[data.length - 1] as any)?.[ctx.idField] : undefined;
    }
}
