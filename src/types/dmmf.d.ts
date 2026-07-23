/** Prisma DMMF metadata projections used by the engine. */

export interface FieldMeta {
    /** Correctly-cased field name. */
    name: string;
    /** Prisma scalar/enum type (e.g. `'Int'`, `'String'`, `'Json'`, `'DateTime'`). */
    type: string;
    /** DMMF kind: `'scalar'` | `'enum'`. */
    kind: string;
    isList: boolean;
}

export interface RelationMeta {
    /** Correctly-cased relation field name. */
    name: string;
    /** Related model name. */
    target: string;
    /** Whether the relation is to-many. */
    isList: boolean;
}

/** Read-only metadata view of a Prisma model with O(1) lookups. */
export interface ModelMetadata {
    readonly name: string;
    field(name: string): FieldMeta | undefined;
    relation(name: string): RelationMeta | undefined;
    isJson(name: string): boolean;
    fieldNames(): string[];
    relationNames(): string[];
}
