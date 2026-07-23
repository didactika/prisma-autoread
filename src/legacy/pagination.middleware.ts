import { NextFunction, Response } from 'express';
import halson from 'halson';
import { obtainUrl } from '../utils/url.utils';
import { RequestFilterable } from '../types';

/**
 * Middleware that processes pagination query parameters and builds HAL paginated responses.
 */
export default class PaginationMiddleware {
    /**
     * Returns an Express middleware that reads `?page=`, `?limit=`, `?sort=`, `?order=`
     * and populates `req.custom.pagination`.
     *
     * @param defaultLimit - Page size when `?limit=` is not provided (default: 10)
     * @param maxLimit - Maximum accepted page size (default: 100)
     */
    public static processPagination(defaultLimit: number = 10, maxLimit: number = 100) {
        return (req: RequestFilterable, _res: Response, next: NextFunction) => {
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(
                maxLimit,
                Math.max(1, parseInt(req.query.limit as string) || defaultLimit)
            );
            const sort = (req.query.sort as string) || 'id';
            const order = (req.query.order as 'asc' | 'desc') || 'asc';

            req.custom ??= {};
            req.custom.pagination = {
                page,
                limit,
                skip: (page - 1) * limit,
                sort,
                order,
                take: limit,
                pageSize: limit
            };

            next();
        };
    }

    /**
     * Creates a HAL-format paginated response with `self`, `first`, `last`, `prev`, and `next` links.
     *
     * @param data - Page items
     * @param totalCount - Total record count (across all pages)
     * @param req - Express request (used to reconstruct the URL)
     * @param basePathPrefix - Optional path prefix for URL generation (e.g. `'/api/v1'`)
     */
    public static createPaginatedResponse(
        data: any[],
        totalCount: number,
        req: RequestFilterable,
        basePathPrefix?: string
    ): any {
        const pagination = req.custom?.pagination;
        if (!pagination) return { data };

        const { page, limit } = pagination;
        const totalPages = Math.ceil(totalCount / limit);
        const baseUrl = obtainUrl(req, basePathPrefix);

        const queryParams = { ...req.query };
        delete queryParams.page;
        delete queryParams.limit;

        const queryParts = this.serializeQueryParams(queryParams);
        const queryString = queryParts.join('&');
        const baseUrlWithQuery = queryString
            ? `${baseUrl}${req.path}?${queryString}&`
            : `${baseUrl}${req.path}?`;

        const response = halson({
            data,
            pagination: {
                page,
                limit,
                total: totalCount,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

        response.addLink('self', `${baseUrlWithQuery}page=${page}&limit=${limit}`);
        response.addLink('first', `${baseUrlWithQuery}page=1&limit=${limit}`);
        response.addLink('last', `${baseUrlWithQuery}page=${totalPages}&limit=${limit}`);

        if (page > 1) {
            response.addLink('prev', `${baseUrlWithQuery}page=${page - 1}&limit=${limit}`);
        }
        if (page < totalPages) {
            response.addLink('next', `${baseUrlWithQuery}page=${page + 1}&limit=${limit}`);
        }

        return response;
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private static serializeQueryParams(obj: any, prefix: string = ''): string[] {
        const params: string[] = [];

        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined || value === null) continue;

            const paramKey = prefix ? `${prefix}[${key}]` : key;

            if (typeof value === 'object' && !Array.isArray(value)) {
                params.push(...this.serializeQueryParams(value, paramKey));
            } else if (Array.isArray(value)) {
                value.forEach(item => {
                    params.push(
                        `${encodeURIComponent(paramKey)}=${encodeURIComponent(String(item))}`
                    );
                });
            } else {
                params.push(
                    `${encodeURIComponent(paramKey)}=${encodeURIComponent(String(value))}`
                );
            }
        }

        return params;
    }
}
