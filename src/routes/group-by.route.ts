import { Route, RouteExecutionContext, RouteResult } from './route';
import { Serializer } from '../output/serializer';
import type { QuerySpec } from '../types/query';
import type { RouteName } from '../types/options';

/** `groupBy` with aggregations and an optional `having`. */
export class GroupByRoute extends Route {
    readonly name: RouteName = 'groupBy';

    async execute(spec: QuerySpec, ctx: RouteExecutionContext): Promise<RouteResult> {
        return { body: { data: Serializer.sanitize(await ctx.executor.groupBy(spec)) } };
    }
}
