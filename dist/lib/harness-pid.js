// Walking up the parent-pid chain to find the Claude harness process (claude.exe / claude binary).
//
// Зачем: Zed claude-acp bridge / Cursor / VSCode-extension не пробрасывают CLAUDE_SESSION_ID
// в bash-подпроцессы, поэтому хук и bun-команды должны независимо договориться о ключе для
// look-up sessionId. Общий ключ = pid общего предка per-session (своего на каждую Claude-сессию).
//
// Как:
//  1) env CLAUDE_CODE_EXECPATH указывает на путь до claude-binary. Walking up по ppid
//     от текущего процесса находим первого предка, чей `cmd` содержит этот путь — это harness.
//  2) Fallback (Zed claude-agent-sdk и host'ы, где claude.exe не виден в proc tree):
//     ищем самого верхнего ancestor, который НЕ системный (не Zed/VSCode/Cursor/explorer/init).
//     В рамках одной Claude-сессии и hook, и bun-подпроцесс делят общую цепочку предков —
//     первый non-system после системного host'а у них совпадёт.
import { basename } from 'node:path';
const MAX_DEPTH = 32;
/*
 * Корневые pid'ы, на которых walking-up должен останавливаться (не годятся как harness).
 *  - 0: System Idle Process (Windows)
 *  - 1: init / launchd / wininit
 *  - 4: System (Windows kernel)
 */
const ROOT_PIDS = new Set([0, 1, 4]);
/*
 * Имена процессов, которые НЕ годятся как harness, даже если они alive и в цепочке предков:
 * это long-running системные/IDE-процессы, общие для всех Claude-сессий пользователя.
 * Без этой фильтрации параллельные сессии в одном Zed/VSCode сошлись бы на одном PID.
 */
const SYSTEM_ANCESTOR_PATTERNS = [
    /(?:^|[\\/])explorer\.exe/i,
    /(?:^|[\\/])services\.exe/i,
    /(?:^|[\\/])winlogon\.exe/i,
    /(?:^|[\\/])wininit\.exe/i,
    /(?:^|[\\/])svchost\.exe/i,
    /(?:^|[\\/])launchd($|\s|[\\/])/i,
    /(?:^|[\\/])zed\.exe/i,
    /[\\/]Zed\.app[\\/]/,
    /(?:^|[\\/])Code\.exe/i,
    /[\\/]Code Helper/,
    /(?:^|[\\/])cursor\.exe/i,
    /[\\/]Cursor\.app[\\/]/,
    /(?:^|[\\/])windsurf\.exe/i,
];
function isSystemAncestor(cmd) {
    return SYSTEM_ANCESTOR_PATTERNS.some((re) => re.test(cmd));
}
export function findHarnessPid(deps) {
    const byPid = new Map();
    for (const p of deps.procs)
        byPid.set(p.pid, p);
    // Шаг 1 — exact match по CLAUDE_CODE_EXECPATH.
    const execPath = deps.env.CLAUDE_CODE_EXECPATH;
    if (execPath) {
        const execPathLower = execPath.toLowerCase();
        const execBaseLower = basename(execPath).toLowerCase();
        let pid = deps.selfPid;
        const seen = new Set();
        for (let i = 0; i < MAX_DEPTH; i++) {
            if (pid === undefined || pid <= 0 || ROOT_PIDS.has(pid))
                break;
            if (seen.has(pid))
                break;
            seen.add(pid);
            const proc = byPid.get(pid);
            if (!proc)
                break;
            const cmdLower = proc.cmd.toLowerCase();
            if (cmdLower.includes(execPathLower) || cmdLower.includes(execBaseLower)) {
                return pid;
            }
            pid = proc.ppid;
        }
    }
    // Шаг 2 — fallback: самый верхний non-system, non-root ancestor в цепочке.
    // В Zed claude-agent-sdk запускает SDK-процесс отдельно, bash через ppid до него не доходит,
    // но первый non-system top-of-chain pid у hook'а и bash'а совпадает.
    let pid = deps.selfPid;
    const seen = new Set();
    let lastEligible = null;
    for (let i = 0; i < MAX_DEPTH; i++) {
        if (pid === undefined || pid <= 0 || ROOT_PIDS.has(pid))
            break;
        if (seen.has(pid))
            break;
        seen.add(pid);
        const proc = byPid.get(pid);
        if (!proc)
            break;
        if (!isSystemAncestor(proc.cmd)) {
            lastEligible = pid;
        }
        pid = proc.ppid;
    }
    return lastEligible;
}
