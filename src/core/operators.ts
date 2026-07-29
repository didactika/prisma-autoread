/**
 * Operator vocabulary: maps the REST-friendly aliases accepted on the wire to
 * their Prisma `where` operator names. Prisma-native names resolve to themselves,
 * so a JSON body written in pure Prisma travels the same path.
 */
export class OperatorRegistry {
    /** Field-level operator aliases (keyed lower-case) → Prisma operator. */
    private static readonly FIELD_OPS: Readonly<Record<string, string>> = Object.freeze({
        eq: 'equals',
        equals: 'equals',
        ne: 'not',
        not: 'not',
        gt: 'gt',
        gte: 'gte',
        lt: 'lt',
        lte: 'lte',
        in: 'in',
        nin: 'notIn',
        notin: 'notIn',
        contains: 'contains',
        like: 'contains',
        startswith: 'startsWith',
        sw: 'startsWith',
        endswith: 'endsWith',
        ew: 'endsWith',
        mode: 'mode',
        search: 'search',
    });

    /** Logical operators (keyed as received) → canonical Prisma key. */
    private static readonly LOGICAL_OPS: Readonly<Record<string, 'AND' | 'OR' | 'NOT'>> =
        Object.freeze({
            and: 'AND',
            AND: 'AND',
            or: 'OR',
            OR: 'OR',
            not: 'NOT',
            NOT: 'NOT',
        });

    /** Relation-level operators. */
    static readonly RELATION_OPS: ReadonlySet<string> = new Set([
        'some', 'every', 'none', 'is', 'isNot',
    ]);

    /**
     * Composite-type operators (MongoDB embedded documents), keyed lower-case.
     * Prisma exposes a different set for a single embedded document and for a list
     * of them, so each shape has its own map.
     */
    private static readonly COMPOSITE_OPS: Readonly<Record<string, string>> = Object.freeze({
        is: 'is',
        isnot: 'isNot',
        equals: 'equals',
        eq: 'equals',
        isset: 'isSet',
    });

    private static readonly COMPOSITE_LIST_OPS: Readonly<Record<string, string>> = Object.freeze({
        some: 'some',
        every: 'every',
        none: 'none',
        equals: 'equals',
        eq: 'equals',
        isempty: 'isEmpty',
        isset: 'isSet',
    });

    /** Operators whose operand is a boolean flag rather than a nested filter. */
    static readonly COMPOSITE_FLAG_OPS: ReadonlySet<string> = new Set(['isEmpty', 'isSet']);

    /**
     * Resolve a composite-type operator for the given field shape.
     *
     * @param key - Operator as received (case-insensitive).
     * @param isList - Whether the composite field holds a list of documents.
     */
    static composite(key: string, isList: boolean): string | undefined {
        const map = isList ? OperatorRegistry.COMPOSITE_LIST_OPS : OperatorRegistry.COMPOSITE_OPS;
        return map[key.toLowerCase()];
    }

    /** Whether a key is a composite operator for the given field shape. */
    static isComposite(key: string, isList: boolean): boolean {
        return OperatorRegistry.composite(key, isList) !== undefined;
    }

    /** Every composite operator name, for error messages. */
    static compositeNames(isList: boolean): string[] {
        const map = isList ? OperatorRegistry.COMPOSITE_LIST_OPS : OperatorRegistry.COMPOSITE_OPS;
        return [...new Set(Object.values(map))];
    }

    /** Operators whose value is a list. */
    static readonly LIST_OPS: ReadonlySet<string> = new Set(['in', 'notIn']);

    /** Resolve a field operator key (alias or Prisma-native) to its Prisma name. */
    static field(key: string): string | undefined {
        if (key.toLowerCase() === 'isnull') return 'isNull';
        return OperatorRegistry.FIELD_OPS[key.toLowerCase()];
    }

    /** Resolve a logical operator at model level. */
    static logical(key: string): 'AND' | 'OR' | 'NOT' | undefined {
        return OperatorRegistry.LOGICAL_OPS[key];
    }

    /** Whether a key is a relation operator (`some`, `every`, …). */
    static isRelation(key: string): boolean {
        return OperatorRegistry.RELATION_OPS.has(key);
    }
}
