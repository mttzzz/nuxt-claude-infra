import { describe, expect, it } from 'bun:test'

import { findHarnessPid } from '../../src/lib/harness-pid'
import type { ProcInfo } from '../../src/lib/proc'

const env = (overrides: Record<string, string | undefined> = {}) => ({ ...overrides })

/*
 * Helper: shorthand для построения proc-tree.
 * Цепочка задаётся как массив [pid, cmd] от self вверх к корню.
 * ppid выводится автоматически: ppid[i] = pids[i+1].
 */
function chain(items: Array<[number, string]>): { procs: ProcInfo[]; selfPid: number } {
  const procs: ProcInfo[] = items.map((it, i) => ({
    pid: it[0],
    ppid: items[i + 1]?.[0] ?? 0,
    cmd: it[1],
  }))
  return { procs, selfPid: items[0]![0] }
}

describe('findHarnessPid — exact match по CLAUDE_CODE_EXECPATH', () => {
  it('возвращает pid процесса с claude.exe в cmd', () => {
    const { procs, selfPid } = chain([
      [1000, 'C:\\bun.exe x.ts'],
      [900, 'C:\\bash.exe'],
      [800, 'C:\\Users\\u\\AppData\\Local\\Claude\\claude.exe --resume'],
      [700, 'C:\\Windows\\explorer.exe'],
    ])
    const pid = findHarnessPid({ env: env({ CLAUDE_CODE_EXECPATH: 'C:\\Users\\u\\AppData\\Local\\Claude\\claude.exe' }), procs, selfPid })
    expect(pid).toBe(800)
  })

  it('matches by basename even when full path differs (multiple claude versions)', () => {
    const { procs, selfPid } = chain([
      [1000, 'bash'],
      [900, '/usr/local/bin/claude --resume xyz'],
      [1, '/sbin/init'],
    ])
    const pid = findHarnessPid({ env: env({ CLAUDE_CODE_EXECPATH: '/opt/anthropic/claude' }), procs, selfPid })
    expect(pid).toBe(900)
  })
})

describe('findHarnessPid — fallback (Zed/agent-sdk сценарий)', () => {
  it('возвращает первый non-system ancestor когда claude.exe не в цепочке', () => {
    // Zed: bash → bun → claude-agent-sdk daemon → zed.exe → explorer → init.
    const { procs, selfPid } = chain([
      [2000, 'C:\\Program Files\\bun.exe x.ts'],
      [1900, 'C:\\Program Files\\Git\\bash.exe'],
      [1800, 'C:\\Users\\u\\AppData\\Local\\Zed\\node\\node.exe claude-agent-sdk'],
      [1700, 'C:\\Users\\u\\AppData\\Local\\Programs\\Zed\\Zed.exe'],
      [1600, 'C:\\Windows\\explorer.exe'],
      [1, 'wininit'],
    ])
    const pid = findHarnessPid({
      env: env({ CLAUDE_CODE_EXECPATH: 'C:\\Users\\u\\AppData\\Local\\Zed\\node\\cache\\_npx\\xyz\\claude.exe' }),
      procs,
      selfPid,
    })
    // Не нашёл exact match → fallback. Top-most non-system ancestor = node.exe claude-agent-sdk (1800).
    expect(pid).toBe(1800)
  })

  it('параллельные сессии в одном Zed получают разные harnessPid', () => {
    // Сессия A: bash → bun → claude-agent-sdk-A (1800) → zed (1700)
    const sessionA = chain([
      [2000, 'bash A'],
      [1950, 'bun A'],
      [1800, 'node claude-agent-sdk A'],
      [1700, 'zed.exe'],
    ])
    // Сессия B: bash → bun → claude-agent-sdk-B (3800) → zed (1700)
    const sessionB = chain([
      [4000, 'bash B'],
      [3950, 'bun B'],
      [3800, 'node claude-agent-sdk B'],
      [1700, 'zed.exe'],
    ])

    const allProcs = [...sessionA.procs, ...sessionB.procs.filter((p) => !sessionA.procs.find((a) => a.pid === p.pid))]

    const pidA = findHarnessPid({ env: env({ CLAUDE_CODE_EXECPATH: 'claude.exe' }), procs: allProcs, selfPid: sessionA.selfPid })
    const pidB = findHarnessPid({ env: env({ CLAUDE_CODE_EXECPATH: 'claude.exe' }), procs: allProcs, selfPid: sessionB.selfPid })
    expect(pidA).toBe(1800)
    expect(pidB).toBe(3800)
    expect(pidA).not.toBe(pidB)
  })

  it('возвращает null когда selfPid не в proc-tree', () => {
    const procs: ProcInfo[] = [{ pid: 100, ppid: 1, cmd: 'something' }]
    const pid = findHarnessPid({ env: env(), procs, selfPid: 9999 })
    expect(pid).toBe(null)
  })

  it('пропускает root-pid (1) и Windows System Idle (0) при walking-up', () => {
    const { procs, selfPid } = chain([
      [500, 'bash'],
      [400, 'bun'],
      [1, 'init'],
      [0, 'System Idle'],
    ])
    const pid = findHarnessPid({ env: env(), procs, selfPid })
    expect(pid).toBe(400) // самый верхний non-system, non-root = bun
  })
})
