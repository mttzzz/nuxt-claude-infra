/*
 * Стандартный playwright-конфиг для Nuxt-проектов с per-session инфрой.
 * GlobalSetup поднимает test-stack, NUXT_TEST_HOST читается из env.
 *
 * Проектный playwright.config.ts:
 *   import { definePlaywrightPreset } from '@mttzzz/nuxt-claude-infra/configs/playwright'
 *   export default definePlaywrightPreset()
 */
export function definePlaywrightPreset(opts = {}) {
    return {
        testDir: opts.testDir ?? './test/e2e',
        globalSetup: '@mttzzz/nuxt-claude-infra/configs/playwright-global-setup',
        globalTeardown: '@mttzzz/nuxt-claude-infra/configs/playwright-global-teardown',
        use: {
            baseURL: process.env.NUXT_TEST_HOST,
            trace: 'on-first-retry',
        },
        projects: opts.projects ?? [
            { name: 'chromium', use: { browserName: 'chromium' } },
        ],
        outputDir: '.playwright-mcp/test-results',
    };
}
