import { defineTestStack } from '../lib/test-stack.js'

const stack = defineTestStack()

/*
 * Vitest globalSetup: возвращает teardown-функцию.
 * Vitest вызывает его один раз для всего test-run'а.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const handle = await stack.start()
  process.env.NUXT_TEST_HOST = handle.host
  process.env.CLAUDE_SESSION_ID = handle.sessionId
  process.env.TEST_POSTGRES_PORT = String(handle.ports.db)

  return async () => {
    await stack.stop()
  }
}
