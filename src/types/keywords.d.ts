/**
 * Names of the reserved query-string parameters. Every one can be renamed so a
 * model field never collides with a control parameter.
 */
export interface KeywordMap {
    filter: string;
    sort: string;
    fields: string;
    include: string;
    page: string;
    limit: string;
    search: string;
    distinct: string;
    cursor: string;
    format: string;
    count: string;
    sum: string;
    avg: string;
    min: string;
    max: string;
    by: string;
    having: string;
}

/** Partial override of {@link KeywordMap}. */
export type KeywordOverrides = Partial<KeywordMap>;
