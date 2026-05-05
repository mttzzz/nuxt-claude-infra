import { describe, expect, it, mock } from 'bun:test'

import { resolveTestDbPort, truncateAllTables, disconnectClient } from '../../src/lib/db'

describe('resolveTestDbPort', () => {
  it('бросает если nothing передан и env не выставлен', () => {
    const orig = process.env.TEST_POSTGRES_PORT
    delete process.env.TEST_POSTGRES_PORT
    try {
      expect(() => resolveTestDbPort()).toThrow()
    } finally {
      if (orig) process.env.TEST_POSTGRES_PORT = orig
    }
  })

  it('возвращает ports.db если передан явно', () => {
    expect(resolveTestDbPort({ db: 3318 })).toBe(3318)
  })

  it('читает process.env.TEST_POSTGRES_PORT когда ports не передан', () => {
    const orig = process.env.TEST_POSTGRES_PORT
    process.env.TEST_POSTGRES_PORT = '3325'
    try {
      expect(resolveTestDbPort()).toBe(3325)
    } finally {
      if (orig === undefined) delete process.env.TEST_POSTGRES_PORT
      else process.env.TEST_POSTGRES_PORT = orig
    }
  })
})

describe('truncateAllTables', () => {
  it('builds TRUNCATE statement for given tables', async () => {
    const calls: string[] = []
    const fakeClient = {
      unsafe: (sql: string) => {
        calls.push(sql)
        return Promise.resolve()
      },
    }
    await truncateAllTables(fakeClient as any, ['users', 'sessions', 'orders'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('TRUNCATE')
    expect(calls[0]).toContain('users')
    expect(calls[0]).toContain('sessions')
    expect(calls[0]).toContain('orders')
    expect(calls[0]).toContain('RESTART IDENTITY')
    expect(calls[0]).toContain('CASCADE')
  })

  it('no-op для пустого списка таблиц', async () => {
    const fakeClient = mock(() => Promise.resolve())
    await truncateAllTables({ unsafe: fakeClient } as any, [])
    expect(fakeClient).not.toHaveBeenCalled()
  })

  it('quotes table names', async () => {
    const calls: string[] = []
    const fakeClient = {
      unsafe: (sql: string) => {
        calls.push(sql)
        return Promise.resolve()
      },
    }
    await truncateAllTables(fakeClient as any, ['user'])
    expect(calls[0]).toContain('"user"')
  })
})

describe('disconnectClient', () => {
  it('вызывает client.end() если есть', async () => {
    let ended = false
    await disconnectClient({ end: async () => { ended = true } } as any)
    expect(ended).toBe(true)
  })

  it('игнорирует null/undefined client', async () => {
    await expect(disconnectClient(null as any)).resolves.toBeUndefined()
    await expect(disconnectClient(undefined as any)).resolves.toBeUndefined()
  })
})
