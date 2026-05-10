/* Shared Nuxt setup для integration-тестов.
 * Вызывает @nuxt/test-utils/e2e setup() с host из NUXT_TEST_HOST,
 * который выставляется vitest-global-setup'ом или playwright-global-setup'ом
 * после старта test-stack. */
export async function useSharedNuxt(): Promise<void> {
  const host = process.env.NUXT_TEST_HOST
  if (!host) {
    throw new Error('NUXT_TEST_HOST не выставлен — globalSetup должен поднять test-stack первым')
  }
  /* Lazy-import чтобы пакет не тащил @nuxt/test-utils как hard-dep. */
  const { setup } = await import('@nuxt/test-utils/e2e')
  await setup({ host })
}
