export { ProjectConfigSchema, loadProjectConfig, type ProjectConfig } from './config.js';
export { PORT_RANGES, SESSIONS_DIR, SESSIONS_BY_HARNESS_DIR, type SessionPorts, type PortRole, type PidStatus, type SessionSummary, resolveSessionId, slugSessionId, allocateSessionPorts, getSessionPorts, freeSessionPorts, listAllSessions, writeSessionByHarness, readSessionByHarness, removeSessionByHarness, pruneStaleHarnessFiles, } from './lib/ports.js';
export { findHarnessPid, type FindHarnessPidDeps } from './lib/harness-pid.js';
export { listProcs, killTree, type ProcInfo } from './lib/proc.js';
export { readHookInput, denyPreToolUse, silentExit } from './lib/claude-input.js';
export { commitFiles, type CommitFilesArgs, type CommitFilesResult, type Runner } from './lib/commit-files-core.js';
export { isMutatingBash } from './lib/is-mutating-bash.js';
export { currentBranch } from './lib/git-branch.js';
export { addTouched, readTouched, clearTouched, DEFAULT_SESSIONS_DIR } from './lib/touched.js';
export { runSessionStart } from './hooks/session-start-core.js';
export { runSessionEndCleanup, type SessionEndDeps } from './hooks/session-end-core.js';
export { buildMcpServerEnv, type McpServerEnvOptions } from './cli/mcp-server.js';
export { isInfraProject } from './lib/is-infra-project.js';
export { resolveTestDbPort, truncateAllTables, disconnectClient, type PostgresClient, } from './lib/db.js';
export { composeProjectName, buildComposeEnv, imageExists, buildTestServerImage, startTestStackContainers, stopTestStackContainers, type SpawnRunner, type BuildImageOpts, type ComposeOpts, } from './lib/docker.js';
export { startTestStack, stopTestStack, defineTestStack, allocateWithRetry, type TestStackHandle, type TestStackDeps, type TestStackController, } from './lib/test-stack.js';
export { useSharedNuxt } from './lib/e2e.js';
//# sourceMappingURL=index.d.ts.map