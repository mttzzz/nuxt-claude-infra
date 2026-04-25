export declare const DEFAULT_SESSIONS_DIR = ".claude/sessions";
export declare function readTouched(sessionsDir: string, sessionId: string): string[];
export declare function addTouched(sessionsDir: string, sessionId: string, filePath: string, cwd?: string): void;
export declare function clearTouched(sessionsDir: string, sessionId: string): void;
//# sourceMappingURL=touched.d.ts.map