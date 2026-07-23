import { Route, RouteExecutionContext, RouteResult } from './route';
import { Serializer } from '../output/serializer';
import type { QuerySpec } from '../types/query';
import type { RouteName } from '../types/options';

/** `_count` / `_sum` / `_avg` / `_min` / `_max` over the filtered set. */
export class AggregateRoute extends Route {
    readonly name: RouteName = 'aggregate';

    async execute(spec: QuerySpec, ctx: RouteExecutionContext): Promise<RouteResult> {
        return { body: Serializer.sanitize(await ctx.executor.aggregate(spec)) };
    }
}
