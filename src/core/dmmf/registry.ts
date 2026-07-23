import { Prisma } from '@prisma/client';
import { BadRequest } from '../../errors';
import type { FieldMeta, RelationMeta, ModelMetadata } from '../../types/dmmf';

/**
 * O(1) metadata view of a single Prisma model, built once and cached.
 *
 * Fields and relations are indexed by lower-cased name, so lookups are
 * case-insensitive without scanning.
 */
export class ModelMeta implements ModelMetadata {
    readonly name: string;
    private readonly fields = new Map<string, FieldMeta>();
    private readonly relations = new Map<string, RelationMeta>();

    constructor(model: any) {
        this.name = model.name;
        for (const field of model.fields ?? []) {
            if (field.kind === 'object') {
                this.relations.set(field.name.toLowerCase(), {
                    name: field.name,
                    target: field.type,
                    isList: !!field.isList,
                });
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

    isJson(name: string): boolean {
        return this.field(name)?.type === 'Json';
    }

    fieldNames(): string[] {
        return [...this.fields.values()].map(f => f.name);
    }

    relationNames(): string[] {
        return [...this.relations.values()].map(r => r.name);
    }
}

/**
 * Process-wide cache of {@link ModelMeta}, keyed by lower-cased model name.
 * Reads the generated Prisma DMMF once per model.
 */
export class DmmfRegistry {
    private static readonly cache = new Map<string, ModelMeta>();

    static model(name: string): ModelMeta {
        const key = name.toLowerCase();
        const cached = DmmfRegistry.cache.get(key);
        if (cached) return cached;

        const models = (Prisma as any)?.dmmf?.datamodel?.models ?? [];
        const model = models.find((m: any) => m.name.toLowerCase() === key);
        if (!model) {
            throw new BadRequest({ msg: `Model '${name}' not found in Prisma schema` });
        }

        const meta = new ModelMeta(model);
        DmmfRegistry.cache.set(key, meta);
        return meta;
    }

    /** Clear the cache (useful between tests that swap the mocked DMMF). */
    static clear(): void {
        DmmfRegistry.cache.clear();
    }
}
