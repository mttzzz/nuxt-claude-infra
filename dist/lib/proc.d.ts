export interface ProcInfo {
    pid: number;
    ppid: number;
    cmd: string;
}
export declare function listProcs(): ProcInfo[];
export declare function killTree(pid: number): boolean;
//# sourceMappingURL=proc.d.ts.map