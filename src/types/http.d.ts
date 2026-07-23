/** Framework-agnostic request/response contracts used by the endpoint controller. */

export interface HttpRequestContext {
    /** Upper-case HTTP method. */
    method: string;
    /** Parsed query string (deep-object form). */
    query: Record<string, any>;
    /** Parsed JSON body, when the transport carries one. */
    body?: any;
    /** Path of the matched route, relative to the mount point. */
    path: string;
    /** Absolute URL up to (and including) the mount point, used to build links. */
    baseUrl: string;
    /** Lower-cased request headers. */
    headers: Record<string, string | undefined>;
}

export interface HttpResponsePayload {
    status: number;
    body: unknown;
    /** Set for non-JSON formats (e.g. `text/csv`). */
    contentType?: string;
}

// ── Structural framework contracts (no framework is imported at runtime) ───────

/** Minimal Express router surface used by the binding. */
export interface ExpressRouterLike {
    use(...handlers: any[]): unknown;
    all(path: string, handler: any): unknown;
}

/** Minimal Fastify surface used by the binding. */
export interface FastifyLike {
    route(options: { method: string | string[]; url: string; handler: any }): unknown;
}

/** Minimal Hono surface used by the binding. */
export interface HonoLike {
    on(method: string | string[], path: string, handler: any): unknown;
}
