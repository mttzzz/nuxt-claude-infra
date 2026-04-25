// Чистая логика SessionEnd — тестируется без реального docker / kill.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { getSessionPorts, SESSIONS_BY_HARNESS_DIR, SESSIONS_DIR, slugSessionId } from '../lib/ports.js'

export interface SessionEndDeps {
  dockerDown: (projectName: string) => void
  killPid: (pid: number) => void
  /* Префикс docker-compose project-name (e.g. 'ai-pushka-test'). */
  dockerProjectPrefix: string
}

/*
 * Удаляет by-harness/*.json, в которых записан этот sessionId.
 * Зовётся в SessionEnd, чтобы не оставлять «зомби» pointer-файлы для уже мёртвой сессии.
 */
function pruneHarnessFilesForSession(sessionId: string): void {
  if (!existsSync(SESSIONS_BY_HARNESS_DIR)) return
  for (const name of readdirSync(SESSIONS_BY_HARNESS_DIR)) {
    if (!name.endsWith('.json')) continue
    const path = join(SESSIONS_BY_HARNESS_DIR, name)
    try {
      const data = JSON.parse(readFileSync(path, 'utf8')) as { sessionId?: string }
      if (data.sessionId === sessionId) {
        rmSync(path, { force: true })
      }
    } catch {
      // битый файл — оставляем; pruneStaleHarnessFiles в SessionStart его подберёт
    }
  }
}

function readPidFile(path: string): number | null {
  if (!existsSync(path)) return null
  const pid = Number(readFileSync(path, 'utf8').trim())
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

export function runSessionEndCleanup(sessionId: string, deps: SessionEndDeps): void {
  // Pointer-файл может существовать даже если per-session папка пуста — чистим в первую очередь.
  pruneHarnessFilesForSession(sessionId)

  const dir = join(SESSIONS_DIR, sessionId)
  if (!existsSync(dir)) return

  // Kill test-server / mcp-server если живы.
  for (const pidName of ['mcp.pid', 'test.pid']) {
    const pid = readPidFile(join(dir, pidName))
    if (pid !== null) {
      try {
        deps.killPid(pid)
      } catch {
        // best-effort
      }
    }
  }

  // Docker down — только если ports.json есть (значит стек мог быть поднят).
  const ports = getSessionPorts(sessionId)
  if (ports) {
    const project = deps.dockerProjectPrefix + '-' + slugSessionId(sessionId)
    try {
      deps.dockerDown(project)
    } catch {
      // best-effort
    }
  }

  // Удалить всю per-session директорию.
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort
  }
}
