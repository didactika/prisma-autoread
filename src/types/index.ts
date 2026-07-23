import { Request } from 'express';

// ─── Filter / Search types ──────────────────────────────────────────────────

export type LikeFilterMode = 'EXACT' | 'LIKE' | 'STARTS_WITH' | 'ENDS_WITH';

export interface LikeFilter {
    key: string;
    value: string;
    mode: LikeFilterMode;
    grouping?: 'and' | 'or';
}

/**
 * A filter that targets a value **inside** a `Json` column.
 *
 * Produced when a bracket-notation param addresses a Json field, e.g.
 * `?metadata[theme]=dark` → `{ field: 'metadata', path: ['theme'], mode: 'EXACT', value: 'dark' }`.
 *
 * `AutoReadMiddleware` turns each entry into a Prisma JSON filter such as
 * `{ metadata: { path: ['theme'], equals: 'dark' } }` (see `jsonPathSyntax`).
 */
export interface JsonFilter {
    /** Dot-path to the Json column, relative to the root model (e.g. `'metadata'` or `'profile.settings'`). */
    field: string;
    /** Path of keys **within** the JSON document (e.g. `['address', 'city']`). */
    path: string[];
    /** Match mode: `EXACT` → `equals`; `LIKE`/`STARTS_WITH`/`ENDS_WITH` → `string_contains`/`string_starts_with`/`string_ends_with`. */
    mode: LikeFilterMode;
    /** Parsed value to compare against. */
    value: any;
}

/**
 * A named set of conditions combined with the same boolean operator.
 *
 * Produced from `?or[<name>][<field>]=...` / `?and[<name>][<field>]=...` params.
 * Every group is AND-combined with the default filters and with the other groups;
 * the conditions **inside** a group are combined with the group's `type`.
 */
export interface FilterGroup {
    /** How the conditions inside this group combine. */
    type: 'or' | 'and';
    /** Group identifier taken from the query string (e.g. `or[g1]` → `'g1'`). */
    name: string;
    /** Equality conditions, keyed by dot-notation path (same shape as `CustomRequestData.filter`). */
    filters: Record<string, any>;
    /** String-operator conditions inside this group. */
    likeFilters: LikeFilter[];
    /** JSON conditions inside this group. */
    jsonFilters: JsonFilter[];
}

// ─── Pagination types ────────────────────────────────────────────────────────

export interface PaginationData {
    page: number;
    limit: number;
    skip: number;
    sort: string;
    order: 'asc' | 'desc';
    take: number;
    pageSize: number;
}

// ─── Custom request augmentation ─────────────────────────────────────────────

export interface CustomRequestData {
    filter?: Record<string, any>;
    pagination?: PaginationData;
    search?: string;
    include?: Array<any> | '*';
    nestedSearch?: Record<string, string>;
    likeFilters?: LikeFilter[];
    /** Filters targeting values inside `Json` columns (default AND group). */
    jsonFilters?: JsonFilter[];
    /** OR / AND groups parsed from `?or[...]` / `?and[...]` params. */
    groups?: FilterGroup[];
}

export interface RequestFilterable extends Request {
    custom?: CustomRequestData;
}

// ─── PrismaQueryArgs — the argument received by findByFilter ─────────────────

/**
 * Ready-to-use Prisma query arguments built by the library.
 * Pass these directly to `prisma.<model>.findMany()` and `prisma.<model>.count()`.
 */
export interface PrismaQueryArgs {
    /** Prisma-compatible `where` clause with all filters, string operators and search already applied. */
    where: Record<string, any>;
    /** Prisma `include` object built from the `?include=` query param. `undefined` when no includes were requested. */
    include?: Record<string, any>;
    /** Sort order derived from `?sort=` and `?order=` query params. */
    orderBy?: Record<string, 'asc' | 'desc'>;
    /** Number of records to fetch (from `?limit=`). */
    take: number;
    /** Number of records to skip (from `?page=`). */
    skip: number;
}

// ─── AutoRead configuration ───────────────────────────────────────────────────

export interface AutoReadConfig {
    /**
     * Exact Prisma model name (matches casing in schema, e.g. 'User', 'UserEnrolment').
     * Used to look up field types from `Prisma.dmmf` for type-safe filter coercion.
     */
    modelName: string;

    /**
     * Async function that queries the database.
     * Receives a `PrismaQueryArgs` object ready to spread directly into `prisma.<model>.findMany()`.
     * Must return either `{ data: any[], total: number }` or a plain `any[]`.
     *
     * @example
     * findByFilter: async ({ where, include, orderBy, take, skip }) => {
     *   const [data, total] = await Promise.all([
     *     prisma.user.findMany({ where, include, orderBy, take, skip }),
     *     prisma.user.count({ where }),
     *   ]);
     *   return { data, total };
     * }
     */
    findByFilter: (
        query: PrismaQueryArgs
    ) => Promise<{ data: any[]; total: number } | any[]>;

    /** Fields to include in full-text `?search=` queries. */
    searchableFields?: string[];

    /** Default page size when `?limit=` is omitted. Defaults to 10. */
    defaultLimit?: number;

    /** Maximum accepted page size. Defaults to 100. */
    maxLimit?: number;

    /**
     * Optional base path prefix prepended to `req.baseUrl` when building HATEOAS links.
     * Example: `'/api/v1'` → produces `https://host/api/v1/users?page=1&limit=10`.
     */
    basePathPrefix?: string;

    /**
     * Path syntax used when building Prisma `Json` filters from bracket-notation params.
     *
     * - `'array'` → `{ path: ['a', 'b'], equals: … }` — **PostgreSQL** and **SQLite** (default)
     * - `'string'` → `{ path: '$.a.b', equals: … }` — **MySQL** and **MariaDB**
     *
     * Prisma's JSON path format differs per connector; set this to match your datasource.
     */
    jsonPathSyntax?: 'array' | 'string';
}
