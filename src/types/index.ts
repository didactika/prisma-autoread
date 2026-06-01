import { Request } from 'express';

// ─── Filter / Search types ──────────────────────────────────────────────────

export type LikeFilterMode = 'EXACT' | 'LIKE' | 'STARTS_WITH' | 'ENDS_WITH';

export interface LikeFilter {
    key: string;
    value: string;
    mode: LikeFilterMode;
    grouping?: 'and' | 'or';
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
}
