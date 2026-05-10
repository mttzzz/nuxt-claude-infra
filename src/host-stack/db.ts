/* createTestDb<TInstance>({ createInstance, ctx, tables }) — фабрика per-worker drizzle клиента + truncateAll.
 *
 * DI pattern: проект пробрасывает `createInstance(client)` callback, который вызывает свой `drizzle()`
 * с своими schema/relations. Тогда TInstance корректно выводится из drizzle return type.
 * Пакет НЕ импортит drizzle-orm (защита от version mismatch + bun link issues).
 *
 * Использование (test/helpers/db.ts):
 *   import { createTestDb } from '@mttzzz/nuxt-claude-infra/host-stack/db'
 *   import { drizzle } from 'drizzle-orm/postgres-js'
 *   import { hostStack } from '~~/scripts/test-host-stack/config'
 *   import { relations } from '~~/server/db/relations'
 *   import * as schema from '~~/server/db/schema'
 *
 *   export const { testDb, truncateAll, disconnectTestDb } = createTestDb({
 *     ctx: hostStack,
 *     createInstance: (client) => drizzle({ client, schema, relations, casing: 'snake_case' }),
 *     tables: ['users', 'companies', ...] as const,
 *   })
 *
 * testDb() возвращает drizzle instance с корректными типами выведенными из schema/relations проекта. */

import postgres from 'postgres'

import type { HostStackContext } from './define-config.js'
import { resolveWorkerId } from './helpers/worker-id.js'

export interface CreateTestDbOptions<TInstance> {
  ctx: HostStackContext
  /** Фабрика drizzle instance — получает postgres-js client, возвращает типизированный drizzle.
   * Пример: `(client) => drizzle({ client, schema, relations, casing: 'snake_case' })` */
  createInstance: (client: postgres.Sql) => TInstance
  /** TRUNCATE-list — все таблицы для сброса в beforeEach. Системная __drizzle_migrations НЕ трогается. */
  tables: readonly string[]
  /** Postgres pool max connections (default 10). */
  poolMax?: number
}

export interface TestDbHelpers<TInstance> {
  /** Lazy drizzle instance для текущего worker (per-fork). */
  testDb: () => TInstance
  /** TRUNCATE всех таблиц + RESTART IDENTITY CASCADE. Idempotent. */
  truncateAll: () => Promise<void>
  /** Закрыть pg-pool после прогона тестов (для use в afterAll/teardown). */
  disconnectTestDb: () => Promise<void>
}

export function createTestDb<TInstance>(opts: CreateTestDbOptions<TInstance>): TestDbHelpers<TInstance> {
  let client: postgres.Sql | null = null
  let instance: TInstance | null = null

  function testDb(): TInstance {
    if (instance !== null) return instance
    const workerId = resolveWorkerId(opts.ctx.options.workerCountDefault)
    client = postgres(opts.ctx.testPostgresUrl(workerId), {
      max: opts.poolMax ?? 10,
      prepare: false,
      onnotice: () => {},
    })
    instance = opts.createInstance(client)
    return instance
  }

  async function truncateAll(): Promise<void> {
    testDb()
    if (!client) throw new Error('createTestDb: client not initialized')
    if (opts.tables.length === 0) return
    const quoted = opts.tables.map((t) => `"${t}"`).join(', ')
    await client.unsafe(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`)
  }

  async function disconnectTestDb(): Promise<void> {
    if (client) await client.end()
    client = null
    instance = null
  }

  return { testDb, truncateAll, disconnectTestDb }
}
