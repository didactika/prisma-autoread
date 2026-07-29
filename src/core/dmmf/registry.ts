import { Prisma } from '@prisma/client';
import { BadRequest } from '../../errors';
import type { FieldMeta, RelationMeta, CompositeMeta, ModelMetadata } from '../../types/dmmf';

/**
 * O(1) metadata view of a single Prisma model — or of a MongoDB composite type,
 * which the DMMF describes with the very same shape — built once and cached.
 *
 * Fields, relations and composite fields are indexed by lower-cased name, so
 * lookups are case-insensitive without scanning.
 */
export class ModelMeta implements ModelMetadata {
    readonly name: string;
    readonly isComposite: boolean;
    private readonly fields = new Map<string, FieldMeta>();
    private readonly relations = new Map<string, RelationMeta>();
    private readonly composites = new Map<string, CompositeMeta>();

    /**
     * @param model - Raw DMMF model (or type) node.
     * @param compositeTypes - Names of every composite type in the schema, used to
     *   tell an embedded document apart from a real relation.
     * @param isComposite - Whether `model` itself is a composite type.
     */
    constructor(model: any, compositeTypes: ReadonlySet<string> = new Set(), isComposite = false) {
        this.name = model.name;
        this.isComposite = isComposite;

        for (const field of model.fields ?? []) {
            if (field.kind === 'object') {
                const entry = {
                    name: field.name,
                    target: field.type,
                    isList: !!field.isList,
                };
                if (compositeTypes.has(field.type)) this.composites.set(field.name.toLowerCase(), entry);
                else this.relations.set(field.name.toLowerCase(), entry);
            } else {
                this.fields.set(field.name.toLowerCase(), {
                    name: field.name,
                    type: field.type,
                    kind: field.kind,
                    isList: !!field.isList,
                });
            }
        }
    }

    field(name: string): FieldMeta | undefined {
        return this.fields.get(name.toLowerCase());
    }

    relation(name: string): RelationMeta | undefined {
        return this.relations.get(name.toLowerCase());
    }

    /** Embedded composite-type field (MongoDB `type` block), if any. */
    composite(name: string): CompositeMeta | undefined {
        return this.composites.get(name.toLowerCase());
    }

    isJson(name: string): boolean {
        return this.field(name)?.type === 'Json';
    }

    fieldNames(): string[] {
        return [...this.fields.values()].map(f => f.name);
    }

    relationNames(): string[] {
        return [...this.relations.values()].map(r => r.name);
    }

    compositeNames(): string[] {
        return [...this.composites.values()].map(c => c.name);
    }
}

/**
 * Process-wide cache of {@link ModelMeta}, keyed by kind + lower-cased name.
 * Reads the generated Prisma DMMF once per model or composite type.
 */
export class DmmfRegistry {
    private static readonly cache = new Map<string, ModelMeta>();
    private static compositeTypes: ReadonlySet<string> | undefined;

    /** Metadata for a model declared with `model X { … }`. */
    static model(name: string): ModelMeta {
        return DmmfRegistry.lookup(name, 'models', false);
    }

    /** Metadata for a MongoDB composite type declared with `type X { … }`. */
    static composite(name: string): ModelMeta {
        return DmmfRegistry.lookup(name, 'types', true);
    }

    /** Names of every composite type in the schema (empty on non-MongoDB datasources). */
    static compositeTypeNames(): ReadonlySet<string> {
        if (!DmmfRegistry.compositeTypes) {
            const types = DmmfRegistry.datamodel().types ?? [];
            DmmfRegistry.compositeTypes = new Set(types.map((t: any) => t.name));
        }
        return DmmfRegistry.compositeTypes;
    }

    /** Clear the cache (useful between tests that swap the mocked DMMF). */
    static clear(): void {
        DmmfRegistry.cache.clear();
        DmmfRegistry.compositeTypes = undefined;
    }

    private static lookup(name: string, section: 'models' | 'types', isComposite: boolean): ModelMeta {
        const key = `${section}:${name.toLowerCase()}`;
        const cached = DmmfRegistry.cache.get(key);
        if (cached) return cached;

        const nodes = DmmfRegistry.datamodel()[section] ?? [];
        const node = nodes.find((m: any) => m.name.toLowerCase() === name.toLowerCase());
        if (!node) {
            throw new BadRequest({
                msg: isComposite
                    ? `Composite type '${name}' not found in Prisma schema`
                    : `Model '${name}' not found in Prisma schema`,
            });
        }

        const meta = new ModelMeta(node, DmmfRegistry.compositeTypeNames(), isComposite);
        DmmfRegistry.cache.set(key, meta);
        return meta;
    }

    private static datamodel(): Record<string, any[]> {
        return (Prisma as any)?.dmmf?.datamodel ?? {};
    }
}
