# Changelog

## v2.0.0 — drop bins / hooks / cli, pure TypeScript devDep

**BREAKING.** Пакет больше не содержит CLI-бинарников и Claude session hooks —
все они переехали в bash-скрипты в `~/.claude/scripts/` (commit-files, kill-zombies, sql-guard).
Глобальная установка пакета НЕ нужна. Чистый TS devDep.

### Removed

- All `bin` entries: `nci-commit-files`, `nci-kill-zombies`, `nci-hook-*` (4 hook bins)
- `src/cli/` (commit-files, kill-zombies)
- `src/hooks/` (session-start, session-end, pre-tool-use, post-tool-use)
- `src/lib/` (claude-input, commit-files-core, harness-pid, proc, ports, touched, etc.)
- `src/config.ts` (loadProjectConfig — нужен был только hooks)
- `zod` peer dep

### Migration from v1.x

В проектах:
1. Убрать `&& nci-kill-zombies` из `test:unit`/`test:component` scripts (или заменить
   на `&& bash ~/.claude/scripts/kill-zombies.sh` если нужно).
2. Если `commit-cmd` в `## Project parameters` ссылается на `nci-commit-files` —
   заменить на `bash ~/.claude/scripts/commit-files.sh "<msg>" <files...>`.
3. `bun update @mttzzz/nuxt-claude-infra` → `^2.0.0`.

В `~/.claude/`:
1. Убрать global install: `bun pm rm -g @mttzzz/nuxt-claude-infra`.
2. `~/.claude/settings.json` hooks — заменить ссылки на `nci-hook-*` на bash скрипты
   (см. `~/.claude/scripts/sql-guard.sh` — единственный нужный hook).
3. Skill `nuxt-test-infra` — удалить (целиком обсолетна).

## v1.0.0 — host-stack architecture

**BREAKING.** Полный отказ от docker per-session test-stack в пользу host-stack:
per-worker DB на локальном PG + N preview-серверов параллельно.

### Removed

- `cli/{mcp-url, mcp-server, mine, stack-ls, stack-kill, stack-prune}.ts`
  + bins `nci-mcp-*`, `nci-mine`, `nci-stack-*`
- `lib/{db, e2e, test-stack, docker}.ts`
- `configs/{vitest,playwright}-global-setup, playwright-global-teardown, playwright, vitest`
- `templates/docker-compose.test.yml`

### Added — `host-stack` module

- `defineHostStackConfig({ dbBase, portBase, redisDbBase?, envWhitelist?, ... })` — config builder
  с derived helpers (`testDbName`, `testPostgresUrl`, `testServerUrl`, `buildTestServerEnv`, etc.)
- `runPreviewTest(ctx)` — main CLI: build + spawn N preview-серверов параллельно
- `ensureTestStack(ctx)` / `ensureTestDb` / `runMigrationsIfNeeded` / `ensureSecondaryDbsFromPrimary`
  — orchestrator
- `createTestDb<TInstance>({ ctx, schema, relations, tables })` — factory per-worker drizzle pool
  + `truncateAll`
- `createUseSharedNuxt(setup)` — factory для shared Nuxt setup (consumer передаёт `setup` из
  `@nuxt/test-utils/e2e` — peer-dep, иначе vitest test-context ломается на двух копиях)
- `resolveWorkerId(workerCountDefault)` — vitest/playwright worker id resolution с modulo cap
- Setup factories: `createVitestGlobalSetup`, `createIntegrationForkInit`, `createPlaywrightGlobalSetup`

### Subpath exports

- `@mttzzz/nuxt-claude-infra/host-stack` — main API
- `@mttzzz/nuxt-claude-infra/host-stack/db` — `createTestDb`
- `@mttzzz/nuxt-claude-infra/host-stack/setup` — setup factories

### Peer dependencies

Все новые peer'ы — optional:
- `drizzle-orm` ^1.0 (для `createTestDb`)
- `@nuxt/test-utils` ^4.0 (для `createUseSharedNuxt`/setup factories)
- `vitest` ^4.0 (для setup factories)

### Migration from v0.7

```diff
# package.json
- "test:infra": "bun test test/infra"
+ "preview:test": "infisical run --env=dev -- bun scripts/test-host-stack/preview-test.ts"

# vitest.config.ts integration project
- globalSetup: ['@mttzzz/nuxt-claude-infra/configs/vitest-global-setup'],
+ globalSetup: ['./test/setup/vitest-global-setup.ts'],
+ setupFiles: ['./test/setup/integration-fork-init.ts'],
+ pool: 'forks', maxWorkers: 4, fileParallelism: true, isolate: false,
- pool: 'forks', singleFork: true, isolate: true,

# playwright.config.ts
- globalSetup: '@mttzzz/nuxt-claude-infra/configs/playwright-global-setup',
+ globalSetup: './test/setup/playwright-global-setup.ts',
+ workers: 4, fullyParallel: false,
- workers: 1,

# test/helpers/db.ts
- import { truncateAllTables, disconnectClient, resolveTestDbPort } from '@mttzzz/nuxt-claude-infra/lib/db'
+ import { createTestDb } from '@mttzzz/nuxt-claude-infra/host-stack/db'
+ export const { testDb, truncateAll, disconnectTestDb } = createTestDb({ ctx, schema, relations, tables })

# Drop docker-compose.test.yml + test/infra/* (vendor tests).
```

См. project's CLAUDE.md for project-specific config / DB names / port-base.

## v0.7.5 (legacy)

Per-session docker test-stack с port-registry + Playwright MCP server.
Supported docker-compose-based isolation для multiple parallel Claude sessions.
