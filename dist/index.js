/*
 * @mttzzz/nuxt-claude-infra — public API
 *
 * v0.0.1 — pre-release. Скрипты extract'нуты как-есть из ai.pushka.biz/scripts/claude/.
 * Public API нестабилен. Полная миграция (ai.pushka.biz + easy2.pushka.biz на этот пакет)
 * запланирована к v0.1.0.
 */
// Config schema
export { ProjectConfigSchema, loadProjectConfig } from './config.js';
// Lib — pure helpers
export { PORT_RANGES, SESSIONS_DIR, SESSIONS_BY_HARNESS_DIR, resolveSessionId, slugSessionId, allocateSessionPorts, getSessionPorts, freeSessionPorts, listAllSessions, writeSessionByHarness, readSessionByHarness, removeSessionByHarness, pruneStaleHarnessFiles, } from './lib/ports.js';
export { findHarnessPid } from './lib/harness-pid.js';
export { listProcs, killTree } from './lib/proc.js';
export { readHookInput, denyPreToolUse, silentExit } from './lib/claude-input.js';
export { commitFiles } from './lib/commit-files-core.js';
export { isMutatingBash } from './lib/is-mutating-bash.js';
export { currentBranch } from './lib/git-branch.js';
export { readDevDbConfig } from './lib/dev-env.js';
export { addTouched, readTouched, clearTouched, DEFAULT_SESSIONS_DIR } from './lib/touched.js';
// Hook entry-points (для обёрток в проектном scripts/claude/hooks/)
export { runSessionStart } from './hooks/session-start-core.js';
export { runSessionEndCleanup } from './hooks/session-end-core.js';
// CLI helpers
export { buildMcpServerEnv } from './cli/mcp-server.js';
