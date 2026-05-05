/*
 * Минимальный интерфейс postgres-js клиента, который нам нужен.
 * Drizzle/postgres-js клиент удовлетворяет этому контракту.
 */
export interface PostgresClient {
  unsafe: (sql: string, params?: unknown[]) => Promise<unknown>
  end?: () => Promise<void>
}

/*
 * Возвращает порт test-Postgres'а текущей сессии.
 * Источники (в порядке приоритета):
 *   1. явный аргумент ports.db (например из startTestStack handle)
 *   2. process.env.TEST_POSTGRES_PORT (выставлен docker-compose'ом или globalSetup'ом)
 *
 * Без обоих — throw (вызывающий должен сначала поднять стек).
 */
export function resolveTestDbPort(ports?: { db: number }): number {
  if (ports?.db !== undefined) return ports.db

  const env = process.env.TEST_POSTGRES_PORT
  if (env) {
    const port = Number(env)
    if (!Number.isNaN(port)) return port
  }

  throw new Error(
    'Невозможно определить test-Postgres порт. ' +
    'Убедись, что test-stack поднят (startTestStack) или что TEST_POSTGRES_PORT выставлен.',
  )
}

/*
 * TRUNCATE всех переданных таблиц одним statement'ом.
 * `RESTART IDENTITY CASCADE` сбрасывает sequence'ы и каскадит внешние ключи.
 * Имена таблиц quote'ятся (через ") чтобы избежать проблем с reserved words ("user").
 */
export async function truncateAllTables(
  client: PostgresClient,
  tables: readonly string[],
): Promise<void> {
  if (tables.length === 0) return
  const quoted = tables.map(t => `"${t}"`).join(', ')
  await client.unsafe(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`)
}

/*
 * Безопасный disconnect — игнорирует null/undefined и отсутствие .end().
 */
export async function disconnectClient(client: PostgresClient | null | undefined): Promise<void> {
  if (!client) return
  if (typeof client.end === 'function') {
    await client.end()
  }
}
