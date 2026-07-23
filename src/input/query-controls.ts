import type { RawSpec, SortDir } from '../types/query';
import type { KeywordMap } from '../types/keywords';

/**
 * Parses the query-string controls shared by every GET dialect (sort, fields,
 * include, pagination, search, distinct, cursor, aggregations, group-by).
 *
 * Only the filter grammar differs between dialects, so each adapter handles that
 * part itself. Every parameter name comes from the resolved {@link KeywordMap},
 * so a model field can never collide with a control parameter.
 */
export class QueryControlsParser {
    constructor(private readonly keywords: KeywordMap) {}

    parse(query: Record<string, any>): RawSpec {
        const k = this.keywords;
        const raw: RawSpec = {};

        if (typeof query[k.sort] === 'string') raw.orderBy = QueryControlsParser.sort(query[k.sort]);
        if (typeof query[k.fields] === 'string') raw.select = QueryControlsParser.fields(query[k.fields]);
        if (query[k.include]) raw.include = QueryControlsParser.include(query[k.include]);
        if (query[k.page] !== undefined) raw.page = QueryControlsParser.int(query[k.page]);
        if (query[k.limit] !== undefined) raw.limit = QueryControlsParser.int(query[k.limit]);
        if (typeof query[k.search] === 'string') raw.search = query[k.search];

        if (query[k.distinct]) raw.distinct = query[k.distinct];
        if (query[k.cursor] !== undefined) raw.cursor = query[k.cursor];
        if (query[k.count] !== undefined) raw.count = query[k.count];
        if (query[k.sum]) raw.sum = query[k.sum];
        if (query[k.avg]) raw.avg = query[k.avg];
        if (query[k.min]) raw.min = query[k.min];
        if (query[k.max]) raw.max = query[k.max];
        if (query[k.by]) raw.by = query[k.by];
        if (query[k.having] && typeof query[k.having] === 'object') raw.having = query[k.having];

        return raw;
    }

    // ── static helpers ────────────────────────────────────────────────────────

    static int(value: any): number | undefined {
        const parsed = parseInt(String(value), 10);
        return Number.isNaN(parsed) ? undefined : parsed;
    }

    /** `-createdAt,lastName` → `[{ createdAt: 'desc' }, { lastName: 'asc' }]`. */
    static sort(sort: string): Array<Record<string, SortDir>> {
        return sort
            .split(',')
            .map(token => token.trim())
            .filter(Boolean)
            .map(token => {
                const desc = token.startsWith('-');
                const field = desc ? token.slice(1) : token;
                return { [field]: (desc ? 'desc' : 'asc') as SortDir };
            });
    }

    static fields(fields: string): Record<string, true> {
        const out: Record<string, true> = {};
        for (const field of fields.split(',').map(f => f.trim()).filter(Boolean)) out[field] = true;
        return out;
    }

    static include(value: any): Record<string, any> {
        if (Array.isArray(value)) {
            return value.reduce<Record<string, any>>(
                (acc, item) => ({ ...acc, ...QueryControlsParser.include(item) }),
                {},
            );
        }
        if (value && typeof value === 'object') return value as Record<string, any>;
        if (typeof value !== 'string') return {};
        return QueryControlsParser.includeString(value);
    }

    /** `a,b[c,d]` → `{ a: true, b: { c: true, d: true } }`. */
    private static includeString(input: string): Record<string, any> {
        const out: Record<string, any> = {};
        for (const token of QueryControlsParser.splitTopLevel(input)) {
            const open = token.indexOf('[');
            if (open === -1) {
                const name = token.trim();
                if (name) out[name] = true;
            } else {
                const name = token.slice(0, open).trim();
                const inner = token.slice(open + 1, token.lastIndexOf(']'));
                if (name) out[name] = QueryControlsParser.includeString(inner);
            }
        }
        return out;
    }

    /** Split on commas that are not inside brackets. */
    static splitTopLevel(input: string): string[] {
        const tokens: string[] = [];
        let buffer = '';
        let depth = 0;

        for (const char of input) {
            if (char === ',' && depth === 0) {
                if (buffer.trim()) tokens.push(buffer.trim());
                buffer = '';
                continue;
            }
            if (char === '[') depth++;
            else if (char === ']') depth = Math.max(0, depth - 1);
            buffer += char;
        }
        if (buffer.trim()) tokens.push(buffer.trim());
        return tokens;
    }
}
