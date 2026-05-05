#!/usr/bin/env node
// SessionEnd hook: teardown per-session test-стека + cleanup touched-list.
// Читает project config из .claude-infra.json в process.cwd().
import { spawnSync } from 'node:child_process';
import { readHookInput, silentExit } from '../lib/claude-input.js';
import { loadProjectConfig } from '../config.js';
import { isInfraProject } from '../lib/is-infra-project.js';
import { killTree } from '../lib/proc.js';
import { runSessionEndCleanup } from './session-end-core.js';
const input = readHookInput();
const sessionId = input.session_id || 'unknown';
// Early-return для не-инфра проектов: хук зарегистрирован глобально
// в ~/.claude/settings.json, но реальная работа нужна только в наших проектах.
if (!isInfraProject(process.cwd())) {
    silentExit();
}
const config = await loadProjectConfig('.claude-infra.json');
function dockerDown(project) {
    spawnSync('docker', ['compose', '-p', project, '-f', config.paths.dockerCompose, 'down', '-v'], {
        stdio: 'ignore',
    });
}
function killPid(pid) {
    killTree(pid);
}
runSessionEndCleanup(sessionId, {
    dockerDown,
    killPid,
    dockerProjectPrefix: config.dockerProjectPrefix,
});
silentExit();
