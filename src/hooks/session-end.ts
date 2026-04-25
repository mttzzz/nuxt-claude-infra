// SessionEnd hook: teardown per-session test-стека + cleanup touched-list.
// Читает project config из .claude-infra.json в process.cwd().
import { spawnSync } from 'node:child_process'

import { readHookInput, silentExit } from '../lib/claude-input'
import { loadProjectConfig } from '../config'
import { killTree } from '../lib/proc'
import { runSessionEndCleanup } from './session-end-core'

const config = await loadProjectConfig('.claude-infra.json')

function dockerDown(project: string): void {
  spawnSync('docker', ['compose', '-p', project, '-f', config.paths.dockerCompose, 'down', '-v'], {
    stdio: 'ignore',
  })
}

function killPid(pid: number): void {
  killTree(pid)
}

const input = readHookInput()
const sessionId = input.session_id || 'unknown'

runSessionEndCleanup(sessionId, {
  dockerDown,
  killPid,
  dockerProjectPrefix: config.dockerProjectPrefix,
})

silentExit()
