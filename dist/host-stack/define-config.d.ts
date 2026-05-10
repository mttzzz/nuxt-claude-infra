export interface HostStackOptions {
    /** Базовое имя test-БД (БЕЗ суффикса _w{N}). Пример: 'ai_pushka_biz_test'. */
    dbBase: string;
    /** Базовый порт. Worker N → port portBase + N. Пример: 3100 → 3101, 3102, ... */
    portBase: number;
    /** Базовый Redis db. Worker N → db redisDbBase + N. Default 0. */
    redisDbBase?: number;
    /** Redis host (default '127.0.0.1'). */
    redisHost?: string;
    /** Redis port (default 6379). */
    redisPort?: number;
    /** Redis password. Resolution order: explicit option → process.env.NUXT_REDIS_PASSWORD → ''. */
    redisPassword?: string;
    /** Дефолтное число параллельных workers. Переопределяется TEST_WORKERS env. Default 4. */
    workerCountDefault?: number;
    /** Локальный PG user (default 'mttzzzz', no password — local trust). */
    dbUser?: string;
    /** Локальный PG password (default ''). */
    dbPassword?: string;
    /** Локальный PG host (default '127.0.0.1'). */
    dbHost?: string;
    /** Локальный PG port (default 5432). */
    dbPort?: number;
    /** Test-server host (default '127.0.0.1'). */
    serverHost?: string;
    /** Дополнительные env-vars из process.env, которые ОСОЗНАННО пробрасываются в server (помимо .env.test).
     *  Например: ['NUXT_EXCHANGE_RATE_API_URL', 'NUXT_EXCHANGE_RATE_API_SECRET'] для read-only внутреннего API. */
    envWhitelist?: string[];
    /** Дирки для build hash (default ['server', 'app', 'shared', 'modules']). */
    buildInputDirs?: string[];
    /** Файлы для build hash (default ['package.json', 'bun.lock', 'nuxt.config.ts', 'tsconfig.json']). */
    buildInputFiles?: string[];
    /** Путь до drizzle migrations (default 'drizzle'). */
    migrationsDir?: string;
    /** Каталог для hash-cache файлов (default '.tmp/test-stack'). */
    stateDir?: string;
    /** Project root (default process.cwd()). Для unit-тестов host-stack в самом пакете. */
    rootDir?: string;
}
export interface ResolvedHostStackOptions extends Required<HostStackOptions> {
}
export interface HostStackContext {
    options: ResolvedHostStackOptions;
    /** Имя per-worker test-БД (1-indexed). */
    testDbName: (workerId: number) => string;
    /** PG URL для test-БД worker'а. */
    testPostgresUrl: (workerId?: number) => string;
    /** PG URL admin-операций (CREATE DATABASE etc.) — коннектится к 'postgres'. */
    testAdminPostgresUrl: () => string;
    /** Server port worker'а. */
    testServerPort: (workerId: number) => number;
    /** Server URL worker'а (NUXT_TEST_HOST). */
    testServerUrl: (workerId?: number) => string;
    /** Redis db worker'а. */
    testRedisDb: (workerId: number) => number;
    /** Прочитать TEST_WORKERS env или default. */
    resolveWorkerCount: () => number;
    /** Env для spawn'а test-сервера worker'а. SAFETY whitelist-only — см. JSDoc файла. */
    buildTestServerEnv: (workerId?: number) => Record<string, string>;
    /** Build hash file path. */
    buildHashFile: string;
    /** Migrations hash file path. */
    migrationsHashFile: string;
    /** Build output marker (для is-output-fresh check). */
    buildOutputMarker: string;
}
export declare function defineHostStackConfig(opts: HostStackOptions): HostStackContext;
//# sourceMappingURL=define-config.d.ts.map