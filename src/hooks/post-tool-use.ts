// PostToolUse hook: записывает touched-файлы текущей сессии после Write/Edit/MultiEdit/NotebookEdit.
// Ничего не блокирует (exit 0). Hook выхлоп для Claude не используется — stdout пустой.
import { readHookInput, silentExit } from '../lib/claude-input'
import { addTouched, DEFAULT_SESSIONS_DIR } from '../lib/touched'

const input = readHookInput()
const sessionId = input.session_id || 'unknown'
const toolName = input.tool_name ?? ''

if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'NotebookEdit') {
  const rawInput = input.tool_input as { file_path?: unknown; path?: unknown; notebook_path?: unknown } | undefined
  const filePath =
    (typeof rawInput?.file_path === 'string' && rawInput.file_path) ||
    (typeof rawInput?.path === 'string' && rawInput.path) ||
    (typeof rawInput?.notebook_path === 'string' && rawInput.notebook_path) ||
    ''
  if (filePath) {
    addTouched(DEFAULT_SESSIONS_DIR, sessionId, filePath, input.cwd)
  }
}

silentExit()
