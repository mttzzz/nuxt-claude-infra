// Чистая логика SessionStart: записать sessionId в by-harness/<harnessPid>.json,
// очистить stale-записи (от упавших ранее сессий), создать per-session директорию.
// Тестируется через DI (без реального listProcs / process.env).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { findHarnessPid, type FindHarnessPidDeps } from '../lib/harness-pid.js'
import { pruneStaleHarnessFiles, SESSIONS_DIR, writeSessionByHarness } from '../lib/ports.js'

export interface SessionStartDeps {
  env: Record<string, string | undefined>
  procs: FindHarnessPidDeps['procs']
  selfPid: number
  isPidAlive: (pid: number) => boolean
}

export interface SessionStartResult {
  harnessPid: number
  sessionDir: string
}

export function runSessionStart(sessionId: string, deps: SessionStartDeps): SessionStartResult | null {
  if (!sessionId || sessionId === 'unknown') return null

  pruneStaleHarnessFiles(deps.isPidAlive)

  const harnessPid = findHarnessPid({
    env: deps.env,
    procs: deps.procs,
    selfPid: deps.selfPid,
  })
  if (!harnessPid) return null

  writeSessionByHarness(harnessPid, sessionId)

  const sessionDir = join(SESSIONS_DIR, sessionId)
  mkdirSync(sessionDir, { recursive: true })

  return { harnessPid, sessionDir }
}
