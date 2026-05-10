/* @mttzzz/nuxt-claude-infra/host-stack — public API host-stack module.
 *
 * Архитектура: per-worker DB (`{dbBase}_w{N}`) + N preview-серверов параллельно
 * (port portBase+N, redis db redisDbBase+N).
 *
 * Quick start in project:
 *   // scripts/test-host-stack/config.ts
 *   import { defineHostStackConfig } from '@mttzzz/nuxt-claude-infra/host-stack'
 *   export const config = defineHostStackConfig({
 *     dbBase: 'my_app_test',
 *     portBase: 3100,
 *     redisDbBase: 10,
 *     envWhitelist: ['NUXT_FOO_API_SECRET'], // optional
 *   })
 *
 *   // scripts/test-host-stack/preview-test.ts
 *   import { runPreviewTest } from '@mttzzz/nuxt-claude-infra/host-stack'
 *   import { config } from './config'
 *   await runPreviewTest(config)
 *
 *   // test/setup/vitest-global-setup.ts
 *   import { createVitestGlobalSetup } from '@mttzzz/nuxt-claude-infra/host-stack/setup'
 *   import { config } from '../../scripts/test-host-stack/config'
 *   export default createVitestGlobalSetup(config)
 *
 *   // test/setup/integration-fork-init.ts
 *   import { createIntegrationForkInit } from '@mttzzz/nuxt-claude-infra/host-stack/setup'
 *   import { config } from '../../scripts/test-host-stack/config'
 *   createIntegrationForkInit(config)
 *
 *   // test/setup/playwright-global-setup.ts
 *   import { createPlaywrightGlobalSetup } from '@mttzzz/nuxt-claude-infra/host-stack/setup'
 *   import { config } from '../../scripts/test-host-stack/config'
 *   export default createPlaywrightGlobalSetup(config)
 */
export { defineHostStackConfig } from './define-config.js';
export { ensureTestStack, ensureTestDb, ensureSecondaryDbsFromPrimary, runMigrationsIfNeeded, hashBuildInputs, hashMigrations, loadCachedHash, saveCachedHash, isServerAlive, } from './orchestrator.js';
export { runPreviewTest } from './preview-test.js';
export { resolveWorkerId } from './helpers/worker-id.js';
export { useSharedNuxt } from './helpers/use-shared-nuxt.js';
