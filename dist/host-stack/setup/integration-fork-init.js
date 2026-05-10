import { resolveWorkerId } from '../helpers/worker-id.js';
export function createIntegrationForkInit(ctx) {
    const workerId = resolveWorkerId(ctx.options.workerCountDefault);
    const host = ctx.testServerUrl(workerId);
    process.env.NUXT_TEST_HOST = host;
    /* eslint-disable-next-line no-console */
    console.log(`[integration-fork-init] worker=${String(workerId)} host=${host}`);
}
