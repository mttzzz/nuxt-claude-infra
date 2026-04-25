#!/usr/bin/env node
// bun stack:prune — удаляет per-session стеки, все pid'ы которых мёртвые (или отсутствуют).
// Escape-hatch после kill -9 Claude-процесса, когда SessionEnd hook не успел отработать.
// Читает project config из .claude-infra.json в process.cwd().
import { spawnSync } from 'node:child_process';
import { loadProjectConfig } from '../config.js';
import { runSessionEndCleanup } from '../hooks/session-end-core.js';
import { listAllSessions } from '../lib/ports.js';
import { killTree } from '../lib/proc.js';
const config = await loadProjectConfig('.claude-infra.json');
function dockerDown(project) {
    spawnSync('docker', ['compose', '-p', project, '-f', config.paths.dockerCompose, 'down', '-v'], {
        stdio: 'ignore',
    });
}
function killPid(pid) {
    killTree(pid);
}
const sessions = listAllSessions();
const dead = sessions.filter((s) => {
    const mcpDead = !s.mcpPid || !s.mcpPid.alive;
    const testDead = !s.testPid || !s.testPid.alive;
    return mcpDead && testDead;
});
if (dead.length === 0) {
    process.stdout.write('Нет стеков с мёртвыми pid.\n');
    process.exit(0);
}
process.stdout.write(`Чищу ${String(dead.length)} session(s): ${dead.map((d) => d.sessionId.slice(0, 20)).join(', ')}\n`);
for (const s of dead) {
    runSessionEndCleanup(s.sessionId, {
        dockerDown,
        killPid,
        dockerProjectPrefix: config.dockerProjectPrefix,
    });
    process.stdout.write(`  ✓ ${s.sessionId.slice(0, 20)}\n`);
}
