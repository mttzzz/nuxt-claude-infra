/* createUseSharedNuxt(setup) — factory для shared Nuxt setup в integration-тестах.
 *
 * SetupFn пробрасывается КОНСЬЮМЕРОМ (пакет НЕ импортит @nuxt/test-utils — peer не required,
 * иначе vitest-context резолвится из ДВУХ копий → setup() ломается с "failed to find current suite").
 *
 * Использование в проекте (test/helpers/use-shared-nuxt.ts):
 *   import { setup } from '@nuxt/test-utils/e2e'
 *   import { createUseSharedNuxt } from '@mttzzz/nuxt-claude-infra/host-stack'
 *   export const useSharedNuxt = createUseSharedNuxt(setup)
 *
 * Тогда в test файле:
 *   import { useSharedNuxt } from '~~/test/helpers/use-shared-nuxt'
 *   await useSharedNuxt()
 *
 * NUXT_TEST_HOST выставляется vitest-fork-init / playwright fixture per-worker. */
export function createUseSharedNuxt(setup) {
    return async () => {
        const host = process.env.NUXT_TEST_HOST;
        if (!host) {
            throw new Error('NUXT_TEST_HOST не выставлен — vitest globalSetup / fork-init / playwright fixture должен поднять test-stack первым');
        }
        await setup({ host });
    };
}
