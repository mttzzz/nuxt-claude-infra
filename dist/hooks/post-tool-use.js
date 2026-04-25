#!/usr/bin/env node
// PostToolUse hook: записывает touched-файлы текущей сессии после Write/Edit/MultiEdit/NotebookEdit.
// Ничего не блокирует (exit 0). Hook выхлоп для Claude не используется — stdout пустой.
import { readHookInput, silentExit } from '../lib/claude-input.js';
import { addTouched, DEFAULT_SESSIONS_DIR } from '../lib/touched.js';
const input = readHookInput();
const sessionId = input.session_id || 'unknown';
const toolName = input.tool_name ?? '';
if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'NotebookEdit') {
    const rawInput = input.tool_input;
    const filePath = (typeof rawInput?.file_path === 'string' && rawInput.file_path) ||
        (typeof rawInput?.path === 'string' && rawInput.path) ||
        (typeof rawInput?.notebook_path === 'string' && rawInput.notebook_path) ||
        '';
    if (filePath) {
        addTouched(DEFAULT_SESSIONS_DIR, sessionId, filePath, input.cwd);
    }
}
silentExit();
