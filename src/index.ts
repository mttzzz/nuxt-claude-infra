/*
 * @mttzzz/nuxt-claude-infra — public API
 *
 * v1.0: drop docker per-session test-stack (per-session ports, mcp-server, dock-compose template).
 * Test-инфра теперь через host-stack: per-worker DB + N preview-серверов параллельно.
 * См. ./host-stack для config/orchestrator/preview-test/setup helpers.
 *
 * Сохранено:
 *   - cli: nci-commit-files, nci-kill-zombies (used by all projects)
 *   - hooks: session-start, session-end, pre/post-tool-use (Claude lifecycle)
 *   - lib: pure helpers (commit-files-core, harness-pid, proc, touched, claude-input, ports/sessions tracking)
 *
 * Removed (drop in v1.0):
 *   - docker per-session stack (lib/{test-stack, docker})
 *   - configs/{vitest,playwright}-global-setup (заменены host-stack/setup)
 *   - lib/{db, e2e} — функции инлайнены в проекты или вынесены в host-stack/
 *   - cli/{mcp-*, mine, stack-*} — relict per-session port-registry
 */

// Config schema
export { ProjectConfigSchema, loadProjectConfig, type ProjectConfig } from './config.js'

// Lib — pure helpers (used by hooks + cli)
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

export { addTouched, readTouched, clearTouched, DEFAULT_SESSIONS_DIR } from './lib/touched.js'

export { isInfraProject } from './lib/is-infra-project.js'

// Hook entry-points
export { runSessionStart } from './hooks/session-start-core.js'
export { runSessionEndCleanup, type SessionEndDeps } from './hooks/session-end-core.js'
