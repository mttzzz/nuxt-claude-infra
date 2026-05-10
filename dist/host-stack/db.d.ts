import postgres from 'postgres';
import type { HostStackContext } from './define-config.js';
export interface CreateTestDbOptions<TInstance> {
    ctx: HostStackContext;
    /** Фабрика drizzle instance — получает postgres-js client, возвращает типизированный drizzle.
     * Пример: `(client) => drizzle({ client, schema, relations, casing: 'snake_case' })` */
    createInstance: (client: postgres.Sql) => TInstance;
    /** TRUNCATE-list — все таблицы для сброса в beforeEach. Системная __drizzle_migrations НЕ трогается. */
    tables: readonly string[];
    /** Postgres pool max connections (default 10). */
    poolMax?: number;
}
export interface TestDbHelpers<TInstance> {
    /** Lazy drizzle instance для текущего worker (per-fork). */
    testDb: () => TInstance;
    /** TRUNCATE всех таблиц + RESTART IDENTITY CASCADE. Idempotent. */
    truncateAll: () => Promise<void>;
    /** Закрыть pg-pool после прогона тестов (для use в afterAll/teardown). */
    disconnectTestDb: () => Promise<void>;
}
export declare function createTestDb<TInstance>(opts: CreateTestDbOptions<TInstance>): TestDbHelpers<TInstance>;
//# sourceMappingURL=db.d.ts.map