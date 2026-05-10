/* SAFETY tests: buildTestServerEnv whitelist-only.
 * Критично — этот код НЕ должен пропускать реальные NUXT_* секреты в test-server,
 * иначе тесты могут случайно слать реальные емейлы / Telegram / etc. */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineHostStackConfig } from '../../src/host-stack/define-config.js'

describe('buildTestServerEnv — SAFETY whitelist', () => {
  let rootDir: string
  const REAL_SECRET = 'sk-prod-REAL-do-not-leak'

  beforeAll(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'host-stack-env-test-'))
    /* .env.test с dummy NUXT_* — single source of truth для test-server */
    writeFileSync(
      join(rootDir, '.env.test'),
      `NUXT_RESEND_API_KEY=dummy_resend
NUXT_TELEGRAM_TOKEN=dummy_telegram
NUXT_AMOCRM_TOKEN=dummy_amo
NUXT_AI_GATEWAY_API_KEY=dummy_gateway`,
      'utf8',
    )
  })

  afterAll(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('НЕ пропускает реальные NUXT_* секреты из process.env', () => {
    process.env.NUXT_RESEND_API_KEY = REAL_SECRET
    process.env.NUXT_TELEGRAM_TOKEN = REAL_SECRET
    process.env.NUXT_AMOCRM_TOKEN = REAL_SECRET

    const ctx = defineHostStackConfig({ dbBase: 'x', portBase: 3000, rootDir })
    const env = ctx.buildTestServerEnv(1)

    expect(env.NUXT_RESEND_API_KEY).toBe('dummy_resend')
    expect(env.NUXT_TELEGRAM_TOKEN).toBe('dummy_telegram')
    expect(env.NUXT_AMOCRM_TOKEN).toBe('dummy_amo')
    expect(env.NUXT_RESEND_API_KEY).not.toContain('REAL')

    delete process.env.NUXT_RESEND_API_KEY
    delete process.env.NUXT_TELEGRAM_TOKEN
    delete process.env.NUXT_AMOCRM_TOKEN
  })

  it('НЕ пропускает RANDOM_SECRET_VAR без явного whitelist', () => {
    process.env.MY_RANDOM_SECRET = REAL_SECRET
    const ctx = defineHostStackConfig({ dbBase: 'x', portBase: 3000, rootDir })
    const env = ctx.buildTestServerEnv(1)
    expect(env.MY_RANDOM_SECRET).toBeUndefined()
    delete process.env.MY_RANDOM_SECRET
  })

  it('пропускает env-vars из envWhitelist (явное согласие)', () => {
    process.env.NUXT_INTERNAL_API_URL = 'https://internal.example.com'
    process.env.NUXT_INTERNAL_API_SECRET = 'dev-secret-ok'
    const ctx = defineHostStackConfig({
      dbBase: 'x',
      portBase: 3000,
      rootDir,
      envWhitelist: ['NUXT_INTERNAL_API_URL', 'NUXT_INTERNAL_API_SECRET'],
    })
    const env = ctx.buildTestServerEnv(1)
    expect(env.NUXT_INTERNAL_API_URL).toBe('https://internal.example.com')
    expect(env.NUXT_INTERNAL_API_SECRET).toBe('dev-secret-ok')
    delete process.env.NUXT_INTERNAL_API_URL
    delete process.env.NUXT_INTERNAL_API_SECRET
  })

  it('per-worker overrides перетирают .env.test и whitelist (PORT, POSTGRES_URL, REDIS_DB)', () => {
    /* .env.test может содержать legacy POSTGRES_URL — он ДОЛЖЕН быть перетёрт per-worker. */
    writeFileSync(
      join(rootDir, '.env.test'),
      `POSTGRES_URL=postgresql://legacy:legacy@localhost/wrong_db
NUXT_REDIS_DB=0`,
      'utf8',
    )
    const ctx = defineHostStackConfig({ dbBase: 'foo', portBase: 5000, rootDir, redisDbBase: 10 })
    const env = ctx.buildTestServerEnv(2)
    expect(env.POSTGRES_URL).toContain('foo_w2')
    expect(env.POSTGRES_URL).not.toContain('legacy')
    expect(env.NUXT_REDIS_DB).toBe('12') /* 10 + 2 */
    expect(env.PORT).toBe('5002')
  })

  it('всегда выставляет hardcoded test-mode флаги', () => {
    const ctx = defineHostStackConfig({ dbBase: 'x', portBase: 3000, rootDir })
    const env = ctx.buildTestServerEnv(1)
    expect(env.NUXT_TEST_MODE).toBe('1')
    expect(env.NODE_ENV).toBe('test')
    expect(env.SENTRY_DISABLED).toBe('1')
    expect(env.SENTRY_DSN).toBe('')
    expect(env.BETTER_AUTH_SECRET).toBe('test-only-secret-do-not-use-in-prod')
    expect(env.BETTER_AUTH_URL).toBe('http://127.0.0.1:3001')
  })

  it('пропускает safe system vars (PATH, HOME, SHELL, etc) из process.env', () => {
    process.env.PATH = '/usr/bin:/bin'
    process.env.HOME = '/home/test'
    const ctx = defineHostStackConfig({ dbBase: 'x', portBase: 3000, rootDir })
    const env = ctx.buildTestServerEnv(1)
    expect(env.PATH).toBe('/usr/bin:/bin')
    expect(env.HOME).toBe('/home/test')
  })

  it('Redis settings из options (host/port/password)', () => {
    const ctx = defineHostStackConfig({
      dbBase: 'x',
      portBase: 3000,
      rootDir,
      redisHost: 'redis.internal',
      redisPort: 6380,
      redisPassword: 'rpass',
    })
    const env = ctx.buildTestServerEnv(1)
    expect(env.NUXT_REDIS_HOST).toBe('redis.internal')
    expect(env.NUXT_REDIS_PORT).toBe('6380')
    expect(env.NUXT_REDIS_PASSWORD).toBe('rpass')
  })
})
