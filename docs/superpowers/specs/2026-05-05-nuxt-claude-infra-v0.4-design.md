# nuxt-claude-infra v0.4 — Глобализация инфры и унификация трёх проектов

**Дата:** 2026-05-05
**Статус:** design (готов к написанию плана)
**Архитектурное решение:** Вариант 1 — глобальный CLI/хуки + dev-dep для импортов и конфиг-extends

## 1. Контекст

Три Nuxt-проекта пользователя (`ai.pushka.biz`, `easy2.pushka.biz`, `kp.modmb.com`) дрейфуют, несмотря на использование одного пакета `@mttzzz/nuxt-claude-infra` v0.3.2:

- `test/helpers/*.ts` копипастятся в каждом проекте (test-stack, docker, db, e2e, playwright global setup/teardown). Различаются префиксами docker-проекта и schema-импортами; всё остальное идентично.
- `.claude/settings.json` хуки несогласованы: ai имеет 4 хука, easy2 — 2, kp — 3. Префиксы команд тоже различаются (`./node_modules/.bin/nci-hook-*` vs bare `nci-hook-*`).
- `.claude-infra.json` есть только у kp.
- ai всё ещё использует MySQL MCP (legacy), хотя глобальный setup давно на Postgres.
- Образ Postgres различается: ai — `pgvector/pgvector:pg18`, easy2 и kp — `postgres:18-alpine`.
- Скил `nuxt-test-infra` ссылался на несуществующие команды `preview:branch`/`preview:reset` (исправлено отдельно).

Цель v0.4: вынести максимум кода в пакет, поставить пакет глобально на машине (плюс минимальная dev-dep в проекте — для TypeScript-импортов и `extends:` конфигов), привести три проекта к минимальному набору проектных файлов. ai становится эталоном; миграция: ai → kp → easy2.

## 2. Цели и не-цели

**Цели:**
- Сократить проектные test-infra файлы с ~600 строк до ~100 строк суммарно на проект.
- Регистрировать хуки **один раз** в `~/.claude/settings.json`, а не per-project. Хуки сами проверяют, инфра-проект ли это, иначе no-op.
- Один-командный апгрейд: `bun update -g @mttzzz/nuxt-claude-infra` обновляет CLI и хуки во всех проектах сразу.
- Образ БД везде `pgvector/pgvector:pg18` для единообразия.
- Удалить из ai legacy MySQL-MCP (он не нужен — глобальный Postgres MCP его покрывает).

**Не-цели (явно вне scope):**
- Реализация preview-веток (`preview:branch` / `preview:reset`). Откладываем до v0.5 после стабилизации v0.4.
- Шаблонный `nci init` для скаффолда новых проектов. Не требуется — миграция трёх существующих проектов закрывает потребность; новый проект будет редким событием.
- Перенос проектных Drizzle-схем в общий код. Невозможно по объективной причине (схемы разные).
- Cross-machine sync схемы пакета. Пакет уже синкается через GitHub-тэги; глобальная установка просто использует `bun install -g`.

## 3. Целевое состояние

### 3.1. Что переезжает в пакет (новое в v0.4)

| Из проектов | В пакет | Тип |
|---|---|---|
| `test/helpers/test-stack.ts` | `lib/test-stack.ts` → exports `defineTestStack(deps)` | API-функция |
| `test/helpers/docker.ts` | `lib/docker.ts` → exports `buildTestServerImage()`, `startTestStackContainers()`, `stopTestStackContainers()` с params `{ projectPrefix, imageTag, composeFile }` | Generic helpers |
| `test/helpers/e2e.ts` | `lib/e2e.ts` → exports `useSharedNuxt()` | 1:1 перенос |
| `test/helpers/playwright-global-setup.ts`, `playwright-global-teardown.ts` | `configs/playwright-global-setup.ts`, `configs/playwright-global-teardown.ts` | 1:1 перенос |
| `test/helpers/setup-global.ts` | `configs/vitest-global-setup.ts` | 1:1 перенос |
| `vitest.config.ts` (структура) | `configs/vitest.ts` → exports `defineVitestPreset(opts)` | Preset-фабрика |
| `playwright.config.ts` (структура) | `configs/playwright.ts` → exports `definePlaywrightPreset(opts)` | Preset-фабрика |
| `docker-compose.test.yml` (общая часть) | `templates/docker-compose.test.yml` | YAML-файл для `include:` |

### 3.2. Что физически остаётся в проекте (минимум)

```
<project>/
├── .claude-infra.json               # 5-10 строк, project-specific
├── .claude/
│   └── settings.json                # только проектные permissions (если нужны), БЕЗ hooks
├── docker-compose.test.yml          # ~15 строк: include + project-specific env
├── vitest.config.ts                 # ~10 строк: defineVitestPreset({ overrides })
├── playwright.config.ts             # ~10 строк: definePlaywrightPreset({ overrides })
├── test/
│   ├── helpers/
│   │   ├── db.ts                    # ~30 строк: testDb(), TABLES_TO_TRUNCATE[]
│   │   ├── auth.ts                  # ~30 строк: loginAs() + project email constants
│   │   └── seed-*.ts                # custom seeders (опционально)
│   ├── fixtures/
│   │   └── ids.ts                   # email константы и тестовые ID
│   ├── unit/                        # тесты
│   ├── integration/                 # тесты
│   └── e2e/                         # тесты
├── package.json                     # dep "@mttzzz/nuxt-claude-infra": "github:...#v0.4.x"
                                     # scripts: только проектные test:*, без mcp:*/stack:*/cleanup
└── (... проектный код ...)
```

**Суммарно проектных infra-файлов:** ~5 файлов / ~100 строк против текущих ~10 файлов / ~600 строк.

### 3.3. Что переезжает в `~/.claude/settings.json` (per-machine)

Глобальные хуки регистрируются **один раз** при `bun ~/.claude/setup.mjs`. Существующие хуки (`auto-commit-hook.mjs`, `session-start-sync.mjs`) остаются — они не относятся к infra. Целевая структура `~/.claude/settings.json hooks`:

```json
{
  "hooks": {
    "SessionStart": [
      { "command": "node ~/.claude/bin/session-start-sync.mjs" },
      { "command": "nci-hook-session-start" }
    ],
    "PreToolUse": [
      { "matcher": ".*", "command": "nci-hook-pre-tool-use" }
    ],
    "PostToolUse": [
      { "matcher": ".*", "command": "node ~/.claude/bin/auto-commit-hook.mjs" },
      { "matcher": "Write|Edit|MultiEdit|NotebookEdit", "command": "nci-hook-post-tool-use" }
    ],
    "SessionEnd": [
      { "command": "nci-hook-session-end" }
    ]
  }
}
```

Каждый `nci-hook-*` early-return'ит, если в `process.cwd()` нет ни `.claude-infra.json`, ни `@mttzzz/nuxt-claude-infra` в `package.json` — для не-инфра проектов хук no-op. Логика реализуется в `lib/is-infra-project.ts`. Setup-скрипт при добавлении хуков проверяет existing entries по `command`-строке и не дублирует.

## 4. Public API пакета v0.4

### 4.1. `defineTestStack(deps)` — главная factory

```ts
// в пакете: src/lib/test-stack.ts
import type { Drizzle } from 'drizzle-orm'  // generic-параметр

export interface TestStackDeps {
  /** Project-specific Drizzle teardown — вызывается в SessionEnd. */
  disconnectDb: () => Promise<void>
}

export interface TestStackHandle {
  sessionId: string
  host: string  // напр. "http://127.0.0.1:3203"
  ports: SessionPorts
}

/**
 * Идемпотентно поднимает per-session test-стек:
 * 1. allocateSessionPorts()
 * 2. buildTestServerImage() (если ещё нет)
 * 3. startTestStackContainers()
 * 4. health-check на test-server
 * 5. persist handle в .claude/sessions/<id>/test-stack.json
 *
 * Регистрирует teardown через process.on('exit').
 */
export async function startTestStack(deps: TestStackDeps): Promise<TestStackHandle>

export async function stopTestStack(handle: TestStackHandle): Promise<void>
```

Параметры docker-операций (`projectPrefix`, `imageTag`, `composeFile`) читаются из `.claude-infra.json` через `loadProjectConfig()`, не передаются явно.

### 4.2. Конфиг-пресеты

```ts
// configs/vitest.ts
import { defineConfig } from 'vitest/config'

export interface VitestPresetOpts {
  /** Дополнительные projects (unit/component/integration). По умолчанию все три. */
  projects?: Array<'unit' | 'component' | 'integration'>
  /** Override poolOptions */
  poolOptions?: any
  /** Project-specific globalSetup (если нужен поверх стандартного) */
  extraGlobalSetup?: string[]
}

export function defineVitestPreset(opts?: VitestPresetOpts): ReturnType<typeof defineConfig>
```

Аналогично для `configs/playwright.ts`.

### 4.3. Generic db-хелперы

```ts
// lib/db.ts (новый)
export function resolveTestDbPort(sessionId?: string): number
export async function truncateAllTables(client: PostgresClient, tableNames: string[]): Promise<void>
export async function disconnectClient(client: PostgresClient): Promise<void>
```

Проектный `test/helpers/db.ts` использует их + project-specific schema:

```ts
// project: test/helpers/db.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { resolveTestDbPort, truncateAllTables, disconnectClient } from '@mttzzz/nuxt-claude-infra/lib/db'
import { schema, relations } from '~~/server/db'

const TABLES_TO_TRUNCATE = ['users', 'sessions', /* ... */]

let _client: ReturnType<typeof postgres> | null = null

export function testDb() {
  if (!_client) {
    _client = postgres(`postgresql://test:test@127.0.0.1:${resolveTestDbPort()}/<project>_test`)
  }
  return drizzle({ client: _client, schema, relations, casing: 'snake_case' })
}

export const truncateAll = () => truncateAllTables(_client!, TABLES_TO_TRUNCATE)
export const disconnectTestDb = () => _client ? disconnectClient(_client) : Promise.resolve()
```

### 4.4. Docker-compose template

`templates/docker-compose.test.yml` в пакете:

```yaml
services:
  postgres-test:
    image: pgvector/pgvector:pg18
    tmpfs: ["/var/lib/postgresql/data"]
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: ${TEST_DB_NAME}
    ports:
      - "${POSTGRES_PORT}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test -d ${TEST_DB_NAME}"]
      interval: 1s
      timeout: 5s
      retries: 30

  redis-test:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT}:6379"

  test-server:
    image: ${IMAGE_TAG}
    depends_on:
      postgres-test: { condition: service_healthy }
      redis-test: { condition: service_started }
    environment:
      POSTGRES_URL: postgresql://test:test@postgres-test:5432/${TEST_DB_NAME}
      REDIS_HOST: redis-test
      REDIS_PORT: 6379
      NODE_ENV: test
      SENTRY_DISABLED: 1
      NUXT_TEST_MODE: 1
      PORT: 3000
      NO_COLOR: 1
      CI: 1
    ports:
      - "${TEST_SERVER_PORT}:3000"
    healthcheck:
      test: ["CMD-SHELL", "wget --spider -q http://localhost:3000/api/health/ready || exit 1"]
      interval: 1s
      timeout: 5s
      retries: 60
```

Проектный `docker-compose.test.yml`:

```yaml
include:
  - path: ./node_modules/@mttzzz/nuxt-claude-infra/templates/docker-compose.test.yml
services:
  test-server:
    environment:
      # ТОЛЬКО project-specific env (амоCRM URL, банковские API и т.п.)
      NUXT_EXCHANGE_RATE_API_URL: ${NUXT_EXCHANGE_RATE_API_URL:-https://api.example.com}
```

Все `${TEST_DB_NAME}`, `${IMAGE_TAG}`, `${POSTGRES_PORT}`, `${REDIS_PORT}`, `${TEST_SERVER_PORT}` подставляются через env-vars, которые экспортирует `startTestStackContainers()` из аллоцированных портов и из `.claude-infra.json`.

## 5. Глобальная установка пакета

### 5.1. Установка на машине

```bash
bun install -g github:mttzzz/nuxt-claude-infra#v0.4.0
```

Это кладёт `nci-hook-*` бинарники в `~/.bun/bin/` (на Mac/Linux) или `%USERPROFILE%\.bun\bin\` (Windows), которые уже в PATH.

### 5.2. Регистрация хуков

`~/.claude/setup.mjs` дополняется блоком:

```js
// pseudo:
// 1. Идемпотентно: bun install -g github:mttzzz/nuxt-claude-infra#vX.Y
// 2. Идемпотентно: добавить hooks в ~/.claude/settings.json
//    (не дубликаты — проверять по command-строке)
```

После v0.4 на новой машине: `bun ~/.claude/setup.mjs` ставит и Postgres MCP, и infra-пакет, и хуки. Работает идемпотентно — re-run не ломает существующее состояние.

### 5.3. Версионная связка

Проектный `package.json` pin'ит конкретный тег: `"github:mttzzz/nuxt-claude-infra#v0.4.0"`. Глобальная установка тоже на конкретный тег. Best practice: версии совпадают (один источник истины — мажор/минор).

При расхождении: проектные импорты используют свою версию (что лежит в проектных `node_modules`), хуки — глобальную. Если рассинхрон вызовет проблему — версии нужно явно выровнять. Реальный риск низкий: ABI хуков и lib стабильны, breaking-changes идут через мажор.

## 6. Шаги миграции

### Шаг 0: Pre-flight

- Все три проекта на main с зелёным CI и без uncommitted изменений в `test/helpers/*`, `vitest.config.ts`, `playwright.config.ts`, `docker-compose.test.yml`, `.claude/settings.json`. Если есть — закоммитить или stash.
- Локальный pgsync для всех трёх проектов свежий (для интеграционных и e2e тестов).

### Шаг 1: Реализовать v0.4 в пакете

- Добавить `lib/test-stack.ts`, `lib/docker.ts` (расширенный), `lib/db.ts`, `lib/e2e.ts`, `lib/is-infra-project.ts`.
- Добавить `configs/vitest.ts`, `configs/playwright.ts`, `configs/vitest-global-setup.ts`, `configs/playwright-global-setup.ts`, `configs/playwright-global-teardown.ts`.
- Добавить `templates/docker-compose.test.yml`.
- Расширить exports в `package.json` (новые subpaths `./configs/*`, `./templates/*`).
- Хуки (`hooks/*-core.ts`) обновить так, чтобы они проверяли `is-infra-project` и no-op'или для не-инфра cwd.
- Покрыть всё юнит-тестами в `test/` пакета (vitest или bun:test).
- Bump version → 0.4.0, тег `v0.4.0`.

### Шаг 2: Локальный smoke на эталоне (ai)

- В `~/projects/nuxt-claude-infra` сделать `bun link`.
- В `~/projects/ai.pushka.biz` сделать `bun link @mttzzz/nuxt-claude-infra` (override на локальный).
- Создать новые конфиги (vitest.config / playwright.config / docker-compose.test.yml) в новом виде, удалить переехавшие хелперы.
- Создать `.claude-infra.json` (добавить — у ai его нет).
- Удалить из ai/`.claude/settings.json` секции `hooks` и `mcpServers` (MySQL legacy).
- Прогнать unit / integration / e2e. Зелёный — переход на тэг `v0.4.0` в проектном `package.json`.
- Любые баги → правка пакета → re-link → ретест.

### Шаг 3: Миграция kp

- `bun add github:mttzzz/nuxt-claude-infra#v0.4.0`.
- Удалить переехавшие helpers и старые scripts из `package.json`.
- Адаптировать `.claude-infra.json` (он уже есть).
- Удалить из `.claude/settings.json` hooks-секцию.
- Прогнать тесты.

### Шаг 4: Миграция easy2

То же, что для kp. Дополнительно: проверить, что `freeSessionPorts()` retry-логика, которая сейчас живёт в проектном `test-stack.ts`, корректно перенесена в пакет и активируется опцией.

### Шаг 5: Глобальная установка

- В `~/.claude/setup.mjs` добавить блок установки пакета и регистрации хуков.
- Запустить `bun ~/.claude/setup.mjs` на текущей машине.
- Проверить, что хуки в `~/.claude/settings.json` зарегистрированы и не дублируются.
- Удалить per-project hooks из `.claude/settings.json` всех трёх проектов (это уже было в шагах 2-4, но финальная проверка).

### Шаг 6: Cross-machine

- Закоммитить и запушить `~/.claude/setup.mjs` (auto-commit-hook это сделает сам).
- На второй машине (Happymonster или Mac, в зависимости от того, где работали) запустить `bun ~/.claude/setup.mjs`.
- Smoke-test: открыть Claude session в `~/projects/ai.pushka.biz`, проверить `bun mcp:url` (или `nci mcp:url`), убедиться, что хуки сработали.

### Шаг 7: Финальный SKILL.md update

- В `nuxt-test-infra/SKILL.md` поправить «после v0.4» → «начиная с v0.4.0», убрать упоминания pre-v0.4 setup-флоу.
- В скиле обновить таблицу команд: оба варианта (`bun mcp:url` через проектный wrapper-script ИЛИ `nci mcp:url` напрямую через глобальный CLI). Рекомендация: проектные `bun mcp:*` сохранить как `package.json` алиасы для удобства, но тех, кто читает скил, направлять на `nci`-вариант.

## 7. Проверки на каждом шаге

После каждого шага миграции в каждом проекте:

- `bun typecheck` — без ошибок.
- `bun lint:fix` — без ошибок.
- `bun test:unit` (быстрый, без docker).
- `bun test:integration` — поднимает test-stack, прогоняет API-тесты.
- `bun test:e2e` — Playwright против test-stack.
- Открыть параллельную Claude-сессию в том же проекте, проверить что port-аллокация различается, оба MCP-сервера живут, ни один не убивает другой.
- Закрыть сессии, `nci stack:ls` пустой (SessionEnd-hooks отработали).

## 8. Риски и rollback

| Риск | Митигация | Rollback |
|---|---|---|
| `defineTestStack` API не покрывает edge case (например, easy2 retry на port-conflict) | Унит-тестами в пакете прежде, чем мигрировать ai. | Откат проекта на v0.3.2, оставить старые helpers |
| Глобальные хуки конфликтуют с проектными в первое время | Перед регистрацией в `~/.claude/settings.json` явно удалять hooks из per-project `.claude/settings.json`. Скриптом-чекером проверить. | Удалить hooks из `~/.claude/settings.json`, вернуть в проектные |
| `include:` в docker-compose требует Compose v2.20+ | Зафиксировать минимальную версию Docker в README пакета. У пользователя обе машины с актуальным Docker Desktop. | Использовать `extends:` (старее, доступен в v2.x) либо в `startTestStackContainers()` склеивать YAML программно |
| Удаление MySQL MCP из ai порвёт что-то | До удаления убедиться, что весь существующий код, использующий `mcp__ai__ai_sql_query`, переключён на глобальный Postgres MCP или прямые SQL-вызовы. | Вернуть блок в `.claude/settings.json` |
| Параллельные сессии: глобальный hook читает `.claude-infra.json` чужого cwd | Хуки получают cwd через Claude API hook input — это `cwd` именно своей сессии. Должно работать. Проверка на шаге 6. | Per-session проверка в самом хуке (читать `process.env.PWD` если несовпадает) |
| Глобальная и проектная версии пакета разъехались | Документация в README + лог-предупреждение в `nci-hook-session-start` если версии mismatch. | `bun update -g` на нужный тег |

## 9. Резолюция open questions

| # | Вопрос | Решение |
|---|---|---|
| 1 | Версионирование v0.4 | **Stable.** Minor changes — non-breaking. Breaking → v0.5. |
| 2 | `bun -g` или `npm -g` | **Только bun.** Mac и Windows-машины пользователя оба на bun. |
| 3 | Проектные `bun mcp:*` aliases | **Удаляем.** Единственный путь — `nci <command>` через глобальный CLI. Из проектных `package.json` уходят все скрипты `mcp:*`, `stack:*`, `cleanup`, `kill:zombies`, `mine`, `commit:files`, `docker:prune*`. Проектные CLAUDE.md обновляются: `commit-cmd: nci commit-files "<msg>" <files...>` (вместо `bun commit:files`). Скил `explicit-file-commits` подхватит новое значение из Project parameters. |
| 4 | MySQL MCP в ai | **Удаляем.** Из `ai.pushka.biz/.claude/settings.json` чистится секция `mcpServers` целиком (все запросы к dev-БД идут через глобальный Postgres MCP в `~/.claude.json`). Заодно убирается `PreToolUse`-matcher на `mcp__ai__ai_sql_query` — после удаления MCP он не нужен; глобальный `PreToolUse` от пакета сработает на любые MCP-tool матчеры из `mcpDevDbToolsPrefix` (если кто-то задаст). |
| 5 | `include:` vs `extends:` в docker-compose | **`include:`** Подтверждено: локальный `docker compose version` → v5.1.3 (≥v2.20, требуемого минимума для `include:`). |
| 6 | `freeSessionPorts()` retry | **Универсально, всегда включено.** Логика retry-on-port-conflict переезжает в `defineTestStack`/`startTestStackContainers` пакета без флага. Все три проекта получат одинаковую устойчивость к гонкам аллокации. |

## 10. После аппрува спека

→ переход в `superpowers:writing-plans` для создания пошагового плана исполнения. План будет ссылаться на этот документ как на source of design.
