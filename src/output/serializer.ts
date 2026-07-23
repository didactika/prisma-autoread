/**
 * Makes a Prisma result safe to `JSON.stringify`.
 *
 * - `BigInt` → number when it fits, else string (preserves precision).
 * - Prisma `Decimal` (Decimal.js) → number.
 * - `Date` / `RegExp` / `Error` kept as-is (a Date serialises to ISO).
 * - Circular references are dropped.
 */
export class Serializer {
    static sanitize(value: any, visited: Set<any> = new Set()): any {
        if (value === null || value === undefined) return value;

        if (typeof value === 'bigint') {
            return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
                ? Number(value)
                : value.toString();
        }

        if (typeof value !== 'object') return value;

        if (value instanceof Date || value instanceof RegExp || value instanceof Error) {
            return value;
        }

        // Prisma Decimal instances expose `toNumber` and a `d` digits array.
        if (typeof value.toNumber === 'function' && typeof value.d !== 'undefined') {
            return value.toNumber();
        }

        if (visited.has(value)) return null;
        const next = new Set(visited);
        next.add(value);

        if (Array.isArray(value)) return value.map(item => Serializer.sanitize(item, next));

        const out: Record<string, any> = {};
        for (const [key, item] of Object.entries(value)) out[key] = Serializer.sanitize(item, next);
        return out;
    }
}
