/* createPlaywrightGlobalSetup(ctx) — фабрика для playwright globalSetup.
 *
 * Использование в проекте (test/setup/playwright-global-setup.ts):
 *   import { createPlaywrightGlobalSetup } from '@mttzzz/nuxt-claude-infra/host-stack/setup'
 *   import { config } from '../../scripts/test-host-stack/config'
 *   export default createPlaywrightGlobalSetup(config) */
import { ensureTestStack } from '../orchestrator.js';
export function createPlaywrightGlobalSetup(ctx) {
    return async () => {
        const workerCount = ctx.resolveWorkerCount();
        const res = await ensureTestStack(ctx, { workerCount });
        process.env.TEST_POSTGRES_PORT = String(ctx.options.dbPort);
        /* eslint-disable-next-line no-console */
        console.log(`[test-stack] connected ${String(res.workerCount)} worker(s) migrations=${res.migrationSkipped ? 'skipped' : 'applied'} hosts=${res.hosts.slice(1).join(',')}`);
    };
}
