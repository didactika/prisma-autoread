/**
 * Utility class for parsing filter values with Prisma type awareness.
 */
export default class FilterValueParser {
    /**
     * Parse object values recursively (handles Prisma operator objects).
     * @param value - Object to parse
     * @returns Parsed object
     */
    static parseObjectValue(value: Record<string, any>): any {
        const prismaOperators = [
            'contains', 'startsWith', 'endsWith', 'equals', 'not', 'in', 'notIn',
            'lt', 'lte', 'gt', 'gte', 'mode', 'search', 'AND', 'OR', 'NOT'
        ];

        const keys = Object.keys(value);
        if (keys.length > 0 && keys.some(k => prismaOperators.includes(k))) {
            return value;
        }

        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
            if (typeof v === 'object' && !Array.isArray(v) && v !== null) {
                result[k] = FilterValueParser.parseObjectValue(v);
            } else {
                result[k] = FilterValueParser.parseStringValue(v);
            }
        }
        return result;
    }

    /**
     * Parse a string value to the appropriate JS type.
     *
     * Order of precedence:
     * 1. Non-string values are returned as-is.
     * 2. `"null"` → `null`
     * 3. `fieldType === 'String'` → returned as-is (no coercion)
     * 4. `"true"` / `"false"` → boolean
     * 5. `fieldType === 'BigInt'` → native `BigInt` (preserves full precision)
     * 6. Integer / float patterns → number, with precision guarded two ways:
     *    - **Typed numeric field** (type known): coerce, but fall back to the raw
     *      string past `Number.MAX_SAFE_INTEGER` so large IDs aren't rounded.
     *      Leading zeros are coerced away — an `Int`/`Float` column can't store them.
     *    - **Unknown type** (schema-less mode): coerce only when it round-trips
     *      losslessly, since the value might belong to a `String` column
     *      (e.g. a zero-padded code).
     * 7. Everything else → original string
     *
     * @param value - Value to parse
     * @param fieldType - Optional Prisma field type (e.g. `"String"`, `"Int"`, `"Boolean"`)
     * @returns Parsed value with the appropriate JS type
     */
    static parseStringValue(value: any, fieldType?: string): any {
        if (typeof value !== 'string') return value;

        const lower = value.toLowerCase();
        if (lower === 'null') return null;

        // String fields must never be coerced to boolean or number
        if (fieldType === 'String') return value;

        if (lower === 'true') return true;
        if (lower === 'false') return false;

        // BigInt columns: keep full precision with a native BigInt.
        if (fieldType === 'BigInt' && /^\d+$/.test(value)) {
            return BigInt(value);
        }

        const typeKnown = fieldType !== undefined;

        if (/^\d+$/.test(value)) {
            const n = Number(value);
            // Typed numeric field: coerce, but never silently round past the safe range.
            // Unknown type: only coerce when it round-trips (could be a String column).
            if (typeKnown) return Number.isSafeInteger(n) ? n : value;
            return String(n) === value ? n : value;
        }

        if (/^\d+\.\d+$/.test(value)) {
            const n = Number(value);
            if (typeKnown) return n;
            return String(n) === value ? n : value;
        }

        return value;
    }
}
