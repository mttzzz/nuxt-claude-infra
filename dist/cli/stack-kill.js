#!/usr/bin/env node
// bun stack:kill <sessionId> — принудительный teardown чужой (обычно крэшнутой) сессии.
// Убивает pids (даже живые), гасит docker-project, удаляет .claude/sessions/<id>/.
// Читает project config из .claude-infra.json в process.cwd().
import { spawnSync } from 'node:child_process';
import { loadProjectConfig } from '../config.js';
import { runSessionEndCleanup } from '../hooks/session-end-core.js';
import { killTree } from '../lib/proc.js';
const sessionId = process.argv[2];
if (!sessionId) {
    process.stderr.write('Usage: bun stack:kill <sessionId>\n');
    process.exit(1);
}
const config = await loadProjectConfig('.claude-infra.json');
function dockerDown(project) {
    process.stdout.write(`[stack:kill] docker compose -p ${project} down -v\n`);
    spawnSync('docker', ['compose', '-p', project, '-f', config.paths.dockerCompose, 'down', '-v'], {
        stdio: 'inherit',
    });
}
function killPid(pid) {
    process.stdout.write(`[stack:kill] killing pid ${String(pid)}\n`);
    killTree(pid);
}
runSessionEndCleanup(sessionId, {
    dockerDown,
    killPid,
    dockerProjectPrefix: config.dockerProjectPrefix,
});
process.stdout.write(`[stack:kill] sessionId=${sessionId} зачищена.\n`);
