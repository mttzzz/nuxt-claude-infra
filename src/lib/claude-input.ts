import { readFileSync } from 'node:fs'

export interface ClaudeHookInput {
  session_id: string
  transcript_path?: string
  cwd: string
  hook_event_name: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  source?: string
  permission_mode?: string
  model?: string
}

export function readHookInput(): ClaudeHookInput {
  const raw = readFileSync(0, 'utf8')
  const trimmed = raw.trim()
  if (!trimmed) {
    return { session_id: 'unknown', cwd: process.cwd(), hook_event_name: 'unknown' }
  }
  try {
    return JSON.parse(trimmed) as ClaudeHookInput
  } catch {
    return { session_id: 'unknown', cwd: process.cwd(), hook_event_name: 'unknown' }
  }
}

export interface PreToolUseDenyOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse'
    permissionDecision: 'deny'
    permissionDecisionReason: string
  }
}

export interface SessionStartContextOutput {
  hookSpecificOutput: {
    hookEventName: 'SessionStart'
    additionalContext: string
  }
}

export function writeJson(output: object): void {
  process.stdout.write(JSON.stringify(output))
}

export function denyPreToolUse(reason: string): void {
  writeJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  } satisfies PreToolUseDenyOutput)
  process.exit(0)
}

export function sessionStartContext(context: string): void {
  writeJson({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    },
  } satisfies SessionStartContextOutput)
  process.exit(0)
}

export function silentExit(): void {
  process.exit(0)
}
