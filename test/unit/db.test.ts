import { describe, expect, it, mock } from 'bun:test'

import { resolveTestDbPort, truncateAllTables, disconnectClient } from '../../src/lib/db'

describe('resolveTestDbPort', () => {
  it('бросает если sessionId не передан и env не выставлен', () => {
    const origPort = process.env.TEST_POSTGRES_PORT
    delete process.env.TEST_POSTGRES_PORT
    try {
      expect(() => resolveTestDbPort(undefined, { sessionId: undefined, ports: undefined })).toThrow()
    } finally {
      if (origPort) process.env.TEST_POSTGRES_PORT = origPort
    }
  })

  it('возвращает env TEST_POSTGRES_PORT если задан', () => {
    expect(resolveTestDbPort(undefined, { sessionId: undefined, ports: { db: 3318 } })).toBe(3318)
  })

  it('берёт port из переданного аллокированного порта', () => {
    expect(resolveTestDbPort('sess-123', { sessionId: 'sess-123', ports: { db: 3320 } })).toBe(3320)
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
