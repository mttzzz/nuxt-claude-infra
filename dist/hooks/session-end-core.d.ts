export interface SessionEndDeps {
    dockerDown: (projectName: string) => void;
    killPid: (pid: number) => void;
    dockerProjectPrefix: string;
}
export declare function runSessionEndCleanup(sessionId: string, deps: SessionEndDeps): void;
//# sourceMappingURL=session-end-core.d.ts.map