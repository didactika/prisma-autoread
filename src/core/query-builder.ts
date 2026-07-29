import { BadRequest } from '../errors';
import { DmmfRegistry, ModelMeta } from './dmmf/registry';
import { ValueCoercer } from './dmmf/coercer';
import { OperatorRegistry } from './operators';
import { FieldMask } from './mask';
import type { FieldMeta, RelationMeta, CompositeMeta } from '../types/dmmf';
import type {
    RawSpec,
    QuerySpec,
    BuildContext,
    SortDir,
    ResolvedSecurity,
    JsonPathSyntax,
    MaskNode,
} from '../types/query';

/** Nesting cap when no `security.maxDepth` is configured. */
const DEFAULT_MAX_DEPTH = 12;

/** Everything threaded through the recursive build. */
interface BuildScope {
    security: ResolvedSecurity;
    jsonPathSyntax: JsonPathSyntax;
    /** Mask that applies at the current nesting level (`security.hidden`). */
    mask?: MaskNode;
}

/**
 * Turns a {@link RawSpec} (operator aliases, raw values) into a Prisma-ready
 * {@link QuerySpec}: validates every field/relation against the DMMF and the
 * security allow-list, maps operator aliases to Prisma operators, and coerces
 * values to their column type.
 *
 * This is the single place where filtering semantics live, shared by every input
 * adapter that speaks the operator vocabulary.
 */
export class QueryBuilder {
    static build(raw: RawSpec, model: ModelMeta, ctx: BuildContext): QuerySpec {
        const security = ctx.security ?? { fields: '*', relations: '*', maxDepth: DEFAULT_MAX_DEPTH };
        const scope: BuildScope = {
            security,
            jsonPathSyntax: ctx.jsonPathSyntax ?? 'array',
            mask: security.hidden,
        };
        const spec: QuerySpec = {};

        let where = raw.where ? QueryBuilder.buildWhere(raw.where, model, scope, 0) : undefined;

        // `search` convenience → OR (contains) across configured fields.
        // Hidden fields drop out: they must not be probed, not even indirectly.
        const searchable = FieldMask.visible(ctx.searchable, scope.mask);
        if (raw.search && searchable.length > 0) {
            const or = searchable.map(field => ({ [field]: { contains: raw.search } }));
            where = where ? { AND: [where, { OR: or }] } : { OR: or };
        }
        if (where) spec.where = where;

        // group-by has its own Prisma constraints, so the list defaults are skipped.
        const grouping = !!raw.by;

        if (raw.orderBy?.length) {
            spec.orderBy = QueryBuilder.buildOrderBy(raw.orderBy, model, scope);
        } else if (!grouping) {
            const sortField = model.field(ctx.defaults.sort)?.name;
            if (sortField) spec.orderBy = [{ [sortField]: ctx.defaults.order }];
        }

        // Prisma forbids `select` and `include` together → select wins.
        if (raw.select) {
            spec.select = QueryBuilder.buildSelect(raw.select, model, scope);
        } else if (raw.include) {
            const include = QueryBuilder.buildInclude(raw.include, model, scope, 0);
            // Everything asked for may have been a composite (always returned anyway).
            if (Object.keys(include).length > 0) spec.include = include;
        }

        QueryBuilder.applyPagination(raw, spec, ctx, grouping);

        if (raw.distinct) spec.distinct = QueryBuilder.fieldList(raw.distinct, model, scope, 'distinct');
        if (raw.cursor !== undefined && raw.cursor !== '') {
            spec.cursor = QueryBuilder.buildCursor(raw.cursor, model);
        }

        QueryBuilder.applyAggregations(raw, spec, model, scope);

        // `having` uses Prisma's aggregation shape (field → _sum/_avg… → op).
        if (raw.having && typeof raw.having === 'object') spec.having = raw.having;

        return spec;
    }

    // ── where ────────────────────────────────────────────────────────────────

    private static buildWhere(
        node: any,
        model: ModelMeta,
        scope: BuildScope,
        depth: number,
    ): Record<string, any> {
        if (depth > scope.security.maxDepth) throw new BadRequest({ msg: 'Filter nesting too deep' });
        if (node === null || typeof node !== 'object' || Array.isArray(node)) {
            throw new BadRequest({ msg: 'Filter must be an object' });
        }

        const out: Record<string, any> = {};

        for (const [key, value] of Object.entries(node)) {
            const logical = OperatorRegistry.logical(key);
            if (logical) {
                if (logical === 'NOT') {
                    out.NOT = QueryBuilder.buildWhere(value, model, scope, depth + 1);
                } else {
                    const branches = Array.isArray(value) ? value : Object.values(value as any);
                    out[logical] = branches.map((sub: any) =>
                        QueryBuilder.buildWhere(sub, model, scope, depth + 1),
                    );
                }
                continue;
            }

            // A hidden name is treated as if it did not exist at all.
            if (FieldMask.hides(scope.mask, key)) throw QueryBuilder.unknown(key, model, scope);

            const relation = model.relation(key);
            if (relation) {
                QueryBuilder.assertRelationAllowed(relation, scope.security);
                out[relation.name] = QueryBuilder.buildRelation(value, relation, scope, depth + 1);
                continue;
            }

            const composite = model.composite(key);
            if (composite) {
                QueryBuilder.assertFieldAllowed(composite.name, scope.security);
                out[composite.name] = QueryBuilder.buildComposite(value, composite, scope, depth + 1);
                continue;
            }

            const field = QueryBuilder.resolveField(model, key, scope);
            out[field.name] = field.type === 'Json'
                ? QueryBuilder.buildJson(value, scope.jsonPathSyntax)
                : QueryBuilder.buildFieldCondition(value, field.type);
        }

        return out;
    }

    private static buildRelation(
        value: any,
        relation: RelationMeta,
        scope: BuildScope,
        depth: number,
    ): Record<string, any> {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new BadRequest({ msg: `Relation '${relation.name}' expects a nested filter object` });
        }

        const related = DmmfRegistry.model(relation.target);
        const inner = QueryBuilder.descend(scope, relation.name);
        const keys = Object.keys(value);

        if (keys.some(key => OperatorRegistry.isRelation(key))) {
            const result: Record<string, any> = {};
            for (const [key, sub] of Object.entries(value)) {
                if (!OperatorRegistry.isRelation(key)) {
                    throw new BadRequest({ msg: `Invalid relation operator '${key}' on '${relation.name}'` });
                }
                result[key] = QueryBuilder.buildWhere(sub, related, inner, depth + 1);
            }
            return result;
        }

        // Bare nested filter: wrap to-many in `some`, keep to-one direct.
        const filter = QueryBuilder.buildWhere(value, related, inner, depth + 1);
        return relation.isList ? { some: filter } : filter;
    }

    /**
     * Build the filter for an embedded MongoDB composite type.
     *
     * Prisma does not accept a bare nested object here — that shape means *whole
     * document equality* — so a plain filter is wrapped in `is` (single document)
     * or `some` (list), which is what `?filter[program][shortname]=X` means.
     *
     * @example
     * // filter[program][shortname]=MAT → { program: { is: { shortname: 'MAT' } } }
     * // filter[program][subjects][type]=lab
     * //   → { program: { is: { subjects: { some: { type: 'lab' } } } } }
     */
    private static buildComposite(
        value: any,
        composite: CompositeMeta,
        scope: BuildScope,
        depth: number,
    ): Record<string, any> {
        if (depth > scope.security.maxDepth) throw new BadRequest({ msg: 'Filter nesting too deep' });

        // `program=null` on an optional embedded document.
        if (value === null) return { is: null };
        if (typeof value !== 'object' || Array.isArray(value)) {
            throw new BadRequest({
                msg: `Composite field '${composite.name}' expects a nested filter object`,
            });
        }

        const target = DmmfRegistry.composite(composite.target);
        const inner = QueryBuilder.descend(scope, composite.name);
        const keys = Object.keys(value);

        if (keys.some(key => OperatorRegistry.isComposite(key, composite.isList))) {
            const result: Record<string, any> = {};
            for (const [key, sub] of Object.entries(value)) {
                const op = OperatorRegistry.composite(key, composite.isList);
                if (!op) {
                    throw new BadRequest({
                        msg: `Invalid operator '${key}' on composite field '${composite.name}'. Available: ${OperatorRegistry.compositeNames(composite.isList).join(', ')}`,
                    });
                }
                if (OperatorRegistry.COMPOSITE_FLAG_OPS.has(op)) {
                    result[op] = sub === true || sub === 'true' || sub === 1 || sub === '1';
                } else if (op === 'equals') {
                    // Whole-document equality: Prisma matches the value verbatim.
                    result.equals = sub;
                } else if (sub === null) {
                    result[op] = null;
                } else {
                    result[op] = QueryBuilder.buildWhere(sub, target, inner, depth + 1);
                }
            }
            return result;
        }

        const filter = QueryBuilder.buildWhere(value, target, inner, depth + 1);
        return composite.isList ? { some: filter } : { is: filter };
    }

    /** Same scope, moved one level down the `hidden` mask tree. */
    private static descend(scope: BuildScope, name: string): BuildScope {
        const mask = FieldMask.child(scope.mask, name);
        return mask === scope.mask ? scope : { ...scope, mask };
    }

    private static buildFieldCondition(value: any, type: string): any {
        if (value === null) return null;
        if (Array.isArray(value)) return { in: ValueCoercer.list(value, type) };
        if (typeof value !== 'object') return ValueCoercer.scalar(value, type);

        const condition: Record<string, any> = {};
        for (const [key, operand] of Object.entries(value)) {
            const op = OperatorRegistry.field(key);
            if (!op) throw new BadRequest({ msg: `Unknown operator '${key}'` });

            if (op === 'isNull') {
                const truthy = operand === true || operand === 'true' || operand === 1 || operand === '1';
                if (truthy) condition.equals = null;
                else condition.not = null;
            } else if (OperatorRegistry.LIST_OPS.has(op)) {
                condition[op] = ValueCoercer.list(operand, type);
            } else if (op === 'mode') {
                condition.mode = operand;
            } else if (op === 'not') {
                condition.not = operand !== null && typeof operand === 'object'
                    ? QueryBuilder.buildFieldCondition(operand, type)
                    : ValueCoercer.scalar(operand, type);
            } else {
                condition[op] = ValueCoercer.scalar(operand, type);
            }
        }
        return condition;
    }

    /** Pass a JSON filter through, normalising `path` to the datasource syntax. */
    private static buildJson(value: any, syntax: JsonPathSyntax): any {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            return { equals: ValueCoercer.jsonLeaf(value) };
        }
        const out: Record<string, any> = {};
        for (const [key, operand] of Object.entries(value)) {
            if (key === 'path') {
                out.path = QueryBuilder.normalizeJsonPath(operand, syntax);
            } else if (operand !== null && typeof operand === 'object' && !Array.isArray(operand)) {
                out[key] = QueryBuilder.buildJson(operand, syntax);
            } else {
                out[key] = typeof operand === 'string' ? ValueCoercer.jsonLeaf(operand) : operand;
            }
        }
        return out;
    }

    private static normalizeJsonPath(path: any, syntax: JsonPathSyntax): string[] | string {
        const segments = Array.isArray(path)
            ? path.map(String)
            : String(path).replace(/^\$\./, '').split('.');
        return syntax === 'string' ? `$.${segments.join('.')}` : segments;
    }

    // ── orderBy / select / include ─────────────────────────────────────────────

    private static buildOrderBy(
        orderBy: Array<Record<string, SortDir>>,
        model: ModelMeta,
        scope: BuildScope,
    ): Array<Record<string, SortDir>> {
        return orderBy.map(entry => {
            const [field, dir] = Object.entries(entry)[0];
            const resolved = QueryBuilder.resolveField(model, field, scope, 'sort by');
            return { [resolved.name]: dir === 'desc' ? 'desc' : 'asc' } as Record<string, SortDir>;
        });
    }

    private static buildSelect(
        fields: Record<string, any>,
        model: ModelMeta,
        scope: BuildScope,
    ): Record<string, any> {
        const out: Record<string, any> = {};
        for (const key of Object.keys(fields)) {
            // An embedded composite document can be projected as a whole.
            const composite = !FieldMask.hides(scope.mask, key) && model.composite(key);
            if (composite) {
                QueryBuilder.assertFieldAllowed(composite.name, scope.security, 'select');
                out[composite.name] = true;
                continue;
            }
            out[QueryBuilder.resolveField(model, key, scope, 'select').name] = true;
        }
        return out;
    }

    private static buildInclude(
        include: any,
        model: ModelMeta,
        scope: BuildScope,
        depth: number,
    ): Record<string, any> {
        if (depth > scope.security.maxDepth) throw new BadRequest({ msg: 'Include nesting too deep' });
        const out: Record<string, any> = {};
        for (const [key, value] of Object.entries(include)) {
            if (FieldMask.hides(scope.mask, key)) {
                throw new BadRequest({ msg: `Cannot include unknown relation '${key}' on ${model.name}` });
            }

            // Embedded composite documents always come back with the row; Prisma
            // rejects them inside `include`, so asking for one is a no-op.
            if (model.composite(key)) continue;

            const relation = model.relation(key);
            if (!relation) {
                throw new BadRequest({ msg: `Cannot include unknown relation '${key}' on ${model.name}` });
            }
            QueryBuilder.assertRelationAllowed(relation, scope.security);
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const related = DmmfRegistry.model(relation.target);
                const inner = QueryBuilder.descend(scope, relation.name);
                out[relation.name] = { include: QueryBuilder.buildInclude(value, related, inner, depth + 1) };
            } else {
                out[relation.name] = true;
            }
        }
        return out;
    }

    // ── pagination / aggregations ──────────────────────────────────────────────

    private static applyPagination(
        raw: RawSpec,
        spec: QuerySpec,
        ctx: BuildContext,
        grouping: boolean,
    ): void {
        if (!grouping) {
            const take = Math.min(raw.limit ?? ctx.defaults.limit, ctx.defaults.maxLimit);
            spec.take = raw.take ?? take;
            if (raw.skip !== undefined) {
                spec.skip = raw.skip;
            } else if (raw.cursor !== undefined && raw.page === undefined) {
                // Cursor mode: leave skip undefined so the executor skips the cursor row.
            } else {
                spec.skip = (Math.max(1, raw.page ?? 1) - 1) * spec.take;
            }
            return;
        }

        if (raw.take !== undefined || raw.limit !== undefined) {
            spec.take = Math.min(raw.take ?? raw.limit!, ctx.defaults.maxLimit);
        }
        if (raw.skip !== undefined) spec.skip = raw.skip;
        else if (raw.page !== undefined && spec.take) spec.skip = (Math.max(1, raw.page) - 1) * spec.take;
    }

    private static applyAggregations(
        raw: RawSpec,
        spec: QuerySpec,
        model: ModelMeta,
        scope: BuildScope,
    ): void {
        if (raw.by) spec.by = QueryBuilder.fieldList(raw.by, model, scope, 'group by');
        if (raw.sum) spec._sum = QueryBuilder.fieldFlags(raw.sum, model, scope);
        if (raw.avg) spec._avg = QueryBuilder.fieldFlags(raw.avg, model, scope);
        if (raw.min) spec._min = QueryBuilder.fieldFlags(raw.min, model, scope);
        if (raw.max) spec._max = QueryBuilder.fieldFlags(raw.max, model, scope);

        if (raw.count === true || raw.count === 'true') {
            spec._count = true;
        } else if ((typeof raw.count === 'string' && raw.count !== 'false') || Array.isArray(raw.count)) {
            spec._count = QueryBuilder.fieldFlags(raw.count, model, scope);
        }
    }

    private static toList(value: string | string[]): string[] {
        return (Array.isArray(value) ? value : String(value).split(','))
            .map(item => (typeof item === 'string' ? item.trim() : item))
            .filter(Boolean) as string[];
    }

    private static fieldList(
        value: string | string[],
        model: ModelMeta,
        scope: BuildScope,
        verb: string,
    ): string[] {
        return QueryBuilder.toList(value).map(
            name => QueryBuilder.resolveField(model, name, scope, verb).name,
        );
    }

    private static fieldFlags(
        value: string | string[],
        model: ModelMeta,
        scope: BuildScope,
    ): Record<string, true> {
        const out: Record<string, true> = {};
        for (const name of QueryBuilder.toList(value)) {
            out[QueryBuilder.resolveField(model, name, scope, 'aggregate').name] = true;
        }
        return out;
    }

    private static buildCursor(value: any, model: ModelMeta): Record<string, any> {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
        const idField = model.field('id')?.name ?? 'id';
        return { [idField]: ValueCoercer.scalar(value, model.field(idField)?.type) };
    }

    // ── access control ─────────────────────────────────────────────────────────

    private static resolveField(
        model: ModelMeta,
        name: string,
        scope: BuildScope,
        verb = 'filter by',
    ): FieldMeta {
        const field = FieldMask.hides(scope.mask, name) ? undefined : model.field(name);
        if (!field) throw QueryBuilder.unknown(name, model, scope);

        QueryBuilder.assertFieldAllowed(field.name, scope.security, verb);
        return field;
    }

    private static assertFieldAllowed(
        name: string,
        security: ResolvedSecurity,
        verb = 'filter by',
    ): void {
        if (security.fields !== '*' && !security.fields.has(name.toLowerCase())) {
            throw new BadRequest({ msg: `Cannot ${verb} field '${name}' (not allowed)` });
        }
    }

    private static assertRelationAllowed(relation: RelationMeta, security: ResolvedSecurity): void {
        if (security.relations !== '*' && !security.relations.has(relation.name.toLowerCase())) {
            throw new BadRequest({ msg: `Cannot traverse relation '${relation.name}' (not allowed)` });
        }
    }

    /**
     * The 400 raised for a name the client may not use. Hidden names are reported
     * exactly like names that do not exist, and never appear in the hint, so the
     * response cannot be used to probe for their existence.
     */
    private static unknown(name: string, model: ModelMeta, scope: BuildScope): BadRequest {
        const fields = FieldMask.visible(
            [...model.fieldNames(), ...model.compositeNames()],
            scope.mask,
        );
        const relations = FieldMask.visible(model.relationNames(), scope.mask);
        return new BadRequest({
            msg: `Unknown field '${name}' on ${model.name}. Available fields: ${fields.join(', ')}. Relations: ${relations.join(', ')}`,
        });
    }
}
