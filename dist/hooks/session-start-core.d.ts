import { type FindHarnessPidDeps } from '../lib/harness-pid.js';
export interface SessionStartDeps {
    env: Record<string, string | undefined>;
    procs: FindHarnessPidDeps['procs'];
    selfPid: number;
    isPidAlive: (pid: number) => boolean;
}
export interface SessionStartResult {
    harnessPid: number;
    sessionDir: string;
}
export declare function runSessionStart(sessionId: string, deps: SessionStartDeps): SessionStartResult | null;
//# sourceMappingURL=session-start-core.d.ts.map