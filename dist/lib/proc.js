// Кросс-платформенная работа с процессами: листинг + tree-kill.
//
// Win: wmic process get + taskkill /F /T
// Unix (mac/linux): ps -A + process.kill(-pid, 'SIGTERM') (group-kill)
//
// Один helper — четыре скрипта (kill-zombies, stack-kill, stack-prune, session-end) делят логику,
// чтобы при следующем portability-фиксе не было четырёх разных реализаций.
import { execFileSync, spawnSync } from 'node:child_process';
const IS_WINDOWS = process.platform === 'win32';
export function listProcs() {
    return IS_WINDOWS ? listProcsWindows() : listProcsUnix();
}
function listProcsWindows() {
    const raw = spawnSync('wmic', ['process', 'get', 'ProcessId,ParentProcessId,CommandLine', '/format:list'], {
        encoding: 'utf8',
    });
    if (raw.status !== 0)
        return [];
    const out = [];
    const blocks = raw.stdout.replaceAll('\r', '').split('\n\n');
    for (const block of blocks) {
        const cmdMatch = /^CommandLine=(.*)$/m.exec(block);
        const pidMatch = /^ProcessId=(\d+)$/m.exec(block);
        const ppidMatch = /^ParentProcessId=(\d+)$/m.exec(block);
        if (!pidMatch)
            continue;
        const pid = Number(pidMatch[1]);
        /*
         * pid=0 — System Idle Process на Windows. Нерелевантен для tree-kill/zombie-cleanup,
         * плюс в типе ProcInfo `0` используется как sentinel для отсутствующего ppid.
         */
        if (pid === 0)
            continue;
        out.push({
            pid,
            ppid: ppidMatch ? Number(ppidMatch[1]) : 0,
            cmd: cmdMatch?.[1] ?? '',
        });
    }
    return out;
}
function listProcsUnix() {
    const raw = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' });
    if (raw.status !== 0)
        return [];
    const out = [];
    for (const line of raw.stdout.split('\n')) {
        const m = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
        if (!m)
            continue;
        out.push({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] });
    }
    return out;
}
export function killTree(pid) {
    try {
        if (IS_WINDOWS) {
            execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
        }
        else {
            /*
             * process.kill(-pid) шлёт сигнал группе процессов.
             * ESRCH если pid не лидер группы → fallback на kill(pid).
             */
            try {
                process.kill(-pid, 'SIGTERM');
            }
            catch {
                process.kill(pid, 'SIGTERM');
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
