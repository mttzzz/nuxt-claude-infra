export interface ClaudeHookInput {
    session_id: string;
    transcript_path?: string;
    cwd: string;
    hook_event_name: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    source?: string;
    permission_mode?: string;
    model?: string;
}
export declare function readHookInput(): ClaudeHookInput;
export interface PreToolUseDenyOutput {
    hookSpecificOutput: {
        hookEventName: 'PreToolUse';
        permissionDecision: 'deny';
        permissionDecisionReason: string;
    };
}
export interface SessionStartContextOutput {
    hookSpecificOutput: {
        hookEventName: 'SessionStart';
        additionalContext: string;
    };
}
export declare function writeJson(output: object): void;
export declare function denyPreToolUse(reason: string): void;
export declare function sessionStartContext(context: string): void;
export declare function silentExit(): void;
//# sourceMappingURL=claude-input.d.ts.map