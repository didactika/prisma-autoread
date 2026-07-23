import { QueryBuilder } from '../core/query-builder';
import { QueryControlsParser } from './query-controls';
import { ODataParser } from './parsers/odata-parser';
import type { InputAdapter, AdapterContext } from '../types/adapters';
import type { RequestInput, RawSpec, QuerySpec, SortDir } from '../types/query';

/**
 * OData v4 adapter (GET), a common subset:
 *
 * ```
 * ?$filter=age gt 30 and startswith(name,'Al')
 * ?$orderby=age desc,name&$select=id,name&$top=20&$skip=40
 * ```
 *
 * OData uses its own `$`-prefixed parameters, so it is unaffected by keyword renaming.
 */
export class ODataAdapter implements InputAdapter {
    readonly name = 'odata';

    supports(input: RequestInput): boolean {
        if (input.method !== 'GET') return false;
        const query = input.query ?? {};
        return (
            typeof query.$filter === 'string' ||
            typeof query.$orderby === 'string' ||
            typeof query.$select === 'string'
        );
    }

    parse(input: RequestInput, ctx: AdapterContext): QuerySpec {
        const query = input.query ?? {};
        const raw: RawSpec = {};

        if (typeof query.$filter === 'string' && query.$filter.trim()) {
            raw.where = ODataParser.parse(query.$filter);
        }
        if (typeof query.$orderby === 'string') raw.orderBy = ODataAdapter.orderBy(query.$orderby);
        if (typeof query.$select === 'string') raw.select = QueryControlsParser.fields(query.$select);
        if (query.$top !== undefined) raw.limit = QueryControlsParser.int(query.$top);
        if (query.$skip !== undefined) raw.skip = QueryControlsParser.int(query.$skip);
        if (typeof query.$search === 'string') raw.search = query.$search;

        return QueryBuilder.build(raw, ctx.model as any, ctx.build);
    }

    /** `age desc,name` → `[{ age: 'desc' }, { name: 'asc' }]`. */
    private static orderBy(input: string): Array<Record<string, SortDir>> {
        return input
            .split(',')
            .map(token => token.trim())
            .filter(Boolean)
            .map(token => {
                const [field, direction] = token.split(/\s+/);
                return { [field]: (direction?.toLowerCase() === 'desc' ? 'desc' : 'asc') as SortDir };
            });
    }
}
