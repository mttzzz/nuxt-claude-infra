/* Host-stack config builder.
 *
 * Каждый проект описывает свой test-стек в одном месте через defineHostStackConfig:
 *   const config = defineHostStackConfig({
 *     dbBase: 'ai_pushka_biz_test',
 *     portBase: 3100,            // worker N → port 3100+N (3101, 3102, ...)
 *     redisDbBase: 10,           // worker N → redis db 10+N (опционально)
 *     envWhitelist: ['NUXT_EXCHANGE_RATE_API_URL', ...],  // ещё процесс-env-vars пройдут в server (помимо .env.test)
 *   })
 *
 * Возвращает frozen-контекст, который принимают orchestrator/preview-test/setup-helpers.
 *
 * SAFETY: buildTestServerEnv НЕ пробрасывает process.env (там реальные NUXT_* секреты из Infisical).
 * Test-сервер получает только PATH/HOME/SHELL/TZ + dummy NUXT_* из .env.test + per-worker config + явный envWhitelist.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface HostStackOptions {
  /** Базовое имя test-БД (БЕЗ суффикса _w{N}). Пример: 'ai_pushka_biz_test'. */
  dbBase: string
  /** Базовый порт. Worker N → port portBase + N. Пример: 3100 → 3101, 3102, ... */
  portBase: number
  /** Базовый Redis db. Worker N → db redisDbBase + N. Default 0. */
  redisDbBase?: number
  /** Дефолтное число параллельных workers. Переопределяется TEST_WORKERS env. Default 4. */
  workerCountDefault?: number
  /** Локальный PG user (default 'mttzzzz', no password). */
  dbUser?: string
  /** Локальный PG password (default ''). */
  dbPassword?: string
  /** Локальный PG host (default '127.0.0.1'). */
  dbHost?: string
  /** Локальный PG port (default 5432). */
  dbPort?: number
  /** Test-server host (default '127.0.0.1'). */
  serverHost?: string
  /** Дополнительные NUXT_* env-vars из process.env, которые ОСОЗНАННО пробрасываются в server.
   *  Например: ['NUXT_EXCHANGE_RATE_API_URL', 'NUXT_EXCHANGE_RATE_API_SECRET'] для read-only внутреннего API. */
  envWhitelist?: string[]
  /** Дирки для build hash (default ['server', 'app', 'shared', 'modules']). */
  buildInputDirs?: string[]
  /** Файлы для build hash (default ['package.json', 'bun.lock', 'nuxt.config.ts', 'tsconfig.json']). */
  buildInputFiles?: string[]
  /** Путь до drizzle migrations (default 'drizzle'). */
  migrationsDir?: string
  /** Каталог для hash-cache файлов (default '.tmp/test-stack'). */
  stateDir?: string
}

export interface ResolvedHostStackOptions extends Required<HostStackOptions> {}

export interface HostStackContext {
  options: ResolvedHostStackOptions
  /** Имя per-worker test-БД (1-indexed). */
  testDbName: (workerId: number) => string
  /** PG URL для test-БД worker'а. */
  testPostgresUrl: (workerId?: number) => string
  /** PG URL admin-операций (CREATE DATABASE etc.) — коннектится к 'postgres'. */
  testAdminPostgresUrl: () => string
  /** Server port worker'а. */
  testServerPort: (workerId: number) => number
  /** Server URL worker'а (NUXT_TEST_HOST). */
  testServerUrl: (workerId?: number) => string
  /** Redis db worker'а. */
  testRedisDb: (workerId: number) => number
  /** Прочитать TEST_WORKERS env или default. */
  resolveWorkerCount: () => number
  /** Env для spawn'а test-сервера worker'а. SAFETY whitelist-only. */
  buildTestServerEnv: (workerId?: number) => Record<string, string>
  /** Build hash file path (для cache build artefacts). */
  buildHashFile: string
  /** Migrations hash file path. */
  migrationsHashFile: string
  /** Build output marker (для is-output-fresh check). */
  buildOutputMarker: string
}

const DEFAULTS = {
  redisDbBase: 0,
  workerCountDefault: 4,
  dbUser: 'mttzzzz',
  dbPassword: '',
  dbHost: '127.0.0.1',
  dbPort: 5432,
  serverHost: '127.0.0.1',
  envWhitelist: [] as string[],
  buildInputDirs: ['server', 'app', 'shared', 'modules'],
  buildInputFiles: ['package.json', 'bun.lock', 'nuxt.config.ts', 'tsconfig.json'],
  migrationsDir: 'drizzle',
  stateDir: '.tmp/test-stack',
} as const

export function defineHostStackConfig(opts: HostStackOptions): HostStackContext {
  const o: ResolvedHostStackOptions = {
    dbBase: opts.dbBase,
    portBase: opts.portBase,
    redisDbBase: opts.redisDbBase ?? DEFAULTS.redisDbBase,
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
  }

  const buildPostgresUrl = (database: string): string => {
    const auth = o.dbPassword
      ? `${encodeURIComponent(o.dbUser)}:${encodeURIComponent(o.dbPassword)}`
      : encodeURIComponent(o.dbUser)
    return `postgresql://${auth}@${o.dbHost}:${String(o.dbPort)}/${database}`
  }

  const ctx: HostStackContext = {
    options: o,
    testDbName: (workerId: number) => `${o.dbBase}_w${String(workerId)}`,
    testPostgresUrl: (workerId: number = 1) => buildPostgresUrl(`${o.dbBase}_w${String(workerId)}`),
    testAdminPostgresUrl: () => buildPostgresUrl('postgres'),
    testServerPort: (workerId: number) => o.portBase + workerId,
    testServerUrl: (workerId: number = 1) => `http://${o.serverHost}:${String(o.portBase + workerId)}`,
    testRedisDb: (workerId: number) => o.redisDbBase + workerId,
    resolveWorkerCount: () => {
      const raw = process.env.TEST_WORKERS
      if (!raw) return o.workerCountDefault
      const n = Number.parseInt(raw, 10)
      return Number.isFinite(n) && n >= 1 ? n : o.workerCountDefault
    },
    buildTestServerEnv: (workerId: number = 1) => buildServerEnv(ctx, workerId),
    buildHashFile: `${o.stateDir}/build.hash`,
    migrationsHashFile: `${o.stateDir}/migrations.hash`,
    buildOutputMarker: '.output/server/index.mjs',
  }

  return Object.freeze(ctx)
}

/** Парсит .env.test (KEY=VALUE per line, ничего fancy) — single source of truth для dummy NUXT_*. */
function loadEnvTest(rootDir: string = process.cwd()): Record<string, string> {
  const path = join(rootDir, '.env.test')
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

function buildServerEnv(ctx: HostStackContext, workerId: number): Record<string, string> {
  const o = ctx.options
  const dummyEnv = loadEnvTest()

  /* Минимальный системный env — без NUXT_*, без секретов. */
  const safeBase: Record<string, string> = {}
  for (const key of ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TZ']) {
    const v = process.env[key]
    if (v) safeBase[key] = v
  }

  /* Project-specific whitelist (например read-only внутренние API — не "real secret" уровня Resend). */
  const whitelist: Record<string, string> = {}
  for (const key of o.envWhitelist) {
    const v = process.env[key]
    if (v) whitelist[key] = v
  }

  return {
    ...safeBase,
    /* Dummy NUXT_* + связанные из .env.test (NUXT_RESEND_API_KEY=dummy, NUXT_TELEGRAM_*, etc.). */
    ...dummyEnv,
    /* Explicit whitelist для осознанно нужных process.env vars. */
    ...whitelist,
    /* Per-worker overrides — DB, port, Redis db. Перетирают что было выше. */
    PORT: String(ctx.testServerPort(workerId)),
    POSTGRES_URL: ctx.testPostgresUrl(workerId),
    NUXT_REDIS_HOST: o.dbHost === '127.0.0.1' ? '127.0.0.1' : o.dbHost, /* assume same host as PG */
    NUXT_REDIS_PORT: '6379',
    NUXT_REDIS_PASSWORD: '',
    NUXT_REDIS_DB: String(ctx.testRedisDb(workerId)),
    NUXT_TEST_MODE: '1',
    BETTER_AUTH_URL: ctx.testServerUrl(workerId),
    BETTER_AUTH_SECRET: 'test-only-secret-do-not-use-in-prod',
    SENTRY_DISABLED: '1',
    SENTRY_DSN: '',
    NODE_ENV: 'test',
    NO_COLOR: '1',
    /* Подавить DEP0205 (`module.register()` deprecation) от vite-node — спамит каждый старт. */
    NODE_OPTIONS: '--no-deprecation',
    /* Дополнительные dummy для не-NUXT-модулей, валидирующих ENV на import. */
    RESEND_API_KEY: 're_test_dummy_key_00000000000000',
    OPENAI_API_KEY: 'sk-test-dummy',
    ANTHROPIC_API_KEY: 'sk-ant-test-dummy',
  }
}
