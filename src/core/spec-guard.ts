import { BadRequest } from '../errors';
import { DmmfRegistry } from './dmmf/registry';
import { OperatorRegistry } from './operators';
import { FieldMask } from './mask';
import type { ModelMetadata } from '../types/dmmf';
import type { QuerySpec, ResolvedSecurity, MaskNode } from '../types/query';

/**
 * Applies the security policy to an **already-built** {@link QuerySpec}.
 *
 * Adapters that produce Prisma args without going through {@link QueryBuilder} —
 * today only the legacy GET engine, which is frozen and cannot be re-plumbed —
 * would otherwise escape the allow-lists entirely. This validator walks the spec
 * with the same rules and rejects anything the builder would have rejected.
 */
export class SpecGuard {
    /** Keys that stay at the same model level while walking a `where` tree. */
    private static readonly PASSTHROUGH = new Set(['AND', 'OR', 'NOT', 'and', 'or', 'not']);

    static check(spec: QuerySpec, model: ModelMetadata, security?: ResolvedSecurity): void {
        if (!security) return;
        if (security.fields === '*' && security.relations === '*' && !security.hidden) return;

        const mask = security.hidden;
        if (spec.where) SpecGuard.where(spec.where, model, security, mask, 0);

        for (const entry of spec.orderBy ?? []) {
            for (const name of Object.keys(entry)) SpecGuard.field(name, model, security, mask, 'sort by');
        }
        for (const name of Object.keys(spec.select ?? {})) {
            SpecGuard.field(name, model, security, mask, 'select');
        }
        for (const name of spec.distinct ?? []) {
            SpecGuard.field(name, model, security, mask, 'distinct');
        }
        for (const name of spec.by ?? []) {
            SpecGuard.field(name, model, security, mask, 'group by');
        }
        if (spec.include) SpecGuard.include(spec.include, model, security, mask, 0);
    }

    // ── walkers ───────────────────────────────────────────────────────────────

    private static where(
        node: any,
        model: ModelMetadata,
        security: ResolvedSecurity,
        mask: MaskNode | undefined,
        depth: number,
    ): void {
        if (depth > security.maxDepth) throw new BadRequest({ msg: 'Filter nesting too deep' });
        if (node === null || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            for (const item of node) SpecGuard.where(item, model, security, mask, depth + 1);
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (SpecGuard.PASSTHROUGH.has(key)) {
                SpecGuard.where(value, model, security, mask, depth + 1);
                continue;
            }
            if (FieldMask.hides(mask, key)) throw SpecGuard.unknown(key, model);

            const relation = model.relation(key);
            if (relation) {
                if (security.relations !== '*' && !security.relations.has(relation.name.toLowerCase())) {
                    throw new BadRequest({ msg: `Cannot traverse relation '${relation.name}' (not allowed)` });
                }
                SpecGuard.nested(
                    value,
                    DmmfRegistry.model(relation.target),
                    security,
                    FieldMask.child(mask, relation.name),
                    op => OperatorRegistry.isRelation(op),
                    depth,
                );
                continue;
            }

            const composite = model.composite(key);
            if (composite) {
                SpecGuard.allowed(composite.name, security, 'filter by');
                SpecGuard.nested(
                    value,
                    DmmfRegistry.composite(composite.target),
                    security,
                    FieldMask.child(mask, composite.name),
                    op => OperatorRegistry.isComposite(op, composite.isList),
                    depth,
                );
                continue;
            }

            SpecGuard.field(key, model, security, mask, 'filter by');
        }
    }

    /** Walk into a relation/composite value, unwrapping its operators first. */
    private static nested(
        value: any,
        target: ModelMetadata,
        security: ResolvedSecurity,
        mask: MaskNode | undefined,
        isOperator: (key: string) => boolean,
        depth: number,
    ): void {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return;

        const keys = Object.keys(value);
        if (keys.some(isOperator)) {
            for (const key of keys) {
                if (isOperator(key)) SpecGuard.where(value[key], target, security, mask, depth + 1);
            }
            return;
        }
        SpecGuard.where(value, target, security, mask, depth + 1);
    }

    private static include(
        node: any,
        model: ModelMetadata,
        security: ResolvedSecurity,
        mask: MaskNode | undefined,
        depth: number,
    ): void {
        if (depth > security.maxDepth) throw new BadRequest({ msg: 'Include nesting too deep' });

        for (const [key, value] of Object.entries(node ?? {})) {
            if (FieldMask.hides(mask, key)) throw SpecGuard.unknown(key, model);

            const relation = model.relation(key);
            if (!relation) continue;
            if (security.relations !== '*' && !security.relations.has(relation.name.toLowerCase())) {
                throw new BadRequest({ msg: `Cannot traverse relation '${relation.name}' (not allowed)` });
            }
            if (value && typeof value === 'object' && (value as any).include) {
                SpecGuard.include(
                    (value as any).include,
                    DmmfRegistry.model(relation.target),
                    security,
                    FieldMask.child(mask, relation.name),
                    depth + 1,
                );
            }
        }
    }

    // ── checks ────────────────────────────────────────────────────────────────

    private static field(
        name: string,
        model: ModelMetadata,
        security: ResolvedSecurity,
        mask: MaskNode | undefined,
        verb: string,
    ): void {
        if (FieldMask.hides(mask, name)) throw SpecGuard.unknown(name, model);

        const field = model.field(name) ?? model.composite(name);
        // Unknown names are the legacy engine's business, not ours: it has already
        // validated them, and a name we cannot resolve carries no data either way.
        if (!field) return;
        SpecGuard.allowed(field.name, security, verb);
    }

    private static allowed(name: string, security: ResolvedSecurity, verb: string): void {
        if (security.fields !== '*' && !security.fields.has(name.toLowerCase())) {
            throw new BadRequest({ msg: `Cannot ${verb} field '${name}' (not allowed)` });
        }
    }

    private static unknown(name: string, model: ModelMetadata): BadRequest {
        return new BadRequest({ msg: `Unknown field '${name}' on ${model.name}` });
    }
}
