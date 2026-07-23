import { Route, RouteExecutionContext, RouteResult } from './route';
import type { QuerySpec } from '../types/query';
import type { RouteName } from '../types/options';

/** `count` alone, reusing the same filter as the list route. */
export class CountRoute extends Route {
    readonly name: RouteName = 'count';

    async execute(spec: QuerySpec, ctx: RouteExecutionContext): Promise<RouteResult> {
        return { body: { count: await ctx.executor.count(spec) } };
    }
}
