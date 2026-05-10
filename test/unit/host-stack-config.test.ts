import { describe, expect, it } from 'bun:test'

import { defineHostStackConfig } from '../../src/host-stack/define-config.js'

describe('defineHostStackConfig', () => {
  it('возвращает context с derived helpers по DEFAULTS', () => {
    const ctx = defineHostStackConfig({ dbBase: 'demo', portBase: 3000 })
    expect(ctx.testDbName(1)).toBe('demo_w1')
    expect(ctx.testDbName(7)).toBe('demo_w7')
    expect(ctx.testServerPort(2)).toBe(3002)
    expect(ctx.testServerUrl(3)).toBe('http://127.0.0.1:3003')
    expect(ctx.testRedisDb(1)).toBe(1) /* default redisDbBase=0 → 0+1 */
    expect(ctx.options.workerCountDefault).toBe(4)
    expect(ctx.options.dbUser).toBe('mttzzzz')
  })

  it('переопределяет defaults через options', () => {
    const ctx = defineHostStackConfig({
      dbBase: 'foo',
      portBase: 4000,
      redisDbBase: 10,
      redisHost: 'redis-internal',
      redisPort: 6380,
      redisPassword: 'pw',
      dbHost: '10.0.0.5',
      dbPort: 5433,
      dbUser: 'tester',
      dbPassword: 'secret',
      workerCountDefault: 8,
    })
    expect(ctx.testRedisDb(2)).toBe(12)
    expect(ctx.options.redisHost).toBe('redis-internal')
    expect(ctx.options.redisPort).toBe(6380)
    expect(ctx.options.redisPassword).toBe('pw')
    expect(ctx.options.workerCountDefault).toBe(8)
    expect(ctx.testPostgresUrl(1)).toContain('tester:secret@10.0.0.5:5433')
    expect(ctx.testPostgresUrl(1)).toContain('foo_w1')
  })

  it('testAdminPostgresUrl коннектится к "postgres" (admin DB)', () => {
    const ctx = defineHostStackConfig({ dbBase: 'foo', portBase: 3000 })
    expect(ctx.testAdminPostgresUrl()).toContain('/postgres')
    expect(ctx.testAdminPostgresUrl()).not.toContain('foo_w')
  })

  it('testPostgresUrl без пароля — нет двоеточия', () => {
    const ctx = defineHostStackConfig({ dbBase: 'foo', portBase: 3000, dbUser: 'u', dbPassword: '' })
    /* postgresql://u@... — без : */
    expect(ctx.testPostgresUrl(1)).toMatch(/postgresql:\/\/u@/)
  })

  it('resolveWorkerCount читает TEST_WORKERS env', () => {
    const ctx = defineHostStackConfig({ dbBase: 'x', portBase: 3000 })
    const old = process.env.TEST_WORKERS
    process.env.TEST_WORKERS = '8'
    expect(ctx.resolveWorkerCount()).toBe(8)
    process.env.TEST_WORKERS = '0'
    expect(ctx.resolveWorkerCount()).toBe(4) /* fallback default при 0 */
    process.env.TEST_WORKERS = 'abc'
    expect(ctx.resolveWorkerCount()).toBe(4) /* fallback default при NaN */
    delete process.env.TEST_WORKERS
    expect(ctx.resolveWorkerCount()).toBe(4)
    if (old !== undefined) process.env.TEST_WORKERS = old
  })

  it('returns frozen context — нельзя ломануть options извне', () => {
    const ctx = defineHostStackConfig({ dbBase: 'x', portBase: 3000 })
    expect(Object.isFrozen(ctx)).toBe(true)
  })
})
