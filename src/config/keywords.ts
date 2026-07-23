import type { KeywordMap, KeywordOverrides } from '../types/keywords';

/**
 * Registry of the reserved query-string parameter names.
 *
 * Every control parameter can be renamed, so a model field called `fields`,
 * `sort`, `page`… never collides with the engine. Configure once at bootstrap:
 *
 * ```ts
 * Keywords.configure({ fields: 'select', filter: 'q' });
 * ```
 *
 * Per-endpoint overrides are also possible through `createAutoRead({ keywords })`.
 */
export class Keywords {
    static readonly DEFAULTS: Readonly<KeywordMap> = Object.freeze({
        filter: 'filter',
        sort: 'sort',
        fields: 'fields',
        include: 'include',
        page: 'page',
        limit: 'limit',
        search: 'search',
        distinct: 'distinct',
        cursor: 'cursor',
        format: 'format',
        count: 'count',
        sum: 'sum',
        avg: 'avg',
        min: 'min',
        max: 'max',
        by: 'by',
        having: 'having',
    });

    private static global: KeywordMap = { ...Keywords.DEFAULTS };

    /** Apply global overrides (merged over the current values). */
    static configure(overrides: KeywordOverrides): KeywordMap {
        Keywords.global = Keywords.merge(Keywords.global, overrides);
        return Keywords.global;
    }

    /** The current global keyword map. */
    static current(): KeywordMap {
        return { ...Keywords.global };
    }

    /** Restore the built-in defaults (useful in tests). */
    static reset(): void {
        Keywords.global = { ...Keywords.DEFAULTS };
    }

    /** Resolve the effective map for an endpoint: defaults ← global ← per-endpoint. */
    static resolve(overrides?: KeywordOverrides): KeywordMap {
        return overrides ? Keywords.merge(Keywords.global, overrides) : Keywords.current();
    }

    private static merge(base: KeywordMap, overrides: KeywordOverrides): KeywordMap {
        const merged: KeywordMap = { ...base };
        for (const key of Object.keys(overrides) as Array<keyof KeywordMap>) {
            const value = overrides[key];
            if (typeof value === 'string' && value.trim()) merged[key] = value.trim();
        }
        return merged;
    }
}
