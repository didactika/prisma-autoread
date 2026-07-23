import { NextFunction, Response } from 'express';
import { BadRequest } from 'http-response-client/lib/errors/client';
import { RequestFilterable, LikeFilter, JsonFilter, CustomRequestData } from '../types';
import FilterValidator from './utils/filter-validator.util';
import FilterValueParser from './utils/filter-value-parser.util';
import IncludeParser from './utils/include-parser.util';
import NestedRelationProcessor from './utils/nested-relation-processor.util';
import JsonFilterProcessor from './utils/json-filter-processor.util';
import ConditionParser, { ParsedConditions } from './utils/condition-parser.util';

/**
 * Middleware for filtering and validating query parameters based on Prisma model schemas.
 *
 * Populates `req.custom.filter`, `req.custom.likeFilters`, `req.custom.include`,
 * `req.custom.search`, and `req.custom.nestedSearch`.
 */
export default class FilterMiddleware {
    private static readonly RESERVED_PARAMS = [
        'page', 'limit', 'sort', 'order',
        'include', 'search',
        'or', 'and',
    ];

    /**
     * Returns an Express middleware that processes all `?key=value` query params
     * and validates them against the Prisma DMMF schema for the given entity.
     *
     * @param entityName - Prisma model name (case-insensitive). When omitted, filters are
     *   accepted without schema validation (useful for custom endpoints).
     */
    public static processQueryFilters(entityName?: string) {
        return async (req: RequestFilterable, _res: Response, next: NextFunction) => {
            try {
                if (req.method !== 'GET') {
                    return next();
                }

                let modelInfo: any = null;
                if (entityName) {
                    modelInfo = await FilterValidator.getModelInfo(entityName);
                }

                const parsedFilter = FilterMiddleware.parseQueryParams(req.query, modelInfo);
                req.custom ??= {};
                req.custom.filter = parsedFilter.filters;
                req.custom.likeFilters = parsedFilter.likeFilters;
                req.custom.jsonFilters = parsedFilter.jsonFilters;
                req.custom.groups = [];

                if (req.query.search && typeof req.query.search === 'string') {
                    req.custom.search = req.query.search;
                }

                req.custom.include = [];
                req.custom.nestedSearch = {};

                for (const [key, value] of Object.entries(req.query)) {
                    if (
                        (key === 'or' || key === 'and') &&
                        value !== null &&
                        typeof value === 'object'
                    ) {
                        FilterMiddleware.processGroups(key, value, modelInfo, req.custom);
                        continue;
                    }

                    if (key === 'include') {
                        if (value === '*') {
                            req.custom.include = '*';
                        } else {
                            const parsed = IncludeParser.parse(value);
                            if (Array.isArray(req.custom.include)) {
                                if (Array.isArray(parsed)) {
                                    req.custom.include.push(...parsed);
                                } else if (parsed) {
                                    req.custom.include.push(parsed);
                                }
                            }
                        }
                    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        // Json column → treat the inner keys as a path inside the document,
                        // never as a relation to walk into.
                        if (modelInfo) {
                            const jsonName = FilterValidator.isJsonField(key, modelInfo);
                            if (jsonName) {
                                JsonFilterProcessor.process(jsonName, value, req.custom.jsonFilters!);
                                continue;
                            }
                        }

                        let relationName = key;
                        if (modelInfo) {
                            const normalizedRelation = FilterValidator.validateAndMapField(key, modelInfo, 'relation');
                            if (normalizedRelation) {
                                relationName = normalizedRelation;
                            }
                        }

                        const relationParams = value as Record<string, any>;
                        const hasIncludeOrSearch =
                            'include' in relationParams || 'search' in relationParams;

                        const hasNestedIncludeOrSearch = (obj: any): boolean => {
                            for (const [k, v] of Object.entries(obj)) {
                                if (k === 'include' || k === 'search') return true;
                                if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                                    if (hasNestedIncludeOrSearch(v)) return true;
                                }
                            }
                            return false;
                        };

                        // ── processNestedParams closure ────────────────────────────────────────
                        const processNestedParams = (
                            params: Record<string, any>,
                            pathPrefix: string = '',
                            currentModelInfo: any = null
                        ): Record<string, any> => {
                            const result: Record<string, any> = {};
                            const validModes = ['EXACT', 'LIKE', 'STARTS_WITH', 'ENDS_WITH'];

                            for (const [k, v] of Object.entries(params)) {
                                if (k === 'include' || k === 'search') continue;
                                if (validModes.includes(k.toUpperCase())) continue;

                                let normalizedKey = k;
                                let nextModelInfo = currentModelInfo;

                                if (currentModelInfo) {
                                    if (
                                        typeof v === 'object' &&
                                        v !== null &&
                                        !Array.isArray(v)
                                    ) {
                                        // Json column on the related model → JSON path filter.
                                        const jsonName = FilterValidator.isJsonField(k, currentModelInfo);
                                        if (jsonName) {
                                            const segs = [relationName];
                                            if (pathPrefix) segs.push(pathPrefix);
                                            segs.push(jsonName);
                                            JsonFilterProcessor.process(
                                                segs.join('.'), v, req.custom!.jsonFilters!
                                            );
                                            continue;
                                        }

                                        const objectKeys = Object.keys(v);
                                        const hasExplicitMode = objectKeys.some(mk =>
                                            validModes.includes(mk.toUpperCase())
                                        );

                                        if (hasExplicitMode) {
                                            const correctField = FilterValidator.validateAndMapField(
                                                k, currentModelInfo, 'field'
                                            );
                                            if (correctField) {
                                                normalizedKey = correctField;
                                                const currentPath = pathPrefix
                                                    ? `${pathPrefix}.${normalizedKey}`
                                                    : normalizedKey;
                                                const fullPath = `${relationName}.${currentPath}`;

                                                for (const [modeKey, modeValue] of Object.entries(v)) {
                                                    const upperMode = modeKey.toUpperCase();
                                                    if (validModes.includes(upperMode)) {
                                                        if (upperMode === 'EXACT') {
                                                            const modeFieldInfo =
                                                                currentModelInfo?.fields?.find(
                                                                    (f: any) => f.name === normalizedKey
                                                                );
                                                            result[normalizedKey] =
                                                                FilterValueParser.parseStringValue(
                                                                    modeValue, modeFieldInfo?.type
                                                                );
                                                        } else {
                                                            req.custom?.likeFilters?.push({
                                                                key: fullPath,
                                                                value: String(modeValue),
                                                                mode: upperMode as
                                                                    | 'LIKE'
                                                                    | 'STARTS_WITH'
                                                                    | 'ENDS_WITH',
                                                                grouping: 'and'
                                                            });
                                                        }
                                                    }
                                                }
                                                continue;
                                            }
                                        }

                                        const correctRelation = FilterValidator.validateAndMapField(
                                            k, currentModelInfo, 'relation'
                                        );
                                        if (correctRelation) {
                                            normalizedKey = correctRelation;
                                            const relationInfo = FilterValidator.getRelationModelInfo(
                                                correctRelation, currentModelInfo
                                            );
                                            nextModelInfo = relationInfo?.model || null;
                                        } else {
                                            const correctField = FilterValidator.validateAndMapField(
                                                k, currentModelInfo, 'field'
                                            );
                                            if (correctField) {
                                                throw new BadRequest({
                                                    msg: `Invalid filter: '${k}' is a field, not a relation. Cannot nest objects inside field filters. Available relations: ${FilterValidator.getAvailableRelations(currentModelInfo)}`
                                                });
                                            } else {
                                                throw new BadRequest({
                                                    msg: `Invalid filter: '${k}' not found. Available fields: ${FilterValidator.getAvailableFields(currentModelInfo)}. Available relations: ${FilterValidator.getAvailableRelations(currentModelInfo)}`
                                                });
                                            }
                                        }
                                    } else {
                                        const correctField = FilterValidator.validateAndMapField(
                                            k, currentModelInfo, 'field'
                                        );
                                        if (!correctField) {
                                            throw new BadRequest({
                                                msg: `Invalid filter: field '${k}' not found. Available fields: ${FilterValidator.getAvailableFields(currentModelInfo)}. Available relations: ${FilterValidator.getAvailableRelations(currentModelInfo)}`
                                            });
                                        }
                                        normalizedKey = correctField;
                                    }
                                }

                                const currentPath = pathPrefix
                                    ? `${pathPrefix}.${normalizedKey}`
                                    : normalizedKey;

                                if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                                    const nested = processNestedParams(v, currentPath, nextModelInfo);
                                    if (Object.keys(nested).length > 0) {
                                        result[normalizedKey] = nested;
                                    }
                                } else {
                                    const fieldInfo = currentModelInfo?.fields?.find(
                                        (f: any) => f.name === normalizedKey
                                    );
                                    result[normalizedKey] = FilterValueParser.parseStringValue(
                                        v, fieldInfo?.type
                                    );
                                }
                            }

                            return result;
                        };
                        // ── end closure ────────────────────────────────────────────────────────

                        let relationModelInfo = null;
                        if (modelInfo) {
                            const relationInfo = FilterValidator.getRelationModelInfo(
                                relationName, modelInfo
                            );
                            relationModelInfo = relationInfo?.model || null;
                        }

                        const filterParams = processNestedParams(
                            relationParams, '', relationModelInfo
                        );

                        if (hasIncludeOrSearch || hasNestedIncludeOrSearch(relationParams)) {
                            if (req.custom.include !== '*') {
                                FilterMiddleware.processNestedIncludes(
                                    req.custom.include as Array<any>,
                                    relationName,
                                    relationParams,
                                    req.custom.nestedSearch!
                                );
                            }
                        }

                        if (Object.keys(filterParams).length > 0) {
                            req.custom.filter![key] = filterParams;
                        }
                    } else if (key.includes('[') && !key.includes('=')) {
                        const parts = key.split(/[[\]]/g).filter(Boolean);

                        if (parts.length === 2 && parts[1] === 'search') {
                            if (typeof value === 'string') {
                                req.custom.nestedSearch![parts[0]] = value;
                            }
                        } else if (parts.length === 2 && parts[1] === 'include') {
                            if (req.custom.include === '*') continue;

                            const relName = parts[0];
                            const includeValue = value;
                            const existing = (req.custom.include as Array<any>).find(
                                (item: any) => Object.hasOwn(item, relName)
                            );

                            if (includeValue === '*') {
                                if (existing) {
                                    existing[relName] = '*';
                                } else {
                                    (req.custom.include as Array<any>).push({ [relName]: '*' });
                                }
                            } else if (typeof includeValue === 'string') {
                                const childRelations = includeValue
                                    .split(',')
                                    .map(r => r.trim())
                                    .filter(Boolean);
                                const childInclude = childRelations.map(rel => ({ [rel]: true }));

                                if (existing) {
                                    if (existing[relName] === '*') {
                                        // keep wildcard
                                    } else if (existing[relName] === true) {
                                        existing[relName] = childInclude;
                                    } else if (Array.isArray(existing[relName])) {
                                        existing[relName].push(...childInclude);
                                    } else {
                                        existing[relName] = childInclude;
                                    }
                                } else {
                                    (req.custom.include as Array<any>).push({ [relName]: childInclude });
                                }
                            }
                        } else if (parts.length >= 2) {
                            if (req.custom.include === '*') continue;

                            const currentPath = parts[0];
                            let nestedInclude: any = value === '*' ? '*' : true;
                            for (let i = parts.length - 1; i >= 1; i--) {
                                nestedInclude = { [parts[i]]: nestedInclude };
                            }

                            const existing = (req.custom.include as Array<any>).find(
                                (item: any) => Object.hasOwn(item, currentPath)
                            );
                            if (existing) {
                                if (existing[currentPath] === '*') {
                                    // keep wildcard
                                } else if (
                                    typeof existing[currentPath] === 'object' &&
                                    existing[currentPath] !== null
                                ) {
                                    FilterMiddleware.mergeIncludes(existing[currentPath], nestedInclude);
                                } else {
                                    existing[currentPath] = nestedInclude;
                                }
                            } else {
                                (req.custom.include as Array<any>).push({ [currentPath]: nestedInclude });
                            }
                        }
                    }
                }

                next();
            } catch (err) {
                next(err);
            }
        };
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private static mergeIncludes(target: any, source: any): void {
        for (const [key, value] of Object.entries(source)) {
            if (value === '*') {
                target[key] = '*';
            } else if (typeof value === 'object' && value !== null) {
                if (!target[key]) target[key] = {};
                if (target[key] !== '*' && typeof target[key] === 'object') {
                    FilterMiddleware.mergeIncludes(target[key], value);
                }
            } else {
                target[key] = value;
            }
        }
    }

    private static processNestedIncludes(
        includeArray: Array<any>,
        relationName: string,
        relationParams: Record<string, any>,
        nestedSearch: Record<string, string>
    ): void {
        const existing = includeArray.find(
            (item: any) => Object.hasOwn(item, relationName)
        );

        if ('include' in relationParams) {
            const includeValue = relationParams.include;

            if (includeValue === '*') {
                if (existing) {
                    existing[relationName] = '*';
                } else {
                    includeArray.push({ [relationName]: '*' });
                }
            } else if (typeof includeValue === 'string') {
                const childRelations = includeValue
                    .split(',')
                    .map(r => r.trim())
                    .filter(Boolean);
                const childInclude = childRelations.map(rel => ({ [rel]: true }));

                if (existing) {
                    if (existing[relationName] === '*') {
                        // keep wildcard
                    } else if (existing[relationName] === true) {
                        existing[relationName] = childInclude;
                    } else if (Array.isArray(existing[relationName])) {
                        existing[relationName].push(...childInclude);
                    } else {
                        existing[relationName] = childInclude;
                    }
                } else {
                    includeArray.push({ [relationName]: childInclude });
                }
            }
        }

        if ('search' in relationParams && typeof relationParams.search === 'string') {
            nestedSearch[relationName] = relationParams.search;
        }

        for (const [nestedKey, nestedValue] of Object.entries(relationParams)) {
            if (nestedKey === 'include' || nestedKey === 'search') continue;

            if (
                typeof nestedValue === 'object' &&
                nestedValue !== null &&
                !Array.isArray(nestedValue)
            ) {
                const hasDeepInclude = (obj: any): boolean => {
                    for (const [k, v] of Object.entries(obj)) {
                        if (k === 'include' || k === 'search') return true;
                        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                            if (hasDeepInclude(v)) return true;
                        }
                    }
                    return false;
                };

                if (!hasDeepInclude(nestedValue as any)) continue;

                if (!existing) includeArray.push({ [relationName]: [] });

                const parentInclude = includeArray.find(
                    (item: any) => Object.hasOwn(item, relationName)
                );

                if (parentInclude && parentInclude[relationName] !== '*') {
                    if (!Array.isArray(parentInclude[relationName])) {
                        parentInclude[relationName] =
                            parentInclude[relationName] === true
                                ? []
                                : [parentInclude[relationName]];
                    }

                    FilterMiddleware.processNestedIncludes(
                        parentInclude[relationName],
                        nestedKey,
                        nestedValue as Record<string, any>,
                        nestedSearch
                    );
                }
            }
        }
    }

    private static parseQueryParams(
        query: any,
        modelInfo?: any
    ): { filters: Record<string, any>; likeFilters: LikeFilter[]; jsonFilters: JsonFilter[] } {
        const filters: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];
        const jsonFilters: JsonFilter[] = [];

        for (const [key, value] of Object.entries(query)) {
            if (
                value === undefined ||
                value === null ||
                FilterMiddleware.RESERVED_PARAMS.includes(key)
            ) {
                continue;
            }

            if (key.includes('[include]') || key.includes('[search]')) continue;

            if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                // Json columns are handled in the main loop as JSON path filters.
                if (modelInfo && FilterValidator.isJsonField(key, modelInfo)) continue;

                const validModes = ['EXACT', 'LIKE', 'STARTS_WITH', 'ENDS_WITH'];
                const objectKeys = Object.keys(value);
                const hasExplicitMode = objectKeys.some(k =>
                    validModes.includes(k.toUpperCase())
                );

                if (hasExplicitMode && modelInfo) {
                    const correctFieldName = FilterValidator.validateAndMapField(
                        key, modelInfo, 'field'
                    );
                    if (correctFieldName) {
                        for (const [modeKey, modeValue] of Object.entries(
                            value as Record<string, any>
                        )) {
                            const upperMode = modeKey.toUpperCase();
                            if (validModes.includes(upperMode)) {
                                if (upperMode === 'EXACT') {
                                    const fieldInfo = modelInfo?.fields?.find(
                                        (f: any) => f.name === correctFieldName
                                    );
                                    filters[correctFieldName] = FilterValueParser.parseStringValue(
                                        modeValue, fieldInfo?.type
                                    );
                                } else {
                                    likeFilters.push({
                                        key: correctFieldName,
                                        value: String(modeValue),
                                        mode: upperMode as 'LIKE' | 'STARTS_WITH' | 'ENDS_WITH',
                                        grouping: 'and'
                                    });
                                }
                            }
                        }
                        continue;
                    }
                }
                continue;
            }

            const parts = key.match(/\w+/g);
            if (parts && parts.length > 1) {
                NestedRelationProcessor.processString(key, value, modelInfo, filters, likeFilters, jsonFilters);
            } else {
                FilterMiddleware.processSimpleField(key, value, modelInfo, filters, likeFilters);
            }
        }

        return { filters, likeFilters, jsonFilters };
    }

    /**
     * Parse an `?or[...]` / `?and[...]` param into one or more {@link FilterGroup}s.
     *
     * Syntax: `or[<group>][<field>]=<value>` — each `<group>` becomes an independent
     * group whose conditions are combined with the keyword's operator; different
     * groups (and the default filters) are always AND-combined.
     *
     * @example
     * // ?or[g1][firstName]=Alice&or[g1][lastName]=Jones
     * // → groups: [{ type: 'or', name: 'g1', filters: { firstName: 'Alice', lastName: 'Jones' }, ... }]
     */
    private static processGroups(
        keyword: 'or' | 'and',
        value: any,
        modelInfo: any,
        custom: CustomRequestData
    ): void {
        for (const [groupName, conditions] of Object.entries(value as Record<string, any>)) {
            if (conditions === null || conditions === undefined) continue;

            if (typeof conditions !== 'object' || Array.isArray(conditions)) {
                throw new BadRequest({
                    msg: `Invalid '${keyword}' group '${groupName}': expected nested conditions, e.g. ${keyword}[${groupName}][field]=value`
                });
            }

            const parsed: ParsedConditions = { filters: {}, likeFilters: [], jsonFilters: [] };
            ConditionParser.parse(conditions as Record<string, any>, modelInfo, parsed);

            // Tag the group's LIKE filters with their combining operator (informational).
            for (const lf of parsed.likeFilters) lf.grouping = keyword;

            const isEmpty =
                Object.keys(parsed.filters).length === 0 &&
                parsed.likeFilters.length === 0 &&
                parsed.jsonFilters.length === 0;
            if (isEmpty) continue;

            custom.groups!.push({ type: keyword, name: String(groupName), ...parsed });
        }
    }

    private static processSimpleField(
        key: string,
        value: any,
        modelInfo: any,
        filter: Record<string, any>,
        _likeFilters: LikeFilter[]
    ): void {
        if (!modelInfo) {
            filter[key] = FilterValueParser.parseStringValue(value);
            return;
        }

        const correctFieldName = FilterValidator.validateAndMapField(key, modelInfo, 'field');
        if (!correctFieldName) {
            throw new BadRequest({
                msg: `Invalid filter: field '${key}' not found. Available fields: ${FilterValidator.getAvailableFields(modelInfo)}`
            });
        }

        const fieldInfo = modelInfo?.fields?.find((f: any) => f.name === correctFieldName);
        filter[correctFieldName] = FilterValueParser.parseStringValue(value, fieldInfo?.type);
    }
}
