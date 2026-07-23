import { BadRequest } from 'http-response-client/lib/errors/client';
import { LikeFilter, JsonFilter, LikeFilterMode } from '../../types';
import FilterValidator from './filter-validator.util';
import FilterValueParser from './filter-value-parser.util';
import JsonFilterProcessor from './json-filter-processor.util';

const MODES: LikeFilterMode[] = ['EXACT', 'LIKE', 'STARTS_WITH', 'ENDS_WITH'];

/** Accumulator for parsed conditions (shared across recursion levels). */
export interface ParsedConditions {
    /** Equality conditions keyed by dot-notation path (e.g. `{ 'campus.uuid': 'A' }`). */
    filters: Record<string, any>;
    /** String-operator conditions (`LIKE` / `STARTS_WITH` / `ENDS_WITH`). */
    likeFilters: LikeFilter[];
    /** Conditions targeting values inside `Json` columns. */
    jsonFilters: JsonFilter[];
}

/**
 * Parses an object of filter conditions (Express/qs bracket notation, already
 * turned into nested objects) at a given model level.
 *
 * It understands the exact same syntax as top-level filters — scalar equality,
 * nested relations, per-field string operators, and `Json` columns — and is used
 * to parse the contents of an `or[…]` / `and[…]` group so that groups support the
 * full filter grammar.
 *
 * @example
 * // or[g1][firstName]=Alice&or[g1][campus][uuid]=A&or[g1][bio][LIKE]=dev
 * ConditionParser.parse(
 *   { firstName: 'Alice', campus: { uuid: 'A' }, bio: { LIKE: 'dev' } },
 *   userModel,
 *   out,
 * );
 */
export default class ConditionParser {
    /**
     * @param conditions - Nested condition object at the current level
     * @param modelInfo  - DMMF model info for the current level (`null` in schema-less mode)
     * @param out        - Accumulator to populate
     * @param prefix     - Accumulated dot-notation prefix (used in recursion)
     */
    static parse(
        conditions: Record<string, any>,
        modelInfo: any,
        out: ParsedConditions,
        prefix = ''
    ): void {
        for (const [rawKey, value] of Object.entries(conditions)) {
            if (rawKey === 'include' || rawKey === 'search') continue;
            if (MODES.includes(rawKey.toUpperCase() as LikeFilterMode)) continue;

            const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);

            // ── Json column → treat inner keys as a JSON path ──────────────────
            const jsonName = modelInfo ? FilterValidator.isJsonField(rawKey, modelInfo) : null;
            if (jsonName && isObject) {
                const field = prefix ? `${prefix}.${jsonName}` : jsonName;
                JsonFilterProcessor.process(field, value, out.jsonFilters);
                continue;
            }

            if (isObject) {
                const hasExplicitMode = Object.keys(value).some(
                    k => MODES.includes(k.toUpperCase() as LikeFilterMode)
                );

                // ── Scalar field with explicit operator(s): field[LIKE]=… ──────
                if (hasExplicitMode) {
                    const fieldName = modelInfo
                        ? FilterValidator.validateAndMapField(rawKey, modelInfo, 'field')
                        : rawKey;
                    if (!fieldName) {
                        throw new BadRequest({
                            msg: `Invalid filter: field '${rawKey}' not found. Available fields: ${FilterValidator.getAvailableFields(modelInfo)}. Available relations: ${FilterValidator.getAvailableRelations(modelInfo)}`
                        });
                    }
                    const dotKey = prefix ? `${prefix}.${fieldName}` : fieldName;
                    const fieldType = modelInfo?.fields?.find((f: any) => f.name === fieldName)?.type;
                    ConditionParser.applyModes(dotKey, value as Record<string, any>, fieldType, out);
                    continue;
                }

                // ── Nested relation → recurse ──────────────────────────────────
                const relationName = modelInfo
                    ? FilterValidator.validateAndMapField(rawKey, modelInfo, 'relation')
                    : rawKey;
                if (relationName) {
                    const relationInfo = modelInfo
                        ? FilterValidator.getRelationModelInfo(relationName, modelInfo)
                        : null;
                    const nextPrefix = prefix ? `${prefix}.${relationName}` : relationName;
                    ConditionParser.parse(value as Record<string, any>, relationInfo?.model ?? null, out, nextPrefix);
                    continue;
                }

                // modelInfo known but the key is neither field-with-mode, Json, nor relation.
                if (modelInfo) {
                    if (FilterValidator.validateAndMapField(rawKey, modelInfo, 'field')) {
                        throw new BadRequest({
                            msg: `Invalid filter: '${rawKey}' is a field, not a relation. Cannot nest objects inside field filters. Available relations: ${FilterValidator.getAvailableRelations(modelInfo)}`
                        });
                    }
                    throw new BadRequest({
                        msg: `Invalid filter: '${rawKey}' not found. Available fields: ${FilterValidator.getAvailableFields(modelInfo)}. Available relations: ${FilterValidator.getAvailableRelations(modelInfo)}`
                    });
                }

                // Schema-less mode: recurse without validation.
                ConditionParser.parse(
                    value as Record<string, any>,
                    null,
                    out,
                    prefix ? `${prefix}.${rawKey}` : rawKey
                );
                continue;
            }

            // ── Scalar equality ────────────────────────────────────────────────
            const fieldName = modelInfo
                ? FilterValidator.validateAndMapField(rawKey, modelInfo, 'field')
                : rawKey;
            if (modelInfo && !fieldName) {
                throw new BadRequest({
                    msg: `Invalid filter: field '${rawKey}' not found. Available fields: ${FilterValidator.getAvailableFields(modelInfo)}. Available relations: ${FilterValidator.getAvailableRelations(modelInfo)}`
                });
            }
            const finalName = fieldName || rawKey;
            const dotKey = prefix ? `${prefix}.${finalName}` : finalName;
            const fieldType = modelInfo?.fields?.find((f: any) => f.name === finalName)?.type;
            out.filters[dotKey] = FilterValueParser.parseStringValue(value, fieldType);
        }
    }

    /** Push each explicit-mode entry of a field object into the right bucket. */
    private static applyModes(
        dotKey: string,
        value: Record<string, any>,
        fieldType: string | undefined,
        out: ParsedConditions
    ): void {
        for (const [modeKey, modeValue] of Object.entries(value)) {
            const upper = modeKey.toUpperCase() as LikeFilterMode;
            if (!MODES.includes(upper)) continue;

            if (upper === 'EXACT') {
                out.filters[dotKey] = FilterValueParser.parseStringValue(modeValue, fieldType);
            } else {
                out.likeFilters.push({
                    key: dotKey,
                    value: String(modeValue),
                    mode: upper,
                });
            }
        }
    }
}
