import { Router, Response } from 'express';
import { BadRequest } from 'http-response-client/lib/errors/client';
import { Prisma } from '@prisma/client';
import PaginationMiddleware from './pagination.middleware';
import { AutoReadConfig, PaginationData, RequestFilterable } from '../types';

/**
 * Middleware that automatically creates a GET `/` list endpoint with pagination,
 * Prisma-aware filtering, full-text search, and relation includes.
 *
 * Usage:
 * ```typescript
 * const router = Router();
 * AutoReadMiddleware.applyToRouter(router, {
 *   modelName: 'User',
 *   searchableFields: ['firstName', 'lastName', 'email'],
 *   findByFilter: async ({ where, include, orderBy, take, skip }) => {
 *     const [data, total] = await Promise.all([
 *       prisma.user.findMany({ where, include, orderBy, take, skip }),
 *       prisma.user.count({ where }),
 *     ]);
 *     return { data, total };
 *   },
 * });
 * ```
 */
export default class AutoReadMiddleware {
    /**
     * Attach pagination middleware and the list endpoint to the given router.
     *
     * @param router - Express router to attach to
     * @param config - Endpoint configuration
     */
    public static applyToRouter(router: Router, config: AutoReadConfig): void {
        const { defaultLimit = 10, maxLimit = 100 } = config;

        router.use(PaginationMiddleware.processPagination(defaultLimit, maxLimit));
        router.get('/', this.createListEndpoint(config));
    }

    // ── DMMF helpers ───────────────────────────────────────────────────────────

    /**
     * Returns all field names for a Prisma model (from DMMF).
     */
    private static getPrismaModelFields(modelName: string): string[] {
        const model = Prisma.dmmf.datamodel.models.find(m => m.name === modelName);
        if (!model) return [];
        return model.fields.map(f => f.name);
    }

    /**
     * Case-insensitive field name lookup against a list of valid DMMF field names.
     * Returns the correctly-cased name, or the original if not found.
     */
    private static normalizeFieldName(fieldName: string, modelFields: string[]): string {
        if (modelFields.length === 0) return fieldName;
        const lower = fieldName.toLowerCase();
        for (const field of modelFields) {
            if (field.toLowerCase() === lower) return field;
        }
        return fieldName;
    }

    /**
     * Traverse the DMMF model graph to resolve the scalar type for a (possibly
     * dot-notation) field path.
     *
     * @example
     * getFieldTypeForPath('UserEnrolment', 'user.firstName') // → 'String'
     * getFieldTypeForPath('UserEnrolment', 'user')           // → undefined (relation)
     *
     * @param rootModelName - Starting Prisma model name
     * @param dotKey - Field path (e.g. `'firstName'` or `'user.firstName'`)
     * @returns Prisma scalar type string, or `undefined` if unresolvable or a relation
     */
    private static getFieldTypeForPath(
        rootModelName: string,
        dotKey: string
    ): string | undefined {
        const parts = dotKey.split('.');
        let currentModelName = rootModelName;

        for (let i = 0; i < parts.length; i++) {
            const model = Prisma.dmmf.datamodel.models.find(m => m.name === currentModelName);
            if (!model) return undefined;

            const field = model.fields.find(f => f.name === parts[i]);
            if (!field) return undefined;

            if (i === parts.length - 1) {
                // Leaf: return scalar type; return undefined for relations so that
                // convertValueType is skipped and FilterMiddleware's output is trusted.
                if (field.kind === 'object') return undefined;
                return field.type;
            }

            // Intermediate: must be a relation
            if (field.kind !== 'object') return undefined;
            currentModelName = field.type;
        }

        return undefined;
    }

    /**
     * Recursively normalise all keys in an object using DMMF field names.
     * Does NOT coerce leaf values — type coercion is done separately via `convertValueType`.
     */
    private static normalizeObjectKeys(obj: any, modelFields: string[]): any {
        if (obj === null || obj === undefined || typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => this.normalizeObjectKeys(item, modelFields));
        }

        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const normalizedKey = this.normalizeFieldName(key, modelFields);
            result[normalizedKey] = this.normalizeObjectKeys(value, modelFields);
        }
        return result;
    }

    /**
     * Coerce a string value to the appropriate JS type using the Prisma field type as a hint.
     *
     * This path always runs with a known, non-`String` field type, so leading zeros
     * are coerced away (an `Int`/`Float` column can't store them). The only precision
     * concern is range:
     *
     * - `fieldType === 'String'` → returned as-is (no coercion)
     * - `fieldType === 'BigInt'` → native `BigInt` (preserves full precision)
     * - Integer patterns → `number`, falling back to the raw string past
     *   `Number.MAX_SAFE_INTEGER` so large IDs aren't silently rounded
     * - Float patterns → `number`
     * - `'true'` / `'false'` → `boolean`
     * - Objects / arrays → recursed
     */
    private static convertValueType(value: any, fieldType?: string): any {
        if (value === null || value === undefined) return value;

        if (typeof value === 'object' && !Array.isArray(value)) {
            const result: any = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = this.convertValueType(v, fieldType);
            }
            return result;
        }

        if (Array.isArray(value)) {
            return value.map(v => this.convertValueType(v, fieldType));
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (fieldType === 'String') return value;

            // BigInt columns: keep full precision with a native BigInt.
            if (fieldType === 'BigInt' && /^-?\d+$/.test(trimmed)) {
                return BigInt(trimmed);
            }

            // Integers: coerce, but fall back to the raw string past the safe-integer
            // range so large IDs aren't silently rounded.
            if (/^-?\d+$/.test(trimmed)) {
                const num = Number(trimmed);
                return Number.isSafeInteger(num) ? num : value;
            }

            if (/^-?\d+\.\d+$/.test(trimmed)) {
                const num = Number(trimmed);
                if (!isNaN(num)) return num;
            }

            if (trimmed.toLowerCase() === 'true') return true;
            if (trimmed.toLowerCase() === 'false') return false;
        }

        return value;
    }

    // ── Include builder ────────────────────────────────────────────────────────

    /**
     * Convert the parsed `relationsToInclude` structure into a Prisma `include` object.
     *
     * - `'*'` → all relation fields from DMMF (each set to `true`)
     * - `Array<{ rel: true | nested }>` → merged into a single flat object,
     *   with nested arrays converted to `{ include: { ... } }`
     */
    private static buildPrismaInclude(
        relationsToInclude: Array<{ [relation: string]: any }> | '*',
        modelName: string
    ): Record<string, any> | undefined {
        if (relationsToInclude === '*') {
            const model = Prisma.dmmf.datamodel.models.find(m => m.name === modelName);
            if (!model) return undefined;
            const result: Record<string, any> = {};
            for (const field of model.fields) {
                if (field.kind === 'object') result[field.name] = true;
            }
            return Object.keys(result).length > 0 ? result : undefined;
        }

        if (!Array.isArray(relationsToInclude) || relationsToInclude.length === 0) {
            return undefined;
        }

        const result: Record<string, any> = {};
        for (const item of relationsToInclude) {
            for (const [rel, value] of Object.entries(item)) {
                if (value === true || value === '*') {
                    result[rel] = true;
                } else if (Array.isArray(value)) {
                    result[rel] = { include: this.mergeIncludeArray(value) };
                } else if (typeof value === 'object' && value !== null) {
                    result[rel] = { include: value };
                } else {
                    result[rel] = true;
                }
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }

    private static mergeIncludeArray(arr: any[]): Record<string, any> {
        const result: Record<string, any> = {};
        for (const item of arr) {
            if (typeof item === 'object' && item !== null) {
                for (const [k, v] of Object.entries(item)) {
                    result[k] = (v === true || v === '*') ? true : v;
                }
            }
        }
        return result;
    }

    // ── List endpoint factory ──────────────────────────────────────────────────

    private static createListEndpoint(config: AutoReadConfig) {
        return async (req: RequestFilterable, res: Response, next: (err?: any) => void): Promise<void> => {
            try {
                const {
                    modelName,
                    findByFilter,
                    searchableFields = [],
                    basePathPrefix
                } = config;

                const modelFields = this.getPrismaModelFields(modelName);

                const filters = req.custom?.filter ?? {};
                const pagination = req.custom?.pagination;
                const relationsToInclude = req.custom?.include ?? [];
                const searchTerm = req.custom?.search;
                const likeFilters = req.custom?.likeFilters ?? [];

                // ── Build equality filters ─────────────────────────────────────────
                const regularFilters: Record<string, any> = {};
                const likeFilterKeys = new Set(likeFilters.map(f => f.key));

                for (const [key, value] of Object.entries(filters)) {
                    if (likeFilterKeys.has(key)) continue;

                    if (
                        Array.isArray(value) &&
                        value.some(
                            v =>
                                typeof v === 'object' &&
                                v !== null &&
                                ('EXACT' in v || 'LIKE' in v || 'STARTS_WITH' in v || 'ENDS_WITH' in v)
                        )
                    ) {
                        continue;
                    }

                    const fieldType = this.getFieldTypeForPath(modelName, key);
                    const convertedValue =
                        fieldType !== undefined ? this.convertValueType(value, fieldType) : value;

                    if (key.includes('.')) {
                        const actualValue =
                            typeof convertedValue === 'object' && convertedValue?.equals
                                ? convertedValue.equals
                                : convertedValue;
                        if (typeof actualValue === 'string' && actualValue.includes('%')) continue;

                        const parts = key.split('.');
                        let current = regularFilters;
                        for (let i = 0; i < parts.length - 1; i++) {
                            if (!current[parts[i]]) current[parts[i]] = {};
                            current = current[parts[i]];
                        }
                        current[parts[parts.length - 1]] = convertedValue;
                    } else {
                        regularFilters[key] = convertedValue;
                    }
                }

                const where = this.normalizeObjectKeys(regularFilters, modelFields);

                // ── Apply string filters (LIKE / STARTS_WITH / ENDS_WITH) ──────────
                for (const lf of likeFilters) {
                    const operator =
                        lf.mode === 'LIKE'        ? { contains: lf.value } :
                        lf.mode === 'STARTS_WITH' ? { startsWith: lf.value } :
                                                    { endsWith: lf.value };

                    if (lf.key.includes('.')) {
                        const parts = lf.key.split('.');
                        let current = where;
                        for (let i = 0; i < parts.length - 1; i++) {
                            if (!current[parts[i]]) current[parts[i]] = {};
                            current = current[parts[i]];
                        }
                        current[parts[parts.length - 1]] = operator;
                    } else {
                        where[lf.key] = operator;
                    }
                }

                // ── Apply full-text search as OR across searchableFields ───────────
                if (searchTerm && searchableFields.length > 0) {
                    where.OR = searchableFields.map(field => ({
                        [field]: { contains: searchTerm }
                    }));
                }

                // ── Build Prisma include ───────────────────────────────────────────
                const include = this.buildPrismaInclude(relationsToInclude, modelName);

                // ── Resolve pagination ─────────────────────────────────────────────
                const take = pagination?.take ?? config.defaultLimit ?? 10;
                const skip = pagination?.skip ?? 0;
                const orderBy = this.resolveOrderBy(
                    pagination,
                    req.query.sort !== undefined,
                    modelFields
                );

                // ── Call consumer's findByFilter ───────────────────────────────────
                const result = await findByFilter({ where, include, orderBy, take, skip });

                let data: any[];
                let totalCount: number;

                if (result && typeof result === 'object') {
                    if ('data' in result && Array.isArray((result as any).data)) {
                        data = (result as any).data;
                        totalCount =
                            (result as any).total ??
                            (result as any).count ??
                            data.length;
                    } else if (Array.isArray(result)) {
                        data = result;
                        totalCount = data.length;
                    } else {
                        data = [result];
                        totalCount = 1;
                    }
                } else {
                    data = Array.isArray(result) ? result : [result];
                    totalCount = data.length;
                }

                const cleanedData = data.map(item =>
                    this.removeCircularReferences(item, new Set(), [])
                );

                const response = PaginationMiddleware.createPaginatedResponse(
                    cleanedData,
                    totalCount,
                    req,
                    basePathPrefix
                );
                res.status(200).json(response);
            } catch (err) {
                next(err);
            }
        };
    }

    // ── Order-by resolution ────────────────────────────────────────────────────

    /**
     * Build a validated Prisma `orderBy` from pagination state.
     *
     * - An explicit `?sort=` field that doesn't exist on the model → `400 Bad Request`
     *   (instead of bubbling up as an opaque Prisma 500).
     * - The implicit default sort (`id`) is silently dropped when the model has no
     *   matching field, so Prisma falls back to its own default ordering.
     * - Field casing is normalised against the DMMF.
     *
     * @param sortProvided - Whether `?sort=` was actually present in the query string.
     */
    private static resolveOrderBy(
        pagination: PaginationData | undefined,
        sortProvided: boolean,
        modelFields: string[]
    ): Record<string, 'asc' | 'desc'> | undefined {
        if (!pagination) return undefined;

        const normalizedSort = this.normalizeFieldName(pagination.sort, modelFields);
        const sortExists =
            modelFields.length === 0 || modelFields.includes(normalizedSort);

        if (!sortExists) {
            if (sortProvided) {
                throw new BadRequest({
                    msg: `Invalid sort field '${pagination.sort}'. Available fields: ${modelFields.join(', ')}`
                });
            }
            // Default 'id' on a model without one → let Prisma decide ordering.
            return undefined;
        }

        return { [normalizedSort]: pagination.order };
    }

    // ── Circular reference cleanup ─────────────────────────────────────────────

    private static removeCircularReferences(
        obj: any,
        visited: Set<any> = new Set(),
        path: string[] = []
    ): any {
        if (obj === null || obj === undefined) return obj;

        // BigInt is not JSON-serializable: emit a number when it fits safely,
        // otherwise a string to preserve precision.
        if (typeof obj === 'bigint') {
            return obj >= BigInt(Number.MIN_SAFE_INTEGER) && obj <= BigInt(Number.MAX_SAFE_INTEGER)
                ? Number(obj)
                : obj.toString();
        }

        if (typeof obj !== 'object') return obj;

        if (
            obj instanceof Date ||
            obj instanceof RegExp ||
            obj instanceof Error
        ) {
            return obj;
        }

        // Prisma Decimal (Decimal.js)
        if (typeof obj.toNumber === 'function' && typeof obj.d !== 'undefined') {
            return obj.toNumber();
        }

        if (visited.has(obj)) return null;

        if (Array.isArray(obj)) {
            const newVisited = new Set(visited);
            newVisited.add(obj);
            return obj.map(item =>
                this.removeCircularReferences(item, newVisited, path)
            );
        }

        const newVisited = new Set(visited);
        newVisited.add(obj);
        const result: any = {};

        for (const [key, value] of Object.entries(obj)) {
            result[key] = this.removeCircularReferences(value, newVisited, [
                ...path,
                key
            ]);
        }
        return result;
    }
}
