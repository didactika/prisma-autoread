import type { OutputAdapter, OutputContext } from '../types/adapters';
import type { QueryResult } from '../types/query';

/**
 * CSV export. Columns are the union of the rows' top-level keys; nested
 * objects/arrays are JSON-encoded within their cell.
 */
export class CsvOutput implements OutputAdapter {
    readonly name = 'csv';
    readonly contentType = 'text/csv; charset=utf-8';

    format(result: QueryResult, _ctx: OutputContext): string {
        const rows = result.data ?? [];
        if (rows.length === 0) return '';

        const columns = Array.from(
            rows.reduce<Set<string>>((set, row) => {
                Object.keys(row ?? {}).forEach(key => set.add(key));
                return set;
            }, new Set()),
        );

        const header = columns.map(CsvOutput.escape).join(',');
        const body = rows.map(row =>
            columns.map(column => CsvOutput.escape(CsvOutput.cell(row?.[column]))).join(','),
        );
        return [header, ...body].join('\r\n');
    }

    private static cell(value: any): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    private static escape(value: string): string {
        return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }
}
