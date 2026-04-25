import { spawnSync } from 'node:child_process';
export function currentBranch(cwd = process.cwd()) {
    try {
        const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (result.status !== 0) {
            return null;
        }
        const out = (result.stdout ?? '').trim();
        if (!out || out === 'HEAD') {
            return null;
        }
        return out;
    }
    catch {
        return null;
    }
}
