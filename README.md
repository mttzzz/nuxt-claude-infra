# @mttzzz/nuxt-claude-infra

Shared Per-session Claude Code test infrastructure для Nuxt-проектов: port-registry, Playwright MCP server, hooks (PreToolUse / PostToolUse / SessionStart / SessionEnd), `commit:files`, `mine`, `stack:*`, `kill-zombies`.

Public-репо, MIT-лицензия. Не публикуется в npm — подключается напрямую с GitHub:

```sh
bun add github:mttzzz/nuxt-claude-infra#v0.4.0
# или
bun add git+https://github.com/mttzzz/nuxt-claude-infra.git#v0.4.0
```

## Архитектура

Описана в глобальном Claude-skill `~/.claude/skills/nuxt-test-infra/SKILL.md`. Кратко:

- 3 типа окружений в одной сессии: dev (общий, 3001), MCP per-session (3100-3199), test stack per-session (3200-3299, 3310-3399, 6400-6499).
- Port registry: `.claude/sessions/<sessionId>/ports.json`, alloc — first-free под глобальным lock'ом.
- sessionId resolution: env `CLAUDE_SESSION_ID` → walking-up по `ppid` → `.claude/sessions/by-harness/<harnessPid>.json`.

## Использование в проекте

```ts
// scripts/claude/mcp-url.ts (тонкая обёртка)
import { runMcpUrl } from '@mttzzz/nuxt-claude-infra'
import config from '../../.claude-infra.json' with { type: 'json' }
await runMcpUrl(config)
```

`.claude-infra.json` в корне проекта — `ProjectConfig` (см. `src/config.ts`).

## Локальная разработка

```sh
cd ~/projects/nuxt-claude-infra
bun install
bun typecheck
bun test
bun link              # link в локальный bun-registry

cd ~/projects/<project>
bun link @mttzzz/nuxt-claude-infra   # использовать локальную версию
# … правки …
bun unlink @mttzzz/nuxt-claude-infra && bun install   # обратно на git-pinned
```

## Версионирование

SemVer-теги `vX.Y.Z`. Проекты pin'ят конкретный тег через git+ssh URL. Major bump — при breaking changes в `ProjectConfig` schema или public API.

## v0.4 — Globalized API

В v0.4 пакет дополняется helpers и конфиг-пресетами для нулевой копипасты в проектах.

### `defineVitestPreset()`

```ts
// project: vitest.config.ts
import { defineVitestPreset } from '@mttzzz/nuxt-claude-infra/configs/vitest'
export default defineVitestPreset()
```

Создаёт три vitest-projects (unit/component/integration) с правильным `globalSetup` для integration. Под капотом — vitest v4 API (`fileParallelism: false` для integration вместо устаревшего `singleFork`).

### `definePlaywrightPreset()`

```ts
// project: playwright.config.ts
import { definePlaywrightPreset } from '@mttzzz/nuxt-claude-infra/configs/playwright'
export default definePlaywrightPreset()
```

### `startTestStack()` / `stopTestStack()` / `defineTestStack()`

`startTestStack()` идемпотентно поднимает per-session test-стек: allocate ports → build image → docker compose up → health-check. С автоматическим retry при port-conflict (max 3 попытки, без флага — всегда включено).

```ts
import { defineTestStack } from '@mttzzz/nuxt-claude-infra'

const stack = defineTestStack({
  disconnectDb: async () => { /* проектный Drizzle teardown */ },
})

const handle = await stack.start()
// handle.host = "http://127.0.0.1:3210", handle.ports, handle.sessionId
// ... тесты ...
await stack.stop()
```

### `templates/docker-compose.test.yml`

Базовый compose-template (`pgvector/pgvector:pg18` + `redis:7-alpine` + `test-server`) подключается из проектного compose через `include:`:

```yaml
# project: docker-compose.test.yml
include:
  - path: ./node_modules/@mttzzz/nuxt-claude-infra/templates/docker-compose.test.yml
services:
  test-server:
    environment:
      # только project-specific env-vars
      NUXT_EXCHANGE_RATE_API_URL: ${NUXT_EXCHANGE_RATE_API_URL}
```

Требует Docker Compose v2.20+ (для `include:` directive).

### Глобальные хуки в `~/.claude/settings.json`

В v0.4 хуки получили early-return на не-инфра проектах через `isInfraProject(cwd)`. Это позволяет регистрировать их **один раз глобально** в `~/.claude/settings.json` — они no-op'ят на проектах без `.claude-infra.json` или без зависимости `@mttzzz/nuxt-claude-infra` в package.json.

Установка глобально (для бинарников `nci-hook-*` в PATH):

```bash
bun install -g github:mttzzz/nuxt-claude-infra#v0.4.0
```

Регистрация хуков в `~/.claude/settings.json` — отдельный шаг (см. Plan 4 в `docs/superpowers/plans/`).

### Минимум проектных файлов после v0.4

| Файл | Назначение | Размер |
|---|---|---|
| `.claude-infra.json` | (опц.) override convention-defaults | ~10 строк |
| `vitest.config.ts` | `defineVitestPreset()` + project overrides | ~10 строк |
| `playwright.config.ts` | `definePlaywrightPreset()` + project overrides | ~10 строк |
| `docker-compose.test.yml` | `include:` template + project-specific env | ~15 строк |
| `test/helpers/db.ts` | проектная Drizzle schema + `TABLES_TO_TRUNCATE[]` | ~30 строк |
| `test/helpers/auth.ts` | (опц.) email-фикстуры + `loginAs` | ~30 строк |

Без копипасты `test-stack.ts` / `docker.ts` / `playwright-global-setup.ts` — всё в пакете.

## Статус

**v0.4.0** — stable. Generic test-helpers, конфиг-пресеты, docker-compose template вынесены из проектов в пакет.
Полная миграция трёх проектов (ai.pushka.biz, easy2.pushka.biz, kp.modmb.com) — отдельные планы (`docs/superpowers/plans/`).
