# @mttzzz/nuxt-claude-infra

Test infrastructure + Claude Code session hooks для Nuxt-проектов.

## Что внутри

### `host-stack` — параллельный test-стек

Per-worker DB (`{dbBase}_w{1..N}`) + N preview-серверов параллельно (port `portBase+1..portBase+N`).
Каждый worker полностью изолирован: своя БД, свой Redis db, свой порт. Тестовый прогон масштабируется ×N.

**Архитектура:**

1. `bun preview:test` (foreground в отдельном терминале):
   - Hash inputs (`server/`, `app/`, `shared/`, `modules/` + key configs) → если изменилось, `bun nuxt build`
   - `ensureTestDb` worker 1 + `drizzle-kit migrate`
   - Клон в worker 2..N через `CREATE DATABASE TEMPLATE` (быстро vs N×migrate)
   - Spawn N процессов `bun run .output/server/index.mjs` с per-worker env (port, POSTGRES_URL, REDIS_DB)
   - Wait for all `/api/health/ready` → READY

2. `bun test:integration` (или e2e) — другой терминал:
   - vitest globalSetup → `ensureTestStack` (повторно проверяет health, миграции через hash-cache no-op)
   - Per-fork `setupFiles` → выставляет `NUXT_TEST_HOST` по `VITEST_POOL_ID` (modulo на N)
   - Каждый fork целится в свой preview-сервер + свою БД (через `resolveWorkerId`)

**Безопасность (важно):** `buildTestServerEnv` НЕ пробрасывает `process.env` — иначе тесты могут случайно
слать реальные емейлы через прод Resend / Telegram / etc. Test-сервер получает только:
- safe system vars (PATH, HOME, SHELL, TZ)
- dummy NUXT_* из `.env.test` проекта
- per-worker DB / port / Redis db
- осознанный `envWhitelist` (например, для read-only внутренних API)

См. `src/host-stack/define-config.ts:buildServerEnv` + tests `host-stack-server-env.test.ts`.

### Quick start

5 файлов в проекте, ~25 строк всего:

```ts
// scripts/test-host-stack/config.ts
import { defineHostStackConfig } from '@mttzzz/nuxt-claude-infra/host-stack'
export const hostStack = defineHostStackConfig({
  dbBase: 'my_app_test',
  portBase: 3100,
  redisDbBase: 10,
  envWhitelist: ['NUXT_INTERNAL_API_SECRET'], // optional
})

// scripts/test-host-stack/preview-test.ts
import { runPreviewTest } from '@mttzzz/nuxt-claude-infra/host-stack'
import { hostStack } from './config'
await runPreviewTest(hostStack)

// test/helpers/db.ts
import { createTestDb } from '@mttzzz/nuxt-claude-infra/host-stack/db'
import type { drizzle } from 'drizzle-orm/postgres-js'
import { hostStack } from '~~/scripts/test-host-stack/config'
import { relations } from '~~/server/db/relations'
import * as schema from '~~/server/db/schema'

type DB = ReturnType<typeof drizzle<typeof schema, typeof relations>>
export const { testDb, truncateAll, disconnectTestDb } = createTestDb<DB>({
  ctx: hostStack,
  schema,
  relations,
  tables: ['users', 'companies', /* ... */] as const,
})

// test/helpers/use-shared-nuxt.ts
import { setup } from '@nuxt/test-utils/e2e'
import { createUseSharedNuxt } from '@mttzzz/nuxt-claude-infra/host-stack'
export const useSharedNuxt = createUseSharedNuxt(setup)

// test/setup/{vitest-global-setup, integration-fork-init, playwright-global-setup}.ts
// каждый — 3 строки: импорт + дефолт-экспорт create*Setup(hostStack)

// test/e2e/fixtures.ts (per-worker host)
import { expect, test as base } from '@nuxt/test-utils/playwright'
import { hostStack } from '~~/scripts/test-host-stack/config'

export const test = base.extend({
  nuxt: [
    async ({}, use, workerInfo) => {
      const workerId = workerInfo.parallelIndex + 1
      const host = hostStack.testServerUrl(workerId)
      process.env.NUXT_TEST_HOST = host
      await use({ host, browser: true, setupTimeout: 60_000 })
    },
    { scope: 'worker' },
  ],
})
export { expect }
```

**vitest.config.ts** integration project:

```ts
{
  name: 'integration',
  environment: 'node',
  include: ['test/integration/**/*.test.ts'],
  globalSetup: ['./test/setup/vitest-global-setup.ts'],
  setupFiles: ['./test/setup/integration-fork-init.ts'],
  pool: 'forks',
  maxWorkers: 4,
  fileParallelism: true,
  isolate: false,
  hookTimeout: 180_000,
  testTimeout: 30_000,
}
```

**playwright.config.ts:**

```ts
{
  workers: 4,
  fullyParallel: false, // file-level batching экономит browser contexts
  globalSetup: './test/setup/playwright-global-setup.ts',
}
```

**package.json:**

```json
"preview:test": "infisical run --env=dev -- bun scripts/test-host-stack/preview-test.ts"
```

### Запуск

```bash
# Терминал 1: спавнит 4 preview-сервера
bun preview:test

# Терминал 2: тесты идут параллельно
bun test:integration   # 4 forks × per-worker DB
bun test:e2e           # 4 playwright workers × per-worker host
```

Сменить число workers: `TEST_WORKERS=8 bun preview:test` (и тестовая команда тем же).

### Peer dependencies

- `drizzle-orm` ^1.0 (для `createTestDb`)
- `@nuxt/test-utils` ^4.0 (для setup factories + `createUseSharedNuxt`)
- `vitest` ^4.0 (для setup factories)
- `zod` ^4.0 (для config schema)

Все optional — нужны только если используешь соответствующий subpath.

## CLI binaries

- `nci-commit-files <message> <files...>` — git commit с явным списком файлов (защита от
  parallel-session race в одной ветке)
- `nci-kill-zombies` — прибирает зомби-процессы node/bun/chrome после тестов

## Claude Code hooks

- `nci-hook-session-start`, `nci-hook-session-end`, `nci-hook-pre-tool-use`, `nci-hook-post-tool-use`

Прописываются в `~/.claude/settings.json` для отслеживания Claude session lifecycle.

## Migration from v0.7

См. [CHANGELOG.md](./CHANGELOG.md).
