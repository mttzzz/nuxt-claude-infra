#!/usr/bin/env node
// SessionStart hook (I/O wrapper).
// Записывает sessionId в .claude/sessions/by-harness/<harnessPid>.json,
// чтобы bun-команды могли подхватить sessionId, когда harness не пробрасывает
// CLAUDE_SESSION_ID в bash-подпроцессы (актуально для Zed claude-acp bridge).
//
// Stdout пустой — никакого additionalContext, чтобы не засорять системный промпт.
import { readHookInput, silentExit } from '../lib/claude-input.js';
import { isInfraProject } from '../lib/is-infra-project.js';
import { listProcs } from '../lib/proc.js';
import { runSessionStart } from './session-start-core.js';
function isPidAlive(pid) {
    if (!pid || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        const code = err.code;
        return code === 'EPERM';
    }
}
const input = readHookInput();
// Early-return для не-инфра проектов: хук зарегистрирован глобально
// в ~/.claude/settings.json, но реальная работа нужна только в наших проектах.
if (!isInfraProject(process.cwd())) {
    silentExit();
}
runSessionStart(input.session_id, {
    env: process.env,
    procs: listProcs(),
    selfPid: process.pid,
    isPidAlive,
});
silentExit();
