/** Prisma DMMF metadata projections used by the engine. */

export interface FieldMeta {
    /** Correctly-cased field name. */
    name: string;
    /** Prisma scalar/enum type (e.g. `'Int'`, `'String'`, `'Json'`, `'DateTime'`). */
    type: string;
    /** DMMF kind: `'scalar'` | `'enum'`. */
    kind: string;
    isList: boolean;
    /**
     * Datasource-native type when the schema declares one (`@db.ObjectId` →
     * `'ObjectId'`). `type` alone is not enough: a MongoDB `@db.ObjectId` column is
     * a plain `String` in the DMMF, yet only accepts 24-character hex values.
     */
    nativeType?: string;
}

export interface RelationMeta {
    /** Correctly-cased relation field name. */
    name: string;
    /** Related model name. */
    target: string;
    /** Whether the relation is to-many. */
    isList: boolean;
}

/**
 * An embedded MongoDB composite type field (`type Program { … }` in the schema).
 *
 * Composite fields look like relations in the DMMF (`kind: 'object'`) but their
 * target lives in `datamodel.types`, not `datamodel.models`, and Prisma filters
 * them with `is`/`isNot`/`some`/`every`/`none` instead of relation operators.
 */
export interface CompositeMeta {
    /** Correctly-cased field name. */
    name: string;
    /** Composite type name (a member of `Prisma.dmmf.datamodel.types`). */
    target: string;
    /** Whether the field holds a list of embedded documents. */
    isList: boolean;
}

/** Read-only metadata view of a Prisma model (or composite type) with O(1) lookups. */
export interface ModelMetadata {
    readonly name: string;
    /** True when this metadata describes a composite type rather than a model. */
    readonly isComposite: boolean;
    field(name: string): FieldMeta | undefined;
    relation(name: string): RelationMeta | undefined;
    composite(name: string): CompositeMeta | undefined;
    isJson(name: string): boolean;
    fieldNames(): string[];
    relationNames(): string[];
    compositeNames(): string[];
}
