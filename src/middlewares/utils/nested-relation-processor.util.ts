import { BadRequest } from 'http-response-client/lib/errors/client';
import { LikeFilter } from '../../types';
import FilterValidator from './filter-validator.util';
import FilterValueParser from './filter-value-parser.util';

/**
 * Utility class for processing nested relation filter parameters.
 *
 * Handles two input forms:
 * - **String / bracket notation**: `campus[uuid][STARTS_WITH]=A`
 * - **Object notation**: `{ campus: { uuid: 'A' } }` (after qs-parsing)
 *
 * Both produce dot-notation keys (`campus.uuid`) in the filter or likeFilters arrays.
 */
export default class NestedRelationProcessor {
    /**
     * Process a bracket-notation key from the query string.
     *
     * @example
     * // ?campus[uuid][STARTS_WITH]=A
     * processString('campus[uuid][STARTS_WITH]', 'A', modelInfo, filter, likeFilters)
     * // → likeFilters.push({ key: 'campus.uuid', value: 'A', mode: 'STARTS_WITH' })
     *
     * @param key - Raw query key with bracket notation (e.g. `campus[uuid][STARTS_WITH]`)
     * @param value - Raw query value
     * @param modelInfo - DMMF model info for the root entity
     * @param filter - Target filter object for EXACT matches
     * @param likeFilters - Array to accumulate LIKE/STARTS_WITH/ENDS_WITH entries
     */
    static processString(
        key: string,
        value: any,
        modelInfo: any,
        filter: Record<string, any>,
        likeFilters: LikeFilter[]
    ): void {
        const parts = key.match(/\w+/g);
        if (!parts || parts.length < 2) return;

        const validModes = ['EXACT', 'LIKE', 'STARTS_WITH', 'ENDS_WITH'];
        const lastPart = parts[parts.length - 1];
        const hasExplicitMode = validModes.includes(lastPart.toUpperCase());

        let explicitMode: 'EXACT' | 'LIKE' | 'STARTS_WITH' | 'ENDS_WITH' | null = null;
        let fieldParts: string[] = parts;

        if (hasExplicitMode) {
            explicitMode = lastPart.toUpperCase() as 'EXACT' | 'LIKE' | 'STARTS_WITH' | 'ENDS_WITH';
            fieldParts = parts.slice(0, -1);
        }

        let currentModelInfo = modelInfo;
        const relationPath: string[] = [];

        for (let i = 0; i < fieldParts.length; i++) {
            const partName = fieldParts[i];
            const isLastPart = i === fieldParts.length - 1;

            if (isLastPart) {
                const correctFieldName = FilterValidator.validateAndMapField(partName, currentModelInfo, 'field');
                if (!correctFieldName) {
                    throw new BadRequest({
                        msg: `Invalid filter: field '${partName}' not found. Available fields: ${FilterValidator.getAvailableFields(currentModelInfo)}. Available relations: ${FilterValidator.getAvailableRelations(currentModelInfo)}`
                    });
                }

                relationPath.push(correctFieldName);
                const dotNotationKey = relationPath.join('.');
                const fieldInfo = currentModelInfo?.fields?.find((f: any) => f.name === correctFieldName);

                if (explicitMode) {
                    if (explicitMode === 'EXACT') {
                        filter[dotNotationKey] = FilterValueParser.parseStringValue(value, fieldInfo?.type);
                    } else {
                        likeFilters.push({
                            key: dotNotationKey,
                            value: String(value),
                            mode: explicitMode,
                            grouping: 'and'
                        });
                    }
                } else {
                    filter[dotNotationKey] = FilterValueParser.parseStringValue(value, fieldInfo?.type);
                }
            } else {
                const correctRelationName = FilterValidator.validateAndMapField(partName, currentModelInfo, 'relation');
                if (!correctRelationName) {
                    throw new BadRequest({
                        msg: `Invalid filter: relation '${partName}' not found at this level. Available relations: ${FilterValidator.getAvailableRelations(currentModelInfo)}`
                    });
                }

                const relationInfo = FilterValidator.getRelationModelInfo(correctRelationName, currentModelInfo);
                if (!relationInfo) {
                    throw new BadRequest({
                        msg: `Invalid filter: could not get model information for relation '${partName}'`
                    });
                }

                relationPath.push(correctRelationName);
                currentModelInfo = relationInfo.model;
            }
        }
    }

    /**
     * Process an object-notation relation entry into dot-notation filter keys.
     *
     * @param key - Root relation name
     * @param value - Nested filter object (e.g. `{ uuid: 'ABC', name: { STARTS_WITH: 'A' } }`)
     * @param modelInfo - DMMF model info for the root entity
     * @param filter - Target filter object
     * @param likeFilters - Array to accumulate LIKE/STARTS_WITH/ENDS_WITH entries
     * @param prefix - Accumulated dot-notation prefix (used in recursion)
     */
    static processObject(
        key: string,
        value: any,
        modelInfo: any,
        filter: Record<string, any>,
        likeFilters: LikeFilter[],
        prefix: string = ''
    ): void {
        const correctRelationName = FilterValidator.validateAndMapField(key, modelInfo, 'relation');
        if (!correctRelationName) {
            throw new BadRequest({
                msg: `Invalid filter: relation '${key}' not found. Available relations: ${FilterValidator.getAvailableRelations(modelInfo)}`
            });
        }

        const relationInfo = FilterValidator.getRelationModelInfo(correctRelationName, modelInfo);
        if (!relationInfo) {
            throw new BadRequest({
                msg: `Invalid filter: could not get model information for relation '${key}'`
            });
        }

        const currentPath = prefix ? `${prefix}.${correctRelationName}` : correctRelationName;
        NestedRelationProcessor.processRecursive(value, relationInfo.model, filter, likeFilters, currentPath);
    }

    /**
     * Recursively traverse a nested filter object and produce dot-notation keys.
     *
     * @param obj - Nested filter object at the current level
     * @param modelInfo - DMMF model info for the model at this level
     * @param targetFilter - Target filter object (shared across recursion levels)
     * @param likeFilters - Array to accumulate LIKE/STARTS_WITH/ENDS_WITH entries
     * @param prefix - Accumulated dot-notation prefix
     */
    static processRecursive(
        obj: any,
        modelInfo: any,
        targetFilter: Record<string, any>,
        likeFilters: LikeFilter[],
        prefix: string = ''
    ): void {
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'include' || key === 'search') continue;

            const validModes = ['EXACT', 'LIKE', 'STARTS_WITH', 'ENDS_WITH'];
            if (validModes.includes(key.toUpperCase())) continue;

            const isObject = typeof value === 'object' && !Array.isArray(value) && value !== null;

            if (isObject) {
                const objectKeys = Object.keys(value);
                const hasExplicitMode = objectKeys.some(k => validModes.includes(k.toUpperCase()));

                if (hasExplicitMode) {
                    const correctFieldName = FilterValidator.validateAndMapField(key, modelInfo, 'field');
                    if (!correctFieldName) {
                        throw new BadRequest({
                            msg: `Invalid filter: field '${key}' not found. Available fields: ${FilterValidator.getAvailableFields(modelInfo)}. Available relations: ${FilterValidator.getAvailableRelations(modelInfo)}`
                        });
                    }

                    const dotNotationKey = prefix ? `${prefix}.${correctFieldName}` : correctFieldName;
                    const fieldInfo = modelInfo?.fields?.find((f: any) => f.name === correctFieldName);

                    for (const [modeKey, modeValue] of Object.entries(value as Record<string, any>)) {
                        const upperMode = modeKey.toUpperCase();
                        if (validModes.includes(upperMode)) {
                            if (upperMode === 'EXACT') {
                                targetFilter[dotNotationKey] = FilterValueParser.parseStringValue(modeValue, fieldInfo?.type);
                            } else {
                                likeFilters.push({
                                    key: dotNotationKey,
                                    value: String(modeValue),
                                    mode: upperMode as 'LIKE' | 'STARTS_WITH' | 'ENDS_WITH',
                                    grouping: 'and'
                                });
                            }
                        }
                    }
                    continue;
                }

                const correctRelationName = FilterValidator.validateAndMapField(key, modelInfo, 'relation');
                if (correctRelationName) {
                    const relationInfo = FilterValidator.getRelationModelInfo(correctRelationName, modelInfo);
                    if (!relationInfo) {
                        throw new BadRequest({
                            msg: `Invalid filter: could not get model information for relation '${key}'`
                        });
                    }

                    const currentPath = prefix ? `${prefix}.${correctRelationName}` : correctRelationName;
                    NestedRelationProcessor.processRecursive(
                        value,
                        relationInfo.model,
                        targetFilter,
                        likeFilters,
                        currentPath
                    );
                    continue;
                }
            }

            const correctFieldName = FilterValidator.validateAndMapField(key, modelInfo, 'field');
            if (!correctFieldName) {
                throw new BadRequest({
                    msg: `Invalid filter: '${key}' not found. Available fields: ${FilterValidator.getAvailableFields(modelInfo)}. Available relations: ${FilterValidator.getAvailableRelations(modelInfo)}`
                });
            }

            const dotNotationKey = prefix ? `${prefix}.${correctFieldName}` : correctFieldName;
            const fieldInfo = modelInfo?.fields?.find((f: any) => f.name === correctFieldName);
            targetFilter[dotNotationKey] = FilterValueParser.parseStringValue(value, fieldInfo?.type);
        }
    }
}
