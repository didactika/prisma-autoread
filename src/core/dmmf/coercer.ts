/**
 * Coerces filter values to the JS type implied by the Prisma column type.
 *
 * Query-string values arrive as strings; JSON-body values may already be typed.
 * Coercion is idempotent: an already-typed value is returned unchanged.
 */
export class ValueCoercer {
    /** Coerce a single scalar value. */
    static scalar(value: any, type?: string): any {
        if (value === null || value === undefined) return value;
        if (typeof value !== 'string') return value;

        const trimmed = value.trim();
        if (trimmed.toLowerCase() === 'null') return null;

        switch (type) {
            case 'String':
                return value;

            case 'Boolean': {
                const lower = trimmed.toLowerCase();
                return lower === 'true' ? true : lower === 'false' ? false : value;
            }

            case 'Int':
                if (/^-?\d+$/.test(trimmed)) {
                    const n = Number(trimmed);
                    // Keep the raw string past the safe range so large ids aren't rounded.
                    return Number.isSafeInteger(n) ? n : value;
                }
                return value;

            case 'BigInt':
                return /^-?\d+$/.test(trimmed) ? BigInt(trimmed) : value;

            case 'Float':
            case 'Decimal':
                if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
                    const n = Number(trimmed);
                    return Number.isNaN(n) ? value : n;
                }
                return value;

            case 'DateTime': {
                const date = new Date(value);
                return Number.isNaN(date.getTime()) ? value : date;
            }

            case 'Json':
                return ValueCoercer.jsonLeaf(value);

            default:
                // Enums and unknown types keep their string form.
                return value;
        }
    }

    /** Coerce a list value (for `in` / `notIn`); accepts an array or a comma string. */
    static list(value: any, type?: string): any[] {
        const items = Array.isArray(value) ? value : String(value).split(',');
        return items.map(item =>
            ValueCoercer.scalar(typeof item === 'string' ? item.trim() : item, type),
        );
    }

    /**
     * Best-effort coercion for a value inside a JSON document, where the schema
     * gives no type hint: numbers and booleans are recognised, the rest stays text.
     */
    static jsonLeaf(value: any): any {
        if (typeof value !== 'string') return value;
        const lower = value.toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
        if (/^-?\d+$/.test(value) && String(Number(value)) === value) return Number(value);
        if (/^-?\d+\.\d+$/.test(value)) return Number(value);
        return value;
    }
}
