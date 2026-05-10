/* createIntegrationForkInit(ctx) — side-effect фабрика для vitest setupFiles.
 * Выставляет NUXT_TEST_HOST по VITEST_POOL_ID per-fork ДО загрузки test-helpers.
 *
 * Использование в проекте (test/setup/integration-fork-init.ts):
 *   import { createIntegrationForkInit } from '@mttzzz/nuxt-claude-infra/host-stack/setup'
 *   import { config } from '../../scripts/test-host-stack/config'
 *   createIntegrationForkInit(config)
 *
 * Вызов без параметров — side-effect (модуль импортируется vitest setupFiles, init выполняется один раз). */
import type { HostStackContext } from '../define-config.js'
import { resolveWorkerId } from '../helpers/worker-id.js'

export function createIntegrationForkInit(ctx: HostStackContext): void {
  const workerId = resolveWorkerId(ctx.options.workerCountDefault)
  const host = ctx.testServerUrl(workerId)
  process.env.NUXT_TEST_HOST = host
  /* eslint-disable-next-line no-console */
  console.log(`[integration-fork-init] worker=${String(workerId)} host=${host}`)
}
