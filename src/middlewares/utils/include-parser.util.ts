/**
 * Utility class for parsing `?include=` query parameter values.
 *
 * Supported formats:
 * - `*` — include all relations
 * - `"relation"` — include a single relation
 * - `"rel1,rel2"` — include multiple relations
 * - `"relation[nestedRel]"` — include a relation with a nested relation
 * - `"relation[*]"` — include a relation with all its nested relations
 */
export default class IncludeParser {
    /**
     * Parse an include value of any accepted type.
     * @param include - Raw query-param value (string, array, or object)
     * @returns Parsed include structure (array of relation objects, a single object, or `'*'`)
     */
    static parse(include: string | string[] | any): any {
        if (include === '*') return '*';

        if (Array.isArray(include)) {
            const parsed: any[] = [];
            for (const el of include) {
                const p = IncludeParser.parseString(el);
                if (p === '*') return '*';
                if (p) parsed.push(p);
            }
            return parsed;
        }

        if (typeof include === 'object') {
            const result: Record<string, any> = {};
            for (const [k, v] of Object.entries(include)) {
                const nested = IncludeParser.parse(v);
                if (nested === '*' || nested) {
                    result[k] = nested;
                }
            }
            return result;
        }

        if (typeof include === 'string') {
            const trimmed = include.trim();
            if (!trimmed) return null;
            return IncludeParser.parseString(trimmed);
        }

        return null;
    }

    /**
     * Parse a single include string token (may be comma-separated or bracket-notation).
     */
    private static parseString(include: string): any {
        const trimmed = include.trim();
        if (trimmed === '*') return '*';

        // Tokenise respecting bracket depth so "a[b,c],d" → ["a[b,c]", "d"]
        const tokens: string[] = [];
        let buf = '';
        let depth = 0;
        for (const ch of trimmed) {
            if (ch === ',' && depth === 0) {
                if (buf.trim()) tokens.push(buf.trim());
                buf = '';
                continue;
            }
            buf += ch;
            if (ch === '[') depth++;
            else if (ch === ']') depth = Math.max(0, depth - 1);
        }
        if (buf.trim()) tokens.push(buf.trim());

        if (tokens.length === 0) return null;
        if (tokens.length > 1) {
            return tokens.map(t => IncludeParser.parseSingleRelation(t)).filter(Boolean);
        }

        return IncludeParser.parseSingleRelation(trimmed);
    }

    /**
     * Parse a single `"relation"` or `"relation[nested]"` token.
     */
    private static parseSingleRelation(rel: string): any {
        const openIdx = rel.indexOf('[');
        if (openIdx === -1) {
            return { [rel.trim()]: true };
        }

        const relationName = rel.slice(0, openIdx).trim();
        const closeIdx = rel.lastIndexOf(']');
        const innerContent = rel.slice(openIdx + 1, closeIdx).trim();

        if (innerContent === '*') {
            return { [relationName]: '*' };
        }

        const nested = IncludeParser.parse(innerContent);
        return { [relationName]: nested };
    }
}
