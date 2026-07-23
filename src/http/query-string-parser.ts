/**
 * Deep-object query-string parser.
 *
 * Frameworks disagree on how (and whether) they expand bracket notation:
 * Express 4 uses `qs` by default, Express 5 defaults to the flat parser, and Fastify
 * and Hono are flat too. Parsing the raw query string ourselves makes every binding
 * behave identically regardless of the host's settings.
 *
 * ```
 * a=1                 → { a: '1' }
 * a[b][c]=1           → { a: { b: { c: '1' } } }
 * a[]=1&a[]=2         → { a: ['1', '2'] }
 * a=1&a=2             → { a: ['1', '2'] }
 * ```
 */
export class QueryStringParser {
    /** Keys that could pollute `Object.prototype` are dropped. */
    private static readonly BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    /** Upper bounds, so a hostile query string cannot exhaust memory. */
    private static readonly MAX_PARAMS = 1000;
    private static readonly MAX_DEPTH = 10;

    /** Parse the query string of a full or relative URL. */
    static fromUrl(url: string | undefined): Record<string, any> {
        if (!url) return {};
        const index = url.indexOf('?');
        return index === -1 ? {} : QueryStringParser.parse(url.slice(index + 1));
    }

    /** Parse a raw query string (without the leading `?`). */
    static parse(search: string): Record<string, any> {
        const out: Record<string, any> = Object.create(null) as Record<string, any>;
        if (!search) return { ...out };

        let count = 0;
        for (const pair of search.split('&')) {
            if (!pair) continue;
            if (++count > QueryStringParser.MAX_PARAMS) break;

            const equals = pair.indexOf('=');
            const key = QueryStringParser.decode(equals === -1 ? pair : pair.slice(0, equals));
            const value = equals === -1 ? '' : QueryStringParser.decode(pair.slice(equals + 1));
            if (!key) continue;

            const path = QueryStringParser.segments(key);
            if (path.length > QueryStringParser.MAX_DEPTH) continue;
            if (path.some(segment => QueryStringParser.BLOCKED_KEYS.has(segment))) continue;

            QueryStringParser.assign(out, path, value);
        }

        // Return a normal object so downstream `Object.entries`/spread behave as expected.
        return { ...out };
    }

    private static decode(value: string): string {
        try {
            return decodeURIComponent(value.replace(/\+/g, ' '));
        } catch {
            return value;
        }
    }

    /** `a[b][c]` → `['a','b','c']`; `a[]` → `['a','']`. */
    private static segments(key: string): string[] {
        const open = key.indexOf('[');
        if (open === -1) return [key];

        const head = key.slice(0, open);
        const brackets = key.slice(open).match(/\[[^[\]]*\]/g) ?? [];
        return [head, ...brackets.map(part => part.slice(1, -1))];
    }

    private static assign(target: Record<string, any>, path: string[], value: string): void {
        let node: any = target;

        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];

            // `a[]=1` → append to an array held at `a`.
            if (path[i + 1] === '') {
                if (!Array.isArray(node[key])) node[key] = [];
                node[key].push(value);
                return;
            }

            if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
            node = node[key];
        }

        const last = path[path.length - 1];
        if (last === '') return;

        if (Object.prototype.hasOwnProperty.call(node, last)) {
            // Repeated key → collect into an array.
            const existing = node[last];
            if (Array.isArray(existing)) existing.push(value);
            else node[last] = [existing, value];
        } else {
            node[last] = value;
        }
    }
}
