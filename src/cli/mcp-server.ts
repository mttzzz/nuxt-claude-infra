#!/usr/bin/env node
// bun mcp:server — Nuxt на per-session порту с dev-БД для Playwright MCP и ручной отладки.
//
// Порт выделяется через allocateSessionPorts(CLAUDE_SESSION_ID) → .claude/sessions/<id>/ports.json.
// БД: проектная dev-БД (Postgres, POSTGRES_URL из Infisical/.env) — shared между всеми сессиями.
// API-ключи из Infisical/.env (реальные, сервер бьёт в живой LLM).
// Идемпотентность: если на своём порту уже живой Nuxt — exit 0 без спавна.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isMainModule } from '../lib/is-main.js'
import { allocateSessionPorts, resolveSessionId, SESSIONS_DIR } from '../lib/ports.js'

const DEV_DB_KEYS = [
  'POSTGRES_URL',
  'NUXT_REDIS_HOST',
  'NUXT_REDIS_PORT',
  'NUXT_REDIS_PASSWORD',
  'NUXT_REDIS_DB',
]

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export interface McpServerEnvOptions {
  envFile?: string
  envTestFile?: string
  port: string
  /*
   * Источник env-vars поверх .env-файла. По умолчанию `process.env`.
   * При передаче — используется в тестах для изоляции.
   * Семантика merge: parseEnvFile(envFile) → processEnv (последний побеждает).
   */
  processEnv?: NodeJS.ProcessEnv | Record<string, string | undefined>
}

export function buildMcpServerEnv(options: McpServerEnvOptions): Record<string, string> {
  const fileEnv = parseEnvFile(options.envFile ?? '.env')
  const procEnvRaw = options.processEnv ?? process.env
  /* Отфильтровать undefined, привести к Record<string, string>. */
  const procEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(procEnvRaw)) {
    if (typeof value === 'string') procEnv[key] = value
  }
  const baseEnv = { ...fileEnv, ...procEnv }
  const testEnv = parseEnvFile(options.envTestFile ?? '.env.test')

  // .env (dev) → .env.test (overrides для secrets/flags) → но DB/Redis из .env побеждает всегда.
  const merged: Record<string, string> = { ...baseEnv, ...testEnv }
  for (const key of DEV_DB_KEYS) {
    if (baseEnv[key] !== undefined) {
      merged[key] = baseEnv[key]
    }
  }

  merged.PORT = options.port
  merged.BETTER_AUTH_URL = `http://localhost:${options.port}`
  return merged
}

async function isHealthy(port: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health/ready`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

if (isMainModule(import.meta)) {
  const sessionId = resolveSessionId()
  if (!sessionId) {
    process.stderr.write(
      '[mcp:server] sessionId не определён: нет CLAUDE_SESSION_ID, и harness-pid не нашёл pointer ' +
        'в .claude/sessions/by-harness/. Проверь, что SessionStart-хук отработал в этой сессии.\n',
    )
    process.exit(1)
  }

  const ports = await allocateSessionPorts(sessionId)
  const port = String(ports.mcp)

  if (await isHealthy(port)) {
    process.stdout.write(`[mcp:server] На :${port} уже живой Nuxt. Переиспользую.\n`)
    process.exit(0)
  }

  const env = buildMcpServerEnv({ port })
  process.stdout.write(`[mcp:server] Стартую Nuxt на :${port} (sessionId=${sessionId}, dev-БД).\n`)

  // shell: true чтобы Node на Windows нашёл `bunx.cmd` / `bunx.exe` через PATH;
  // без него child_process.spawn не разрешает .cmd-shim'ы.
  const proc = spawn('bunx', ['nuxi', 'dev', '--host', '127.0.0.1'], {
    env: { ...process.env, ...env, NO_COLOR: '1' },
    stdio: 'inherit',
    shell: true,
  })

  // Записываем pid — SessionEnd hook его прибьёт.
  const pidFile = join(SESSIONS_DIR, sessionId, 'mcp.pid')
  if (proc.pid) {
    writeFileSync(pidFile, String(proc.pid), 'utf8')
  }

  const exitCode: number = await new Promise((resolve) => {
    proc.on('exit', (code, signal) => {
      // signal без code → 128 + signal-number или 1 для SIGTERM.
      if (code !== null) resolve(code)
      else resolve(signal === 'SIGTERM' ? 0 : 1)
    })
    proc.on('error', () => resolve(1))
  })
  process.exit(exitCode)
}
