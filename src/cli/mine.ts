#!/usr/bin/env bun
// bun mine — показать файлы, которые текущая Claude-сессия правила.
//
// Источник истины: `.claude/sessions/<sessionId>/touched.txt` (обновляется PostToolUse hook).
// SessionId: env CLAUDE_SESSION_ID → .claude/sessions/.current-session → mtime-fallback.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { resolveSessionId as resolveSessionIdFromPointer } from '../lib/ports'
import { DEFAULT_SESSIONS_DIR, readTouched } from '../lib/touched'

const sessionId = resolveSessionId()
if (!sessionId) {
  process.stdout.write(`[mine] Нет зарегистрированных сессий в ${DEFAULT_SESSIONS_DIR}\n`)
  process.exit(0)
}

const files = readTouched(DEFAULT_SESSIONS_DIR, sessionId)
if (files.length === 0) {
  process.stdout.write(`[mine] Сессия ${sessionId}: touched-список пуст.\n`)
  process.exit(0)
}

process.stdout.write(`[mine] Сессия ${sessionId} правила ${String(files.length)} файл(ов):\n`)
for (const f of files) {
  process.stdout.write(`  ${f}\n`)
}

function resolveSessionId(): string | null {
  const fromPointer = resolveSessionIdFromPointer()
  if (fromPointer) return fromPointer
  try {
    const entries = readdirSync(DEFAULT_SESSIONS_DIR)
    let latest: { name: string; mtime: number } | null = null
    for (const name of entries) {
      const full = join(DEFAULT_SESSIONS_DIR, name)
      const stat = statSync(full)
      if (!stat.isDirectory()) {
        continue
      }
      if (!latest || stat.mtimeMs > latest.mtime) {
        latest = { name, mtime: stat.mtimeMs }
      }
    }
    return latest?.name ?? null
  } catch {
    return null
  }
}
