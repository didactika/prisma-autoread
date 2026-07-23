import { QueryBuilder } from '../core/query-builder';
import { QueryControlsParser } from './query-controls';
import type { InputAdapter, AdapterContext } from '../types/adapters';
import type { RequestInput, RawSpec, QuerySpec } from '../types/query';
import type { KeywordMap } from '../types/keywords';

/**
 * GET query-string adapter (Prisma dialect). The filter lives in one deep-object
 * parameter and mirrors Prisma's `where`:
 *
 * ```
 * ?filter[age][gte]=30&filter[or][0][active]=true
 * &sort=-createdAt,lastName&fields=id,name&include=posts[comments]&page=2&limit=20
 * ```
 */
export class QueryBracketsAdapter implements InputAdapter {
    readonly name = 'query';

    /** Catch-all for GET, except when the filter is a string (that's RSQL's job). */
    supports(input: RequestInput, keywords: KeywordMap): boolean {
        return input.method === 'GET' && typeof input.query?.[keywords.filter] !== 'string';
    }

    parse(input: RequestInput, ctx: AdapterContext): QuerySpec {
        const query = input.query ?? {};
        const raw: RawSpec = new QueryControlsParser(ctx.keywords).parse(query);

        const filter = query[ctx.keywords.filter];
        if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
            raw.where = filter as Record<string, any>;
        }

        return QueryBuilder.build(raw, ctx.model as any, ctx.build);
    }
}
