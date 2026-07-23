import { BadRequest } from '../errors';
import { DmmfRegistry, ModelMeta } from './dmmf/registry';
import { ValueCoercer } from './dmmf/coercer';
import { OperatorRegistry } from './operators';
import type { FieldMeta, RelationMeta } from '../types/dmmf';
import type {
    RawSpec,
    QuerySpec,
    BuildContext,
    SortDir,
    ResolvedSecurity,
    JsonPathSyntax,
} from '../types/query';

/** Nesting cap when no `security.maxDepth` is configured. */
const DEFAULT_MAX_DEPTH = 12;

/** Everything threaded through the recursive build. */
interface BuildScope {
    security: ResolvedSecurity;
    jsonPathSyntax: JsonPathSyntax;
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
        const scope: BuildScope = {
            security: ctx.security ?? { fields: '*', relations: '*', maxDepth: DEFAULT_MAX_DEPTH },
            jsonPathSyntax: ctx.jsonPathSyntax ?? 'array',
        };
        const spec: QuerySpec = {};

        let where = raw.where ? QueryBuilder.buildWhere(raw.where, model, scope, 0) : undefined;

        // `search` convenience → OR (contains) across configured fields.
        if (raw.search && ctx.searchable.length > 0) {
            const or = ctx.searchable.map(field => ({ [field]: { contains: raw.search } }));
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
        if (raw.select) spec.select = QueryBuilder.buildSelect(raw.select, model, scope);
        else if (raw.include) spec.include = QueryBuilder.buildInclude(raw.include, model, scope, 0);

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

            const relation = model.relation(key);
            if (relation) {
                QueryBuilder.assertRelationAllowed(relation, scope.security);
                out[relation.name] = QueryBuilder.buildRelation(value, relation, scope, depth + 1);
                continue;
            }

            const field = QueryBuilder.resolveField(model, key, scope.security);
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
        const keys = Object.keys(value);

        if (keys.some(key => OperatorRegistry.isRelation(key))) {
            const result: Record<string, any> = {};
            for (const [key, sub] of Object.entries(value)) {
                if (!OperatorRegistry.isRelation(key)) {
                    throw new BadRequest({ msg: `Invalid relation operator '${key}' on '${relation.name}'` });
                }
                result[key] = QueryBuilder.buildWhere(sub, related, scope, depth + 1);
            }
            return result;
        }

        // Bare nested filter: wrap to-many in `some`, keep to-one direct.
        const inner = QueryBuilder.buildWhere(value, related, scope, depth + 1);
        return relation.isList ? { some: inner } : inner;
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
            const resolved = QueryBuilder.resolveField(model, field, scope.security, 'sort by');
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
            out[QueryBuilder.resolveField(model, key, scope.security, 'select').name] = true;
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
            const relation = model.relation(key);
            if (!relation) {
                throw new BadRequest({ msg: `Cannot include unknown relation '${key}' on ${model.name}` });
            }
            QueryBuilder.assertRelationAllowed(relation, scope.security);
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const related = DmmfRegistry.model(relation.target);
                out[relation.name] = { include: QueryBuilder.buildInclude(value, related, scope, depth + 1) };
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
            name => QueryBuilder.resolveField(model, name, scope.security, verb).name,
        );
    }

    private static fieldFlags(
        value: string | string[],
        model: ModelMeta,
        scope: BuildScope,
    ): Record<string, true> {
        const out: Record<string, true> = {};
        for (const name of QueryBuilder.toList(value)) {
            out[QueryBuilder.resolveField(model, name, scope.security, 'aggregate').name] = true;
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
        security: ResolvedSecurity,
        verb = 'filter by',
    ): FieldMeta {
        const field = model.field(name);
        if (!field) {
            throw new BadRequest({
                msg: `Unknown field '${name}' on ${model.name}. Available fields: ${model.fieldNames().join(', ')}. Relations: ${model.relationNames().join(', ')}`,
            });
        }
        if (security.fields !== '*' && !security.fields.has(field.name.toLowerCase())) {
            throw new BadRequest({ msg: `Cannot ${verb} field '${field.name}' (not allowed)` });
        }
        return field;
    }

    private static assertRelationAllowed(relation: RelationMeta, security: ResolvedSecurity): void {
        if (security.relations !== '*' && !security.relations.has(relation.name.toLowerCase())) {
            throw new BadRequest({ msg: `Cannot traverse relation '${relation.name}' (not allowed)` });
        }
    }
}
