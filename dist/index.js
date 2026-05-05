/*
 * @mttzzz/nuxt-claude-infra — public API
 *
 * v0.4: вынесены generic test-helpers (test-stack, docker, db, e2e),
 * конфиг-пресеты (vitest, playwright) и docker-compose template.
 * Хуки получили early-return на не-инфра проектах через isInfraProject.
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
// === v0.4 additions ===
export { isInfraProject } from './lib/is-infra-project.js';
export { resolveTestDbPort, truncateAllTables, disconnectClient, } from './lib/db.js';
export { composeProjectName, buildComposeEnv, imageExists, buildTestServerImage, startTestStackContainers, stopTestStackContainers, } from './lib/docker.js';
export { startTestStack, stopTestStack, defineTestStack, allocateWithRetry, } from './lib/test-stack.js';
export { useSharedNuxt } from './lib/e2e.js';
