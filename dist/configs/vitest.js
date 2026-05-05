/*
 * Стандартный vitest-конфиг для Nuxt-проектов с per-session инфрой.
 *
 * Создаёт три vitest-projects:
 *   - unit: environment 'nuxt', чистая логика
 *   - component: environment 'nuxt', тесты компонентов
 *   - integration: environment 'node', с globalSetup поднимающим test-stack
 *
 * Проектная vitest.config.ts:
 *   import { defineVitestPreset } from '@mttzzz/nuxt-claude-infra/configs/vitest'
 *   export default defineVitestPreset()
 */
export function defineVitestPreset(opts = {}) {
    const dirs = {
        unit: opts.testDirs?.unit ?? 'test/unit',
        component: opts.testDirs?.component ?? 'test/component',
        integration: opts.testDirs?.integration ?? 'test/integration',
    };
    const integrationGlobalSetup = [
        '@mttzzz/nuxt-claude-infra/configs/vitest-global-setup',
        ...(opts.extraGlobalSetup ?? []),
    ];
    return {
        test: {
            projects: [
                {
                    test: {
                        name: 'unit',
                        environment: 'nuxt',
                        include: [`${dirs.unit}/**/*.{test,spec}.ts`],
                    },
                },
                {
                    test: {
                        name: 'component',
                        environment: 'nuxt',
                        include: [`${dirs.component}/**/*.{test,spec}.ts`],
                    },
                },
                {
                    test: {
                        name: 'integration',
                        environment: 'node',
                        include: [`${dirs.integration}/**/*.{test,spec}.ts`],
                        globalSetup: integrationGlobalSetup,
                        /* Run all integration files in a single fork process (sequential). */
                        fileParallelism: false,
                    },
                },
            ],
        },
    };
}
