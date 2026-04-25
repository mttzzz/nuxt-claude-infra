export interface SessionPorts {
    mcp: number;
    test: number;
    db: number;
    redis: number;
}
export declare const PORT_RANGES: {
    readonly mcp: {
        readonly start: 3100;
        readonly end: 3199;
    };
    readonly test: {
        readonly start: 3200;
        readonly end: 3299;
    };
    readonly db: {
        readonly start: 3310;
        readonly end: 3399;
    };
    readonly redis: {
        readonly start: 6400;
        readonly end: 6499;
    };
};
export type PortRole = keyof typeof PORT_RANGES;
export declare const SESSIONS_DIR = ".claude/sessions";
export declare const SESSIONS_BY_HARNESS_DIR: string;
export declare function writeSessionByHarness(harnessPid: number, sessionId: string): void;
export declare function readSessionByHarness(harnessPid: number): string | null;
export declare function removeSessionByHarness(harnessPid: number): void;
export declare function pruneStaleHarnessFiles(isPidAliveFn?: (pid: number) => boolean): void;
export declare function resolveSessionId(): string | null;
export declare function slugSessionId(sessionId: string): string;
export declare function getSessionPorts(sessionId: string): SessionPorts | null;
export declare function freeSessionPorts(sessionId: string): void;
export declare function allocateSessionPorts(sessionId: string): Promise<SessionPorts>;
export interface PidStatus {
    pid: number;
    alive: boolean;
}
export interface SessionSummary {
    sessionId: string;
    ports: SessionPorts;
    mcpPid: PidStatus | null;
    testPid: PidStatus | null;
}
export declare function listAllSessions(): SessionSummary[];
//# sourceMappingURL=ports.d.ts.map