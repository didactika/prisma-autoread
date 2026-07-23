import { JsonFilter, LikeFilterMode } from '../../types';
import FilterValueParser from './filter-value-parser.util';

const MODES: LikeFilterMode[] = ['EXACT', 'LIKE', 'STARTS_WITH', 'ENDS_WITH'];

/**
 * Utility class for turning bracket-notation params that address a `Json` column
 * into {@link JsonFilter} entries.
 *
 * Because everything under a Json column is opaque to the Prisma schema, the keys
 * are treated as a **path inside the document** rather than as related fields:
 *
 * ```
 * ?metadata[theme]=dark          → { field: 'metadata', path: ['theme'], mode: 'EXACT', value: 'dark' }
 * ?metadata[address][city]=Vigo  → { field: 'metadata', path: ['address','city'], mode: 'EXACT', value: 'Vigo' }
 * ?metadata[bio][LIKE]=dev       → { field: 'metadata', path: ['bio'], mode: 'LIKE',  value: 'dev' }
 * ```
 */
export default class JsonFilterProcessor {
    /** Whether a key is one of the recognised string-operator modes. */
    static isMode(key: string): boolean {
        return MODES.includes(key.toUpperCase() as LikeFilterMode);
    }

    /**
     * Walk the (possibly nested) value supplied for a Json column and emit one
     * {@link JsonFilter} per leaf into `out`.
     *
     * @param field - Dot-path to the Json column, relative to the root model (e.g. `'metadata'` or `'profile.settings'`)
     * @param value - Nested value from the query string (object or scalar)
     * @param out   - Array to push {@link JsonFilter} entries into
     */
    static process(field: string, value: any, out: JsonFilter[]): void {
        JsonFilterProcessor.walk(field, [], value, out);
    }

    private static walk(field: string, path: string[], value: any, out: JsonFilter[]): void {
        const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);

        if (isObject) {
            const keys = Object.keys(value);

            for (const key of keys) {
                if (JsonFilterProcessor.isMode(key)) {
                    // Explicit operator at this depth → filter against the current path.
                    out.push({
                        field,
                        path,
                        mode: key.toUpperCase() as LikeFilterMode,
                        value: FilterValueParser.parseStringValue(value[key]),
                    });
                } else {
                    // Regular key → descend one level deeper into the JSON path.
                    JsonFilterProcessor.walk(field, [...path, key], value[key], out);
                }
            }
            return;
        }

        // Leaf scalar → equality match.
        out.push({
            field,
            path,
            mode: 'EXACT',
            value: FilterValueParser.parseStringValue(value),
        });
    }
}
