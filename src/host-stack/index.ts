/* @mttzzz/nuxt-claude-infra/host-stack — public API host-stack module.
 *
 * Архитектура: per-worker DB (`{dbBase}_w{N}`) + N preview-серверов параллельно
 * (port portBase+N, redis db redisDbBase+N).
 *
 * Quick start in project (минимально 5 файлов, ~25 строк всего):
 *
 *   // scripts/test-host-stack/config.ts (5 строк)
 *   import { defineHostStackConfig } from '@mttzzz/nuxt-claude-infra/host-stack'
 *   export const hostStack = defineHostStackConfig({
 *     dbBase: 'my_app_test',
 *     portBase: 3100,
 *     redisDbBase: 10,             // optional
 *     envWhitelist: ['NUXT_FOO'],   // optional process.env passthrough (помимо .env.test)
 *   })
 *
 *   // scripts/test-host-stack/preview-test.ts (3 строки)
 *   import { runPreviewTest } from '@mttzzz/nuxt-claude-infra/host-stack'
 *   import { hostStack } from './config'
 *   await runPreviewTest(hostStack)
 *
 *   // test/helpers/db.ts (~10 строк, тип-параметризованный)
 *   import { createTestDb } from '@mttzzz/nuxt-claude-infra/host-stack/db'
 *   import { hostStack } from '~~/scripts/test-host-stack/config'
 *   import { relations } from '~~/server/db/relations'
 *   import * as schema from '~~/server/db/schema'
 *   export const { testDb, truncateAll, disconnectTestDb } = createTestDb({
 *     ctx: hostStack, schema, relations,
 *     tables: ['users', 'companies', ...] as const,
 *   })
 *
 *   // test/helpers/use-shared-nuxt.ts (3 строки)
 *   import { setup } from '@nuxt/test-utils/e2e'
 *   import { createUseSharedNuxt } from '@mttzzz/nuxt-claude-infra/host-stack'
 *   export const useSharedNuxt = createUseSharedNuxt(setup)
 *
 *   // test/setup/{vitest-global-setup, integration-fork-init, playwright-global-setup}.ts (3 × 3 строки)
 *   import { createVitestGlobalSetup } from '@mttzzz/nuxt-claude-infra/host-stack/setup'
 *   import { hostStack } from '../../scripts/test-host-stack/config'
 *   export default createVitestGlobalSetup(hostStack)
 */

export { defineHostStackConfig } from './define-config.js'
export type { HostStackContext, HostStackOptions, ResolvedHostStackOptions } from './define-config.js'

export {
  ensureTestStack,
  ensureTestDb,
  ensureSecondaryDbsFromPrimary,
  runMigrationsIfNeeded,
  hashBuildInputs,
  hashMigrations,
  loadCachedHash,
  saveCachedHash,
  isServerAlive,
  type EnsureStackResult,
  type EnsureTestDbOptions,
  type RunMigrationsOptions,
  type RunMigrationsResult,
} from './orchestrator.js'

export { runPreviewTest } from './preview-test.js'

export { resolveWorkerId } from './helpers/worker-id.js'
export { createUseSharedNuxt, type SetupFn } from './helpers/use-shared-nuxt.js'
