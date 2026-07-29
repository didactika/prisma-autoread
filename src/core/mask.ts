import type { MaskNode } from '../types/query';

/**
 * Compiles `security.hidden` into a tree and applies it to responses.
 *
 * A hidden field is stronger than a missing entry in `security.fields`: it is not
 * only unusable in a filter, sort, `fields` or aggregation — it is also stripped
 * from every payload the endpoint returns, no matter how the row was fetched
 * (`select`, `include`, wildcards, embedded documents…).
 *
 * Paths are dotted and case-insensitive: `'password'` hides a root column,
 * `'enrolments.secret'` hides a column of an included relation, and
 * `'program.subjects.uuid'` reaches into MongoDB composite types.
 */
export class FieldMask {
    /** Build the mask tree, or `undefined` when nothing is hidden. */
    static compile(paths?: string[]): MaskNode | undefined {
        if (!paths?.length) return undefined;

        const root: MaskNode = { fields: new Set(), children: new Map() };
        for (const path of paths) {
            const segments = String(path).split('.').map(s => s.trim()).filter(Boolean);
            if (segments.length === 0) continue;

            let node = root;
            for (const segment of segments.slice(0, -1)) {
                const key = segment.toLowerCase();
                let child = node.children.get(key);
                if (!child) {
                    child = { fields: new Set(), children: new Map() };
                    node.children.set(key, child);
                }
                node = child;
            }
            node.fields.add(segments[segments.length - 1].toLowerCase());
        }
        return root;
    }

    /** Whether `name` is hidden at this level. */
    static hides(node: MaskNode | undefined, name: string): boolean {
        return !!node?.fields.has(name.toLowerCase());
    }

    /** The mask that applies inside `name` (a relation or composite field). */
    static child(node: MaskNode | undefined, name: string): MaskNode | undefined {
        return node?.children.get(name.toLowerCase());
    }

    /** Names from `names` that are visible at this level. */
    static visible(names: string[], node: MaskNode | undefined): string[] {
        if (!node) return names;
        return names.filter(name => !node.fields.has(name.toLowerCase()));
    }

    /**
     * Deep-copy `value` without the hidden keys. Returns the value untouched when
     * there is nothing to hide, so the common case costs one comparison.
     */
    static apply<T>(value: T, node?: MaskNode): T {
        if (!node) return value;
        return FieldMask.strip(value, node);
    }

    private static strip(value: any, node: MaskNode | undefined): any {
        if (!node || value === null || typeof value !== 'object') return value;
        if (value instanceof Date || value instanceof RegExp || value instanceof Error) return value;

        if (Array.isArray(value)) return value.map(item => FieldMask.strip(item, node));

        const out: Record<string, any> = {};
        for (const [key, item] of Object.entries(value)) {
            const lower = key.toLowerCase();
            if (node.fields.has(lower)) continue;
            const child = node.children.get(lower);
            out[key] = child ? FieldMask.strip(item, child) : item;
        }
        return out;
    }
}
