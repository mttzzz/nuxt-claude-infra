import type { ProcInfo } from './proc.js';
export interface FindHarnessPidDeps {
    env: Record<string, string | undefined>;
    procs: ProcInfo[];
    selfPid: number;
}
export declare function findHarnessPid(deps: FindHarnessPidDeps): number | null;
//# sourceMappingURL=harness-pid.d.ts.map