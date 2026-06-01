import { RequestFilterable } from '../types';

/**
 * Builds the base URL for HATEOAS pagination links.
 *
 * @param req - The current Express request
 * @param basePathPrefix - Optional prefix (e.g. '/api/v1') inserted before `req.baseUrl`
 */
export function obtainUrl(req: RequestFilterable, basePathPrefix?: string): string {
    const prefix = basePathPrefix ?? '';
    return `${req.protocol}://${req.headers.host}${prefix}${req.baseUrl}`;
}
