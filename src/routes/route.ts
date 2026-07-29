import type { Executor } from '../core/executor';
import type { OutputRegistry } from '../output/output-registry';
import type { QuerySpec, MaskNode } from '../types/query';
import type { KeywordMap } from '../types/keywords';
import type { RouteName } from '../types/options';

/** Everything a route needs to execute and render one request. */
export interface RouteExecutionContext {
    executor: Executor;
    output: OutputRegistry;
    outputFormat: string;
    keywords: KeywordMap;
    /** Model name, exposed to formats such as JSON:API. */
    resource: string;
    /** Id field used to derive the next cursor in cursor mode. */
    idField?: string;
    page: number;
    limit: number;
    baseUrl: string;
    query: Record<string, any>;
    /** Compiled `security.hidden`; stripped from every row before rendering. */
    hidden?: MaskNode;
}

/** What a route hands back to the HTTP layer. */
export interface RouteResult {
    body: unknown;
    /** Set for non-JSON formats (e.g. `text/csv`). */
    contentType?: string;
}

/** A generated endpoint operation (list, count, aggregate, group-by). */
export abstract class Route {
    abstract readonly name: RouteName;
    abstract execute(spec: QuerySpec, ctx: RouteExecutionContext): Promise<RouteResult>;
}
