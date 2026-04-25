import { readFileSync } from 'node:fs';
export function readHookInput() {
    const raw = readFileSync(0, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) {
        return { session_id: 'unknown', cwd: process.cwd(), hook_event_name: 'unknown' };
    }
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return { session_id: 'unknown', cwd: process.cwd(), hook_event_name: 'unknown' };
    }
}
export function writeJson(output) {
    process.stdout.write(JSON.stringify(output));
}
export function denyPreToolUse(reason) {
    writeJson({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    });
    process.exit(0);
}
export function sessionStartContext(context) {
    writeJson({
        hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: context,
        },
    });
    process.exit(0);
}
export function silentExit() {
    process.exit(0);
}
