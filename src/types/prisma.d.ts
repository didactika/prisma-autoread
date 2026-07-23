/** The subset of a Prisma model delegate the engine relies on. */
export interface PrismaDelegate {
    findMany(args: any): Promise<any[]>;
    count(args: any): Promise<number>;
    aggregate?(args: any): Promise<any>;
    groupBy?(args: any): Promise<any[]>;
}

/** Legacy-style callback that runs the query and returns rows (+ optional total). */
export type FindByFilter = (
    args: { where?: any; include?: any; orderBy?: any; take?: number; skip?: number },
) => Promise<{ data: any[]; total?: number } | any[]>;

/** Where the executor gets its data from. */
export interface ExecutorSource {
    delegate?: PrismaDelegate;
    finder?: FindByFilter;
}

/** Datasource providers recognised for JSON path syntax detection. */
export type DatasourceProvider =
    | 'postgresql'
    | 'postgres'
    | 'cockroachdb'
    | 'mysql'
    | 'mariadb'
    | 'sqlite'
    | 'sqlserver'
    | 'mongodb';
