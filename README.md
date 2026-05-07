# @mttzzz/nuxt-claude-infra

Per-session test infrastructure for Nuxt 4+ projects driven by [Claude Code](https://claude.com/claude-code). Lets multiple parallel Claude sessions in the same working tree run isolated docker test stacks without fighting over ports, container names, or temp files.

What you get:

- Per-session port registry (`.claude/sessions/<id>/ports.json`) with first-free allocation under a global lock.
- One-line vitest / Playwright presets that bring up a per-session docker stack (`pgvector/pgvector:pg18` + `redis:7-alpine` + your test image) and tear it down on session end.
- Long-running per-session Nuxt MCP server on its own port, for Playwright MCP and manual debugging against the dev DB.
- Globally-installed Claude Code hooks (PreToolUse / PostToolUse / SessionStart / SessionEnd) that activate only inside infra projects (no-op elsewhere).
- CLI binaries (`nci-*`) for ports, stack lifecycle, scoped commits, and zombie-process cleanup.

## Install

```sh
bun add -D @mttzzz/nuxt-claude-infra
# or
npm i -D @mttzzz/nuxt-claude-infra
```

For the global hooks + CLI binaries (one machine-wide install, all projects share it):

```sh
bun install -g @mttzzz/nuxt-claude-infra
```

## Quick start

### `vitest.config.ts`

```ts
import { defineVitestPreset } from '@mttzzz/nuxt-claude-infra/configs/vitest'

export default defineVitestPreset()
```

Creates three vitest projects (`unit`, `component`, `integration`). The integration project's `globalSetup` brings up the per-session docker stack and exposes its host via `NUXT_TEST_HOST`.

### `playwright.config.ts`

```ts
import { definePlaywrightPreset } from '@mttzzz/nuxt-claude-infra/configs/playwright'

export default definePlaywrightPreset()
```

Same lifecycle as the vitest preset — stack starts in `globalSetup`, tears down in `globalTeardown`.

### `docker-compose.test.yml`

Include the bundled template and add only project-specific env:

```yaml
include:
  - path: ./node_modules/@mttzzz/nuxt-claude-infra/templates/docker-compose.test.yml
services:
  test-server:
    environment:
      MY_PROJECT_FLAG: '1'
```

The template provides `postgres-test` (pgvector/pg18, tmpfs), `redis-test`, and a `test-server` that boots from your built image. Requires Docker Compose v2.20+ for `include:`.

### Programmatic stack control

```ts
import { defineTestStack } from '@mttzzz/nuxt-claude-infra'

const stack = defineTestStack({
  disconnectDb: async () => {
    /* project-side teardown, e.g. drizzle pool close */
  },
})

const handle = await stack.start()
// handle.host = "http://127.0.0.1:3210"
// handle.ports / handle.sessionId
await stack.stop()
```

`startTestStack` is idempotent and pings `/api/health/ready` on stale handles (3s timeout) — if a previous session crashed without cleanup, the dead handle is removed and a fresh stack comes up.

## CLI

After global install (or via project `node_modules/.bin`):

| Binary | Purpose |
|---|---|
| `nci-mcp-url` | Print the MCP server URL for the current session |
| `nci-mcp-server` | Start the per-session Nuxt MCP server on its allocated port |
| `nci-stack-ls` | List active per-session stacks |
| `nci-stack-kill <sessionId>` | Force-teardown a session's stack |
| `nci-stack-prune` | Remove session dirs without a live `by-harness/<pid>` link |
| `nci-kill-zombies` | Kill leftover `nuxi _dev` / `tinypool` / Playwright test-server processes |
| `nci-mine` | List files touched by the current session (diagnostic) |
| `nci-commit-files "<msg>" <files...>` | Commit only the listed files (parallel-session-safe) |

## Configuration

Most defaults are derived from the project directory name (e.g. `shop.example.com` → docker prefix `shop-example-test`, test DB `shop_example_test`, ports allocated from the standard ranges). Override only when convention doesn't fit:

```json
// .claude-infra.json
{
  "dockerProjectPrefix": "my-test",
  "testDbName": "my_test"
}
```

Standard ranges:

- MCP per-session: `3100–3199`
- test-server: `3200–3299`
- postgres-test: `3310–3399`
- redis-test: `6400–6499`

## Architecture (brief)

- **Three environments per session.** Shared dev server (3001), per-session MCP server (3100-range, dev DB), per-session test stack (docker, tmpfs DB, dummy secrets).
- **Session resolution.** Reads `CLAUDE_SESSION_ID` env, otherwise walks up `ppid` to the Claude harness process and reads `.claude/sessions/by-harness/<pid>.json` written by the SessionStart hook.
- **Port registry.** First free port from each range, persisted in `.claude/sessions/<id>/ports.json`. Lock-protected so parallel `allocateSessionPorts` calls don't collide.
- **Hook gating.** Hooks short-circuit on projects without `.claude-infra.json` and without `@mttzzz/nuxt-claude-infra` in `package.json`, so installing them globally is safe.

## License

MIT.
