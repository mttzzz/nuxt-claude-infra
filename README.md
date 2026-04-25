# @mttzzz/nuxt-claude-infra

Shared Per-session Claude Code test infrastructure для Nuxt-проектов: port-registry, Playwright MCP server, hooks (PreToolUse / PostToolUse / SessionStart / SessionEnd), `commit:files`, `mine`, `stack:*`, `kill-zombies`, `preview:*`.

**Не публикуется в npm.** Подключается через git+ssh:

```sh
bun add @mttzzz/nuxt-claude-infra@git+ssh://git@github.com:mttzzz/nuxt-claude-infra.git#v0.1.0
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

## Статус

`v0.0.1` — pre-release. Скелет + базовые `lib/` функции. Public API нестабилен, готовится к `v0.1.0` (extract завершён, мигрированы ai.pushka.biz и easy2.pushka.biz).
