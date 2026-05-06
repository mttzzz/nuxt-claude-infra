import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { dirname, join } from 'node:path'

import { findHarnessPid } from './harness-pid.js'
import { listProcs } from './proc.js'

// Per-session аллокация портов для изолированной тестовой инфры.
// Каждая Claude-сессия получает ports.json в .claude/sessions/<sessionId>/,
// порты выбираются first-free-in-range под глобальным alloc-локом.
export interface SessionPorts {
  mcp: number
  test: number
  db: number
  redis: number
}

export const PORT_RANGES = {
  mcp: { start: 3100, end: 3199 },
  test: { start: 3200, end: 3299 },
  db: { start: 3310, end: 3399 },
  redis: { start: 6400, end: 6499 },
} as const

export type PortRole = keyof typeof PORT_RANGES

export const SESSIONS_DIR = '.claude/sessions'

/*
 * Per-harness pointer: SessionStart-хук пишет sessionId в by-harness/<harnessPid>.json,
 * где harnessPid — pid процесса claude (родитель и хука, и bash-подпроцессов).
 * Bash-команды ходят walking-up по ppid и находят свой harnessPid → читают свой файл.
 * Безопасно для параллельных сессий: у каждой свой claude.exe → свой pid → свой файл.
 *
 * Используется когда CLAUDE_SESSION_ID не пробрасывается harness'ом (Zed claude-acp bridge).
 * Нативный Claude Code-CLI выставляет env, fallback не активируется.
 */
export const SESSIONS_BY_HARNESS_DIR = join(SESSIONS_DIR, 'by-harness')

interface HarnessSessionFile {
  sessionId: string
  harnessPid: number
  writtenAt: number
}

function harnessFile(harnessPid: number): string {
  return join(SESSIONS_BY_HARNESS_DIR, `${String(harnessPid)}.json`)
}

export function writeSessionByHarness(harnessPid: number, sessionId: string): void {
  if (!harnessPid || harnessPid <= 0 || !sessionId) return
  mkdirSync(SESSIONS_BY_HARNESS_DIR, { recursive: true })
  const data: HarnessSessionFile = { sessionId, harnessPid, writtenAt: Date.now() }
  writeFileSync(harnessFile(harnessPid), JSON.stringify(data), 'utf8')
}

export function readSessionByHarness(harnessPid: number): string | null {
  const path = harnessFile(harnessPid)
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<HarnessSessionFile>
    return data.sessionId ?? null
  } catch {
    return null
  }
}

export function removeSessionByHarness(harnessPid: number): void {
  try {
    unlinkSync(harnessFile(harnessPid))
  } catch {
    // already gone
  }
}

/*
 * Чистит записи по pid'ам, которых больше нет в системе. Зовётся на SessionStart.
 * Зачем: если предыдущая сессия упала (kill -9), её SessionEnd-хук не отработал,
 * и by-harness/<pid>.json остаётся. Не критично, но накапливается.
 */
export function pruneStaleHarnessFiles(isPidAliveFn: (pid: number) => boolean = isPidAlive): void {
  if (!existsSync(SESSIONS_BY_HARNESS_DIR)) return
  for (const name of readdirSync(SESSIONS_BY_HARNESS_DIR)) {
    if (!name.endsWith('.json')) continue
    const pid = Number(name.slice(0, -'.json'.length))
    if (!Number.isFinite(pid) || pid <= 0) continue
    if (!isPidAliveFn(pid)) {
      try {
        rmSync(join(SESSIONS_BY_HARNESS_DIR, name), { force: true })
      } catch {
        // best-effort
      }
    }
  }
}

export function resolveSessionId(): string | null {
  const fromEnv = process.env.CLAUDE_SESSION_ID
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()

  const harnessPid = findHarnessPid({
    env: process.env,
    procs: listProcs(),
    selfPid: process.pid,
  })
  if (!harnessPid) return null
  return readSessionByHarness(harnessPid)
}

// Slug для docker-compose `-p <project>` и file-system путей.
// Docker требует [a-z0-9][a-z0-9_-]*, max 64. Держимся в 40.
export function slugSessionId(sessionId: string): string {
  const lower = sessionId.toLowerCase()
  // Needs prefix if first char is not alphanumeric AND not a hyphen
  // (leading hyphens will be stripped, but non-alnum non-hyphen chars signal "bad" start)
  const needsPrefix = lower.length === 0 || !/^[a-z0-9-]/.test(lower)
  let s = lower
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (needsPrefix) {
    s = 's-' + s
  }
  return s.slice(0, 40)
}

const ALLOC_LOCK = '.claude/port-alloc.lock'
const ALLOC_LOCK_TTL_MS = 10_000

function sessionDir(sessionId: string): string {
  return join(SESSIONS_DIR, sessionId)
}

function portsFile(sessionId: string): string {
  return join(sessionDir(sessionId), 'ports.json')
}

export function getSessionPorts(sessionId: string): SessionPorts | null {
  const path = portsFile(sessionId)
  if (!existsSync(path)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SessionPorts
  } catch {
    return null
  }
}

export function freeSessionPorts(sessionId: string): void {
  try {
    unlinkSync(portsFile(sessionId))
  } catch {
    // already gone
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function withAllocLock<T>(fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      mkdirSync(dirname(ALLOC_LOCK), { recursive: true })
      writeFileSync(ALLOC_LOCK, String(process.pid), { flag: 'wx' })
      break
    } catch {
      try {
        const stat = statSync(ALLOC_LOCK)
        if (Date.now() - stat.mtimeMs > ALLOC_LOCK_TTL_MS) {
          unlinkSync(ALLOC_LOCK)
          continue
        }
      } catch {
        // lock исчез — следующий круг заберёт
      }
      await sleep(30)
    }
  }
  try {
    return await fn()
  } finally {
    try {
      unlinkSync(ALLOC_LOCK)
    } catch {
      // already gone
    }
  }
}

function isBindable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

/*
 * На Windows docker-биндинги (0.0.0.0:port → container) НЕ держат listener на 127.0.0.1,
 * поэтому bind-проверка ошибочно говорит "free". Connect-проверка ловит docker-форвард:
 * если что-то принимает TCP — порт занят, даже если bind на 127.0.0.1 успешен.
 */
function isAccepting(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const sock = connect({ port, host: '127.0.0.1' })
    const done = (accepting: boolean) => {
      sock.destroy()
      resolve(accepting)
    }
    sock.setTimeout(150)
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.once('timeout', () => done(false))
  })
}

export async function isPortFree(port: number): Promise<boolean> {
  /* Сначала connect: если что-то принимает соединения — порт занят, дальше не смотрим.
     Параллельный run через Promise.all ломается self-connect race: наш собственный bind
     стартует listener раньше, чем connect успевает попытаться, и connect попадает
     в наш же временный сокет. */
  if (await isAccepting(port)) return false
  return isBindable(port)
}

async function findFirstFree(role: PortRole, excluded: Set<number>): Promise<number> {
  const { start, end } = PORT_RANGES[role]
  for (let p = start; p <= end; p++) {
    if (excluded.has(p)) continue
    if (await isPortFree(p)) return p
  }
  throw new Error(`Роль ${role}: диапазон ${String(start)}-${String(end)} исчерпан. Запусти \`bun stack:prune\`.`)
}

function collectOccupied(): Set<number> {
  const occupied = new Set<number>()
  if (!existsSync(SESSIONS_DIR)) return occupied
  for (const name of readdirSync(SESSIONS_DIR)) {
    const path = join(SESSIONS_DIR, name, 'ports.json')
    if (!existsSync(path)) continue
    try {
      const p = JSON.parse(readFileSync(path, 'utf8')) as SessionPorts
      occupied.add(p.mcp)
      occupied.add(p.test)
      occupied.add(p.db)
      occupied.add(p.redis)
    } catch {
      // скипаем битые ports.json
    }
  }
  return occupied
}

export async function allocateSessionPorts(sessionId: string): Promise<SessionPorts> {
  const existing = getSessionPorts(sessionId)
  if (existing) return existing

  return withAllocLock(async () => {
    const existing2 = getSessionPorts(sessionId)
    if (existing2) return existing2

    const occupied = collectOccupied()
    const ports: SessionPorts = {
      mcp: await findFirstFree('mcp', occupied),
      test: await findFirstFree('test', occupied),
      db: await findFirstFree('db', occupied),
      redis: await findFirstFree('redis', occupied),
    }
    const path = portsFile(sessionId)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(ports, null, 2), 'utf8')
    return ports
  })
}

export interface PidStatus {
  pid: number
  alive: boolean
}

export interface SessionSummary {
  sessionId: string
  ports: SessionPorts
  mcpPid: PidStatus | null
  testPid: PidStatus | null
}

function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    return code === 'EPERM'
  }
}

function readPidFile(path: string): PidStatus | null {
  if (!existsSync(path)) return null
  try {
    const pid = Number(readFileSync(path, 'utf8').trim())
    if (!Number.isFinite(pid) || pid <= 0) return null
    return { pid, alive: isPidAlive(pid) }
  } catch {
    return null
  }
}

export function listAllSessions(): SessionSummary[] {
  if (!existsSync(SESSIONS_DIR)) return []
  const out: SessionSummary[] = []
  for (const name of readdirSync(SESSIONS_DIR)) {
    const dir = join(SESSIONS_DIR, name)
    const ports = getSessionPorts(name)
    if (!ports) continue
    out.push({
      sessionId: name,
      ports,
      mcpPid: readPidFile(join(dir, 'mcp.pid')),
      testPid: readPidFile(join(dir, 'test.pid')),
    })
  }
  return out.sort((a, b) => a.sessionId.localeCompare(b.sessionId))
}
