import type { KeywordMap } from '../types/keywords';

/**
 * Builds pagination links, preserving the caller's filters and honouring the
 * configured keyword names for `page` / `limit` / `cursor`.
 */
export class LinkBuilder {
    private readonly prefix: string;

    constructor(
        baseUrl: string,
        query: Record<string, any>,
        private readonly keywords: KeywordMap,
    ) {
        const rest = { ...query };
        delete rest[keywords.page];
        delete rest[keywords.limit];
        delete rest[keywords.cursor];

        const parts = LinkBuilder.serializeQuery(rest);
        this.prefix = parts.length ? `${baseUrl}?${parts.join('&')}&` : `${baseUrl}?`;
    }

    /** Offset link: `…?filters&page=N&limit=M`. */
    page(page: number, limit: number): string {
        return `${this.prefix}${this.keywords.page}=${page}&${this.keywords.limit}=${limit}`;
    }

    /** Cursor link: `…?filters&cursor=C&limit=M`. */
    cursor(cursor: string | number, limit: number): string {
        return `${this.prefix}${this.keywords.cursor}=${cursor}&${this.keywords.limit}=${limit}`;
    }

    /** Link with only the limit (used as `self` in cursor mode). */
    limitOnly(limit: number): string {
        return `${this.prefix}${this.keywords.limit}=${limit}`;
    }

    /** Serialise a (possibly nested) query object back into `key=value` pairs. */
    static serializeQuery(query: Record<string, any>, prefix = ''): string[] {
        const params: string[] = [];

        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null) continue;
            const paramKey = prefix ? `${prefix}[${key}]` : key;

            if (Array.isArray(value)) {
                value.forEach(item =>
                    params.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(item))}`),
                );
            } else if (typeof value === 'object') {
                params.push(...LinkBuilder.serializeQuery(value, paramKey));
            } else {
                params.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(value))}`);
            }
        }

        return params;
    }
}
