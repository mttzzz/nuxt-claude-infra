#!/usr/bin/env node
// bun mcp:url — печатает URL mcp-server'а для текущей сессии.
// Если ports.json ещё не аллоцирован — аллоцирует (берёт первый свободный порт из диапазона).
// Выход: 0 при успехе, 1 если sessionId не определяется (ни env, ни pointer-файл).
import { allocateSessionPorts, resolveSessionId } from '../lib/ports.js'

const sessionId = resolveSessionId()
if (!sessionId) {
  process.stderr.write(
    '[mcp:url] sessionId не определён: нет CLAUDE_SESSION_ID, и harness-pid не нашёл pointer ' +
      'в .claude/sessions/by-harness/. Проверь, что SessionStart-хук отработал в этой сессии.\n',
  )
  process.exit(1)
}

const ports = await allocateSessionPorts(sessionId)
process.stdout.write(`http://127.0.0.1:${String(ports.mcp)}`)
