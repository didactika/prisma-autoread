import { Prisma } from '@prisma/client';

/** Keys that address a nested document rather than a column at the current level. */
const NESTED_OPS = new Set(['is', 'isNot', 'some', 'every', 'none']);

/** Composite-type operators; their presence means the caller wrote the filter itself. */
const COMPOSITE_OPS = new Set([
    'is', 'isNot', 'some', 'every', 'none', 'equals', 'isEmpty', 'isSet',
]);

/**
 * Rewrites a legacy `where` so MongoDB composite types are filtered the way Prisma
 * expects.
 *
 * The legacy engine builds nested filters by name alone (`campus.uuid` →
 * `{ campus: { uuid } }`), which is correct for relations but means *whole-document
 * equality* for an embedded type — so `?program[shortname]=MAT` silently matched
 * nothing. This pass walks the finished tree against the DMMF and wraps every
 * composite level in `is` (single document) or `some` (list).
 *
 * On datasources without composite types (everything but MongoDB) the schema has no
 * `datamodel.types`, and the whole pass is skipped.
 */
export default class CompositeWhereNormalizer {
    /**
     * @param where - `where` object built by the legacy pipeline.
     * @param modelName - Root Prisma model name.
     * @returns A normalised copy, or the original when there is nothing to rewrite.
     */
    static normalize(where: Record<string, any>, modelName: string): Record<string, any> {
        const types = CompositeWhereNormalizer.types();
        if (types.size === 0 || !where || typeof where !== 'object') return where;

        const root = CompositeWhereNormalizer.models().get(modelName);
        if (!root) return where;

        return CompositeWhereNormalizer.walk(where, root, types);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private static walk(node: any, typeInfo: any, types: Map<string, any>): any {
        if (Array.isArray(node)) {
            return node.map(item => CompositeWhereNormalizer.walk(item, typeInfo, types));
        }
        if (node === null || typeof node !== 'object') return node;

        const out: Record<string, any> = {};

        for (const [key, value] of Object.entries(node)) {
            // Logical branches and explicit nested operators stay at this level.
            if (key === 'AND' || key === 'OR' || key === 'NOT' || NESTED_OPS.has(key)) {
                out[key] = CompositeWhereNormalizer.walk(value, typeInfo, types);
                continue;
            }

            const field = typeInfo?.fields?.find((f: any) => f.name === key);
            if (!field || field.kind !== 'object' || value === null || typeof value !== 'object') {
                out[key] = value;
                continue;
            }

            const composite = types.get(field.type);
            const target = composite ?? CompositeWhereNormalizer.models().get(field.type);
            const inner = CompositeWhereNormalizer.walk(value, target, types);

            const alreadyWrapped =
                Array.isArray(value) ||
                Object.keys(value).some(k => COMPOSITE_OPS.has(k));

            out[key] = composite && !alreadyWrapped
                ? (field.isList ? { some: inner } : { is: inner })
                : inner;
        }

        return out;
    }

    /** Indexes are rebuilt only when the DMMF object itself changes (i.e. never in production). */
    private static cache?: { datamodel: any; models: Map<string, any>; types: Map<string, any> };

    private static models(): Map<string, any> {
        return CompositeWhereNormalizer.indexes().models;
    }

    private static types(): Map<string, any> {
        return CompositeWhereNormalizer.indexes().types;
    }

    private static indexes(): { models: Map<string, any>; types: Map<string, any> } {
        const datamodel = (Prisma as any)?.dmmf?.datamodel;
        const cache = CompositeWhereNormalizer.cache;
        if (cache && cache.datamodel === datamodel) return cache;

        const index = (nodes: any[] = []) =>
            new Map<string, any>(nodes.map((node: any) => [node.name, node]));
        const fresh = {
            datamodel,
            models: index(datamodel?.models),
            types: index(datamodel?.types),
        };
        CompositeWhereNormalizer.cache = fresh;
        return fresh;
    }
}
