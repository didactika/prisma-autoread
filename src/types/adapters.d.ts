import type { RequestInput, QuerySpec, BuildContext, QueryResult } from './query';
import type { ModelMetadata } from './dmmf';
import type { KeywordMap } from './keywords';

// ── Input ────────────────────────────────────────────────────────────────────

/** Everything an input adapter needs to turn a request into a {@link QuerySpec}. */
export interface AdapterContext {
    model: ModelMetadata;
    build: BuildContext;
    /** Resolved names of the reserved query parameters. */
    keywords: KeywordMap;
}

/**
 * Translates a request of a specific format/transport into a {@link QuerySpec}.
 * Adding a protocol means implementing this interface and registering it — the
 * core never changes (open/closed).
 */
export interface InputAdapter {
    readonly name: string;
    /** Whether this adapter can handle the incoming request. */
    supports(input: RequestInput, keywords: KeywordMap): boolean;
    /** Parse the request into a Prisma-ready spec (may be async). */
    parse(input: RequestInput, ctx: AdapterContext): QuerySpec | Promise<QuerySpec>;
}

// ── Output ───────────────────────────────────────────────────────────────────

/** Pagination + URL context needed to render a list response. */
export interface OutputContext {
    page: number;
    limit: number;
    total: number;
    /** Absolute URL up to the path, without query string. */
    baseUrl: string;
    /** Original query params, used to preserve filters in generated links. */
    query: Record<string, any>;
    /** Resource name (the model), used by formats such as JSON:API. */
    resource?: string;
    /**
     * Whether the request used cursor pagination. Kept separate from
     * {@link nextCursor}, which is absent on the last page — inferring the mode from
     * it made an exhausted cursor page fall back to offset semantics and claim
     * `hasNext: true`.
     */
    cursorMode?: boolean;
    /** The next page's cursor; absent once the stream is exhausted. */
    nextCursor?: string | number;
    /** Resolved keyword names, so links use the configured parameter names. */
    keywords: KeywordMap;
}

/**
 * Renders an executed {@link QueryResult} into a response payload of a given format.
 */
export interface OutputAdapter {
    readonly name: string;
    /** Non-JSON content type (e.g. `'text/csv'`); when set, `format` returns a string. */
    readonly contentType?: string;
    format(result: QueryResult, ctx: OutputContext): unknown;
}
