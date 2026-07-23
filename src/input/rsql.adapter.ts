import { QueryBuilder } from '../core/query-builder';
import { QueryControlsParser } from './query-controls';
import { RsqlParser } from './parsers/rsql-parser';
import type { InputAdapter, AdapterContext } from '../types/adapters';
import type { RequestInput, RawSpec, QuerySpec } from '../types/query';
import type { KeywordMap } from '../types/keywords';

/**
 * RSQL / FIQL adapter (GET). The filter is a compact string:
 *
 * ```
 * ?filter=age=ge=30;name==Al*            → age >= 30 AND name startsWith 'Al'
 * ?filter=active==true,age=lt=18         → active = true OR age < 18
 * ?filter=role=in=(admin,editor)         → role in [admin, editor]
 * ```
 */
export class RsqlAdapter implements InputAdapter {
    readonly name = 'rsql';

    supports(input: RequestInput, keywords: KeywordMap): boolean {
        return input.method === 'GET' && typeof input.query?.[keywords.filter] === 'string';
    }

    parse(input: RequestInput, ctx: AdapterContext): QuerySpec {
        const query = input.query ?? {};
        const raw: RawSpec = new QueryControlsParser(ctx.keywords).parse(query);

        const expression = String(query[ctx.keywords.filter]).trim();
        if (expression) raw.where = RsqlParser.parse(expression);

        return QueryBuilder.build(raw, ctx.model as any, ctx.build);
    }
}
