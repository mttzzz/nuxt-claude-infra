/* Host-stack config builder.
 *
 * Каждый проект описывает свой test-стек в одном месте через defineHostStackConfig:
 *   const config = defineHostStackConfig({
 *     dbBase: 'ai_pushka_biz_test',
 *     portBase: 3100,
 *     redisDbBase: 10,
 *     envWhitelist: ['NUXT_EXCHANGE_RATE_API_URL', ...],
 *   })
 *
 * Возвращает frozen-контекст, который принимают orchestrator/preview-test/setup-helpers.
 *
 * SAFETY: buildTestServerEnv НЕ пробрасывает process.env (там реальные NUXT_* секреты из Infisical).
 * Test-сервер получает только safe system vars (PATH/HOME/SHELL/TZ) + dummy NUXT_* из .env.test
 * + per-worker config + явный envWhitelist.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const DEFAULTS = {
    redisDbBase: 0,
    redisHost: '127.0.0.1',
    redisPort: 6379,
    redisPassword: '',
    workerCountDefault: 4,
    dbUser: 'mttzzzz',
    dbPassword: '',
    dbHost: '127.0.0.1',
    dbPort: 5432,
    serverHost: '127.0.0.1',
    envWhitelist: [],
    buildInputDirs: ['server', 'app', 'shared', 'modules'],
    buildInputFiles: ['package.json', 'bun.lock', 'nuxt.config.ts', 'tsconfig.json'],
    migrationsDir: 'drizzle',
    stateDir: '.tmp/test-stack',
};
export function defineHostStackConfig(opts) {
    const o = {
        dbBase: opts.dbBase,
        portBase: opts.portBase,
        redisDbBase: opts.redisDbBase ?? DEFAULTS.redisDbBase,
        redisHost: opts.redisHost ?? DEFAULTS.redisHost,
        redisPort: opts.redisPort ?? DEFAULTS.redisPort,
        redisPassword: opts.redisPassword ?? DEFAULTS.redisPassword,
        workerCountDefault: opts.workerCountDefault ?? DEFAULTS.workerCountDefault,
        dbUser: opts.dbUser ?? DEFAULTS.dbUser,
        dbPassword: opts.dbPassword ?? DEFAULTS.dbPassword,
        dbHost: opts.dbHost ?? DEFAULTS.dbHost,
        dbPort: opts.dbPort ?? DEFAULTS.dbPort,
        serverHost: opts.serverHost ?? DEFAULTS.serverHost,
        envWhitelist: opts.envWhitelist ?? DEFAULTS.envWhitelist,
        buildInputDirs: opts.buildInputDirs ?? [...DEFAULTS.buildInputDirs],
        buildInputFiles: opts.buildInputFiles ?? [...DEFAULTS.buildInputFiles],
        migrationsDir: opts.migrationsDir ?? DEFAULTS.migrationsDir,
        stateDir: opts.stateDir ?? DEFAULTS.stateDir,
        rootDir: opts.rootDir ?? process.cwd(),
    };
    const buildPostgresUrl = (database) => {
        const auth = o.dbPassword
            ? `${encodeURIComponent(o.dbUser)}:${encodeURIComponent(o.dbPassword)}`
            : encodeURIComponent(o.dbUser);
        return `postgresql://${auth}@${o.dbHost}:${String(o.dbPort)}/${database}`;
    };
    const ctx = {
        options: o,
        testDbName: (workerId) => `${o.dbBase}_w${String(workerId)}`,
        testPostgresUrl: (workerId = 1) => buildPostgresUrl(`${o.dbBase}_w${String(workerId)}`),
        testAdminPostgresUrl: () => buildPostgresUrl('postgres'),
        testServerPort: (workerId) => o.portBase + workerId,
        testServerUrl: (workerId = 1) => `http://${o.serverHost}:${String(o.portBase + workerId)}`,
        testRedisDb: (workerId) => o.redisDbBase + workerId,
        resolveWorkerCount: () => {
            const raw = process.env.TEST_WORKERS;
            if (!raw)
                return o.workerCountDefault;
            const n = Number.parseInt(raw, 10);
            return Number.isFinite(n) && n >= 1 ? n : o.workerCountDefault;
        },
        buildTestServerEnv: (workerId = 1) => buildServerEnv(ctx, workerId),
        buildHashFile: `${o.stateDir}/build.hash`,
        migrationsHashFile: `${o.stateDir}/migrations.hash`,
        buildOutputMarker: '.output/server/index.mjs',
    };
    return Object.freeze(ctx);
}
/** Парсит .env.test (KEY=VALUE per line) — single source of truth для dummy NUXT_*. */
function loadEnvTest(rootDir) {
    const path = join(rootDir, '.env.test');
    if (!existsSync(path))
        return {};
    const out = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1)
            continue;
        out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return out;
}
/* Список НЕ-NUXT системных vars пропускаемых из process.env. Без секретов. */
const SAFE_SYSTEM_ENV_KEYS = ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TZ'];
function buildServerEnv(ctx, workerId) {
    const o = ctx.options;
    const dummyEnv = loadEnvTest(o.rootDir);
    const safeBase = {};
    for (const key of SAFE_SYSTEM_ENV_KEYS) {
        const v = process.env[key];
        if (v)
            safeBase[key] = v;
    }
    /* Project-specific whitelist: read-only внутренние API (не "real secret" уровня Resend/Telegram). */
    const whitelist = {};
    for (const key of o.envWhitelist) {
        const v = process.env[key];
        if (v)
            whitelist[key] = v;
    }
    return {
        ...safeBase,
        /* Dummy NUXT_* + связанные из .env.test (NUXT_RESEND_API_KEY=dummy, NUXT_TELEGRAM_*, etc.). */
        ...dummyEnv,
        /* Explicit project-side whitelist. */
        ...whitelist,
        /* Per-worker overrides — DB, port, Redis db. Перетирают всё выше. */
        PORT: String(ctx.testServerPort(workerId)),
        POSTGRES_URL: ctx.testPostgresUrl(workerId),
        NUXT_REDIS_HOST: o.redisHost,
        NUXT_REDIS_PORT: String(o.redisPort),
        NUXT_REDIS_PASSWORD: o.redisPassword,
        NUXT_REDIS_DB: String(ctx.testRedisDb(workerId)),
        NUXT_TEST_MODE: '1',
        BETTER_AUTH_URL: ctx.testServerUrl(workerId),
        BETTER_AUTH_SECRET: 'test-only-secret-do-not-use-in-prod',
        SENTRY_DISABLED: '1',
        SENTRY_DSN: '',
        NODE_ENV: 'test',
        NO_COLOR: '1',
        /* Подавить DEP0205 (`module.register()` deprecation) от vite-node. */
        NODE_OPTIONS: '--no-deprecation',
        /* Дополнительные dummy для не-NUXT-модулей, валидирующих ENV на import. */
        RESEND_API_KEY: 're_test_dummy_key_00000000000000',
        OPENAI_API_KEY: 'sk-test-dummy',
        ANTHROPIC_API_KEY: 'sk-ant-test-dummy',
    };
}
