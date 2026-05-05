export interface PostgresClient {
    unsafe: (sql: string, params?: unknown[]) => Promise<unknown>;
    end?: () => Promise<void>;
}
export declare function resolveTestDbPort(ports?: {
    db: number;
}): number;
export declare function truncateAllTables(client: PostgresClient, tables: readonly string[]): Promise<void>;
export declare function disconnectClient(client: PostgresClient | null | undefined): Promise<void>;
//# sourceMappingURL=db.d.ts.map