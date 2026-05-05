# Plan 2: ai.pushka.biz Migration to v0.4.0

> **Companion to Plan 1.** Migrates ai.pushka.biz to use v0.4.0 of `@mttzzz/nuxt-claude-infra` — drops local copies of helpers/configs that moved to the package, removes legacy MySQL MCP, adds `.claude-infra.json`.

**Goal:** ai.pushka.biz running на v0.4.0 пакета, тесты unit/integration/e2e зелёные, проектных infra-файлов минимум.

**Scope decision:** не используем `defineVitestPreset()` целиком (он не оборачивает unit/component через `@nuxt/test-utils/config defineVitestProject`, требуется для `environment: 'nuxt'` ergonomics). Заменяем только path-references — `globalSetup` интеграции и playwright'а на пакетные пути. Полное preset-replacement отложено до v0.5 когда preset'ы получат `defineVitestProject` integration.

**Out of scope (Plan 4):**
- Удаление `package.json scripts` (`mcp:*`, `stack:*`, `cleanup`, `kill:zombies`, `mine`, `commit:files`, `docker:prune*`).
- Удаление hook-блока из `.claude/settings.json`.
- Установка пакета глобально + регистрация хуков в `~/.claude/settings.json`.

## Changes

| File | Action | Notes |
|---|---|---|
| `package.json` | Update `@mttzzz/nuxt-claude-infra` v0.3.2 → v0.4.0 | `bun add` |
| `.claude-infra.json` | CREATE | `{ "dockerProjectPrefix": "ai-pushka-test", "testDbName": "ai_pushka_test" }` |
| `test/helpers/test-stack.ts` | DELETE | Moved to package as `defineTestStack` |
| `test/helpers/docker.ts` | DELETE | Moved to package |
| `test/helpers/e2e.ts` | DELETE | Moved to package as `useSharedNuxt` |
| `test/helpers/playwright-global-setup.ts` | DELETE | Replaced by package path |
| `test/helpers/playwright-global-teardown.ts` | DELETE | Replaced by package path |
| `test/helpers/setup-global.ts` | DELETE | Replaced by package path |
| `test/helpers/db.ts` | REWRITE | Use `truncateAllTables` + `disconnectClient` + `resolveTestDbPort` from package; keep project schema/relations/tables list |
| `test/helpers/auth.ts` | KEEP | Project-specific email constants |
| `test/helpers/seed-threads.ts` | KEEP | Custom seeder |
| `vitest.config.ts` | EDIT | `globalSetup: ['@mttzzz/nuxt-claude-infra/configs/vitest-global-setup']` (was `'test/helpers/setup-global.ts'`) |
| `playwright.config.ts` | EDIT | `globalSetup: '@mttzzz/nuxt-claude-infra/configs/playwright-global-setup'`, same for `globalTeardown` |
| `docker-compose.test.yml` | KEEP for now | Already uses pgvector/pg18; switch to `include:` pattern не нужен пока — local file работает. Defer to v0.5. |
| `.claude/settings.json` | EDIT | Remove `mcpServers.ai` (legacy MySQL MCP); remove `mcp__ai__*` from permissions; remove PreToolUse matcher on `mcp__ai__ai_sql_query`. Hooks stay until Plan 4. |
| Other `package.json` scripts | KEEP for now | Removed in Plan 4 cutover |

## After migration — must pass

```bash
cd ~/projects/ai.pushka.biz
bun typecheck
bun lint:fix
bun test:unit
bun test:integration   # spawns docker test-stack via package's defineTestStack
bun test:e2e            # playwright vs test-stack
```

Если что-то ломается — фиксить или (если bug в пакете) escalate.

## Commit strategy

Один коммит, явный список файлов через `bun commit:files`.

## Push

После зелёных тестов — `git push origin main` (blanket permission получено в текущей сессии).
