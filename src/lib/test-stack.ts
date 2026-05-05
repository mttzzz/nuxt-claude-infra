/*
 * test-stack.ts — defineTestStack с retry при port-conflict.
 *
 * Публичный API: defineTestStack(deps) → TestStackController { start, stop, current }.
 * Orchestrator: allocate-ports → build-image → compose-up → persist-handle → health-check.
 *
 * allocateWithRetry — DI-обёртка с retry при конфликте портов (до 3 попыток).
 * startTestStack — полный запуск (idempotent, re-use если handle file существует).
 * stopTestStack  — teardown (idempotent, no-op если handle не найден).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadProjectConfig } from '../config.js'
import {
  allocateSessionPorts,
  freeSessionPorts,
  resolveSessionId,
  SESSIONS_DIR,
  type SessionPorts,
} from './ports.js'
import {
  buildComposeEnv,
  buildTestServerImage,
  composeProjectName,
  startTestStackContainers,
  stopTestStackContainers,
} from './docker.js'

export interface TestStackHandle {
  sessionId: string
  /** Базовый URL test-сервера, напр. "http://127.0.0.1:3210". */
  host: string
  ports: SessionPorts
  composeProjectName: string
}

export interface TestStackDeps {
  /** Проектный teardown Drizzle/postgres-js — вызывается в stopTestStack. */
  disconnectDb?: () => Promise<void>
  /** Override imageTag (по умолчанию <dockerProjectPrefix>-server:latest). */
  imageTag?: string
  /** Build target для multi-stage Dockerfile. */
  buildTarget?: string
  /** Дополнительные --build-arg KEY=VALUE. */
  buildArgs?: Record<string, string>
}

/* DI-типы для unit-тестирования retry-логики без реального docker. */
export type PortAllocator = (sessionId: string) => Promise<SessionPorts>
export type ContainerStarter = (sessionId: string, ports: SessionPorts) => Promise<void>
/* PortFreer принимает и sync (void), и async (Promise<void>) реализации. */
export type PortFreer = (sessionId: string) => void | Promise<void>

export interface AllocateWithRetryOpts {
  allocator: PortAllocator
  starter: ContainerStarter
  freer: PortFreer
  maxAttempts: number
}

export interface TestStackController {
  start: () => Promise<TestStackHandle>
  stop: () => Promise<void>
  current: () => TestStackHandle | null
}

/* Паттерны ошибок docker, указывающие на конфликт порта. */
const PORT_CONFLICT_PATTERNS = [
  /port is already allocated/i,
  /address already in use/i,
  /bind for .* failed/i,
]

function isPortConflict(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return PORT_CONFLICT_PATTERNS.some((p) => p.test(msg))
}

/*
 * Аллоцирует порты и стартует контейнеры с retry при port-conflict.
 * При конфликте: freeSessionPorts → новая аллокация, до maxAttempts раз.
 * Не-port-conflict ошибки пробрасываются немедленно.
 */
export async function allocateWithRetry(
  sessionId: string,
  opts: AllocateWithRetryOpts,
): Promise<SessionPorts> {
  let lastError: unknown
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const ports = await opts.allocator(sessionId)
    try {
      await opts.starter(sessionId, ports)
      return ports
    } catch (err) {
      lastError = err
      if (!isPortConflict(err)) throw err
      /* Port-conflict: освободить аллокацию и повторить */
      await opts.freer(sessionId)
    }
  }
  throw lastError ?? new Error('allocateWithRetry: исчерпаны попытки без конкретной ошибки')
}

interface PersistedHandle {
  sessionId: string
  host: string
  ports: SessionPorts
  composeProjectName: string
  pid: number
}

function handleFilePath(sessionId: string): string {
  return join(SESSIONS_DIR, sessionId, 'test-stack.json')
}

function persistHandle(handle: TestStackHandle): void {
  const dir = join(SESSIONS_DIR, handle.sessionId)
  mkdirSync(dir, { recursive: true })
  const data: PersistedHandle = {
    sessionId: handle.sessionId,
    host: handle.host,
    ports: handle.ports,
    composeProjectName: handle.composeProjectName,
    pid: process.pid,
  }
  writeFileSync(handleFilePath(handle.sessionId), JSON.stringify(data, null, 2), 'utf8')
}

function loadHandle(sessionId: string): PersistedHandle | null {
  const path = handleFilePath(sessionId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PersistedHandle
  } catch {
    return null
  }
}

/*
 * Идемпотентно поднимает per-session test-stack.
 * Если handle file уже существует — re-use без повторного запуска.
 *
 * Шаги:
 *   1. resolveSessionId → fallback на "local-<pid>"
 *   2. loadProjectConfig
 *   3. buildTestServerImage (idempotent — пропускает если образ есть)
 *   4. allocateWithRetry → compose up
 *   5. persistHandle
 *   6. waitForReady — health-check GET /api/health/ready
 */
export async function startTestStack(deps: TestStackDeps = {}): Promise<TestStackHandle> {
  const sessionId = resolveSessionId() ?? `local-${process.pid}`
  const config = await loadProjectConfig()
  const imageTag = deps.imageTag ?? `${config.dockerProjectPrefix}-server:latest`

  /*
   * Idempotent re-use по handle file с liveness check (v0.5.0+).
   * Если предыдущая сессия упала без cleanup, handle file остаётся на диске.
   * Перед re-use пингуем host — если мёртв, удаляем stale handle и поднимаем
   * стек заново. Это предотвращает ECONNREFUSED в тестах после крашей.
   */
  const existing = loadHandle(sessionId)
  if (existing) {
    const alive = await isHandleAlive(existing.host, 3_000)
    if (alive) {
      return {
        sessionId: existing.sessionId,
        host: existing.host,
        ports: existing.ports,
        composeProjectName: existing.composeProjectName,
      }
    }
    /* Stale: handle file остался от мёртвой сессии — снимаем и продолжаем как с нуля. */
    try {
      rmSync(handleFilePath(sessionId), { force: true })
    } catch {
      /* swallow — non-existent file ок */
    }
  }

  /* Сборка образа (idempotent) */
  buildTestServerImage({
    imageTag,
    target: deps.buildTarget,
    buildArgs: deps.buildArgs,
  })

  /* Аллокация портов + запуск контейнеров с retry */
  const projectName = composeProjectName(config.dockerProjectPrefix, sessionId)
  const ports = await allocateWithRetry(sessionId, {
    allocator: allocateSessionPorts,
    starter: async (_sid, p) => {
      const env = buildComposeEnv({ ports: p, testDbName: config.testDbName, imageTag })
      startTestStackContainers({
        composeFile: config.paths.dockerCompose,
        projectName,
        env,
      })
    },
    freer: freeSessionPorts,
    maxAttempts: 3,
  })

  const host = `http://127.0.0.1:${ports.test}`
  const handle: TestStackHandle = { sessionId, host, ports, composeProjectName: projectName }
  persistHandle(handle)

  /* Дополнительный health-check (docker compose --wait уже дождался healthcheck'ов) */
  await waitForReady(host, 30_000)

  return handle
}

/*
 * Останавливает test-stack и снимает persisted handle.
 * Idempotent: если handle не найден — no-op.
 */
export async function stopTestStack(
  handleOrSessionId: TestStackHandle | string,
  deps: TestStackDeps = {},
): Promise<void> {
  const sessionId =
    typeof handleOrSessionId === 'string' ? handleOrSessionId : handleOrSessionId.sessionId

  const persisted = loadHandle(sessionId)
  if (!persisted) return /* Уже остановлен */

  /* Disconnect DB сначала, глотаем ошибки */
  if (deps.disconnectDb) {
    try {
      await deps.disconnectDb()
    } catch {
      /* swallow during teardown */
    }
  }

  const config = await loadProjectConfig()
  stopTestStackContainers({
    composeFile: config.paths.dockerCompose,
    projectName: persisted.composeProjectName,
  })

  /* Удалить persisted handle */
  try {
    rmSync(handleFilePath(sessionId), { force: true })
  } catch {
    /* swallow */
  }

  /* Освободить аллоцированные порты */
  await freeSessionPorts(sessionId)
}

/*
 * Factory-обёртка: deps хранятся один раз, возвращает start/stop/current.
 * Удобна в vitest/playwright globalSetup'ах:
 *
 *   const stack = defineTestStack({ disconnectDb })
 *   // globalSetup:
 *   const handle = await stack.start()
 *   // teardown:
 *   await stack.stop()
 */
export function defineTestStack(deps: TestStackDeps = {}): TestStackController {
  let handle: TestStackHandle | null = null
  return {
    async start() {
      handle = await startTestStack(deps)
      return handle
    },
    async stop() {
      if (handle) {
        const h = handle
        handle = null  /* Optimistic null — даже если stopTestStack throws, повторный stop() будет no-op */
        await stopTestStack(h, deps)
      }
    },
    current() {
      return handle
    },
  }
}

/*
 * Single-shot liveness check: одна попытка GET host/api/health/ready
 * с AbortController-таймаутом. Возвращает true только при HTTP 2xx.
 * Используется в startTestStack для проверки stale handle файла.
 */
export async function isHandleAlive(host: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${host}/api/health/ready`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/*
 * Polling health-check: GET host/api/health/ready каждые 500 мс.
 * Бросает если сервер не ответил ok за timeoutMs миллисекунд.
 */
async function waitForReady(host: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${host}/api/health/ready`)
      if (res.ok) return
      lastError = new Error(`/api/health/ready вернул ${res.status}`)
    } catch (err) {
      lastError = err
    }
    await new Promise<void>((r) => setTimeout(r, 500))
  }
  throw new Error(`test-server не готов за ${timeoutMs}ms: ${String(lastError)}`)
}
