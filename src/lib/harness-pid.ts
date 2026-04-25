// Walking up the parent-pid chain to find the Claude harness process (claude.exe / claude binary).
//
// Зачем: Zed claude-acp bridge не пробрасывает CLAUDE_SESSION_ID в bash-подпроцессы,
// поэтому хук и bun-команды должны независимо договориться о ключе для look-up sessionId.
// Общий ключ = pid harness'а — этот процесс уникален per-session (каждая Claude-сессия
// поднимает свой claude.exe), и И хук И bun-команды его потомки.
//
// Как: env CLAUDE_CODE_EXECPATH указывает на путь до claude-binary. Walking up по ppid
// от текущего процесса находим первого предка, чей `cmd` содержит этот путь — это harness.
import { basename } from 'node:path'

import type { ProcInfo } from './proc'

const MAX_DEPTH = 16

export interface FindHarnessPidDeps {
  env: Record<string, string | undefined>
  procs: ProcInfo[]
  selfPid: number
}

export function findHarnessPid(deps: FindHarnessPidDeps): number | null {
  const execPath = deps.env.CLAUDE_CODE_EXECPATH
  if (!execPath) return null

  const execPathLower = execPath.toLowerCase()
  const execBaseLower = basename(execPath).toLowerCase()

  const byPid = new Map<number, ProcInfo>()
  for (const p of deps.procs) byPid.set(p.pid, p)

  let pid: number | undefined = deps.selfPid
  const seen = new Set<number>()
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (pid === undefined || pid <= 0) return null
    if (seen.has(pid)) return null
    seen.add(pid)
    const proc = byPid.get(pid)
    if (!proc) return null

    const cmdLower = proc.cmd.toLowerCase()
    /*
     * Сначала проверяем full path (точный матч) — на случай, если в системе несколько claude-бинарей
     * (например, разные версии плагина в Zed). Если не сработал — пробуем basename'ом.
     */
    if (cmdLower.includes(execPathLower) || cmdLower.includes(execBaseLower)) {
      return pid
    }
    pid = proc.ppid
  }
  return null
}
