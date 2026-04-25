/*
 * @mttzzz/nuxt-claude-infra — public API
 *
 * v0.0.1 — pre-release. Скрипты extract'нуты как-есть из ai.pushka.biz/scripts/claude/.
 * Public API нестабилен. Полная миграция (ai.pushka.biz + easy2.pushka.biz на этот пакет)
 * запланирована к v0.1.0.
 */

// Config schema
export { ProjectConfigSchema, loadProjectConfig, type ProjectConfig } from './config.js'

// Lib — pure helpers
export {
  PORT_RANGES,
  SESSIONS_DIR,
  SESSIONS_BY_HARNESS_DIR,
  type SessionPorts,
  type PortRole,
  type PidStatus,
  type SessionSummary,
  resolveSessionId,
  slugSessionId,
  allocateSessionPorts,
  getSessionPorts,
  freeSessionPorts,
  listAllSessions,
  writeSessionByHarness,
  readSessionByHarness,
  removeSessionByHarness,
  pruneStaleHarnessFiles,
} from './lib/ports.js'

export { findHarnessPid, type FindHarnessPidDeps } from './lib/harness-pid.js'

export { listProcs, killTree, type ProcInfo } from './lib/proc.js'

export { readHookInput, denyPreToolUse, silentExit } from './lib/claude-input.js'

export { commitFiles, type CommitFilesArgs, type CommitFilesResult, type Runner } from './lib/commit-files-core.js'

export { isMutatingBash } from './lib/is-mutating-bash.js'

export { currentBranch } from './lib/git-branch.js'

export { readDevDbConfig, type DevDbConfig, type ReadDevDbConfigOptions } from './lib/dev-env.js'

export { addTouched, readTouched, clearTouched, DEFAULT_SESSIONS_DIR } from './lib/touched.js'

// Hook entry-points (для обёрток в проектном scripts/claude/hooks/)
export { runSessionStart } from './hooks/session-start-core.js'
export { runSessionEndCleanup, type SessionEndDeps } from './hooks/session-end-core.js'

// CLI helpers
export { buildMcpServerEnv, type McpServerEnvOptions } from './cli/mcp-server.js'
