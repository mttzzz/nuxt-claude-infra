#!/usr/bin/env bun
// bun stack:ls — показать все per-session test-стеки.
import { listAllSessions } from '../lib/ports'

const sessions = listAllSessions()

if (sessions.length === 0) {
  process.stdout.write('Нет активных per-session стеков.\n')
  process.exit(0)
}

const header = ['sessionId', 'mcp', 'mcp.pid', 'test', 'test.pid', 'db', 'redis']
const rows = sessions.map((s) => [
  s.sessionId.slice(0, 20),
  String(s.ports.mcp),
  s.mcpPid ? `${String(s.mcpPid.pid)}${s.mcpPid.alive ? '' : ' ✗'}` : '-',
  String(s.ports.test),
  s.testPid ? `${String(s.testPid.pid)}${s.testPid.alive ? '' : ' ✗'}` : '-',
  String(s.ports.db),
  String(s.ports.redis),
])

const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)))

function pad(v: string, w: number): string {
  return v + ' '.repeat(Math.max(0, w - v.length))
}

const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i]!)).join('  ')

process.stdout.write(line(header) + '\n')
process.stdout.write(widths.map((w) => '-'.repeat(w)).join('  ') + '\n')
for (const row of rows) {
  process.stdout.write(line(row) + '\n')
}
process.stdout.write(`\n${String(sessions.length)} session(s). ✗ = pid мёртв (кандидат на \`bun stack:prune\`).\n`)
