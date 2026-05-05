#!/usr/bin/env node
// nci-stack-prune — снимает все per-session артефакты, чьих живых процессов уже нет.
//
// v0.6.0: расширено. Раньше чистились только сессии с `ports.json` где оба pid'а мёртвые.
// Теперь: чистится ВСЁ что не attached к живой Claude-сессии. Источник истины —
// `.claude/sessions/by-harness/<pid>.json`: после `pruneStaleHarnessFiles` там остаются
// только мэппинги с живыми pid'ами. Любая session-dir чьего sessionId нет в alive-наборе
// считается stale и удаляется.
//
// Покрывает три класса мусора:
//   1. Sessions с поднятым docker-стеком, но мёртвым Claude-процессом → docker compose down + rm
//   2. Sessions с ports.json без pid'ов (allocated, но stack не поднимали) → rm dir
//   3. Sessions с одним только touched.txt (был лишь PostToolUse-hook) → rm dir
//
// Escape-hatch после kill -9, ребутов, и просто накопленного исторического мусора.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProjectConfig } from '../config.js';
import { runSessionEndCleanup } from '../hooks/session-end-core.js';
import { listAllSessions, pruneStaleHarnessFiles, SESSIONS_BY_HARNESS_DIR, SESSIONS_DIR, } from '../lib/ports.js';
import { killTree } from '../lib/proc.js';
function isPidAlive(pid) {
    if (!pid || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        return err.code === 'EPERM';
    }
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
/* 1. Снимаем мёртвые by-harness/<pid>.json — оставляем только живые мэппинги. */
pruneStaleHarnessFiles(isPidAlive);
/* 2. Собираем sessionId'ы живых сессий. */
const aliveSessionIds = new Set();
if (existsSync(SESSIONS_BY_HARNESS_DIR)) {
    for (const f of readdirSync(SESSIONS_BY_HARNESS_DIR)) {
        if (!f.endsWith('.json'))
            continue;
        try {
            const raw = readFileSync(join(SESSIONS_BY_HARNESS_DIR, f), 'utf8');
            const data = JSON.parse(raw);
            if (data.sessionId)
                aliveSessionIds.add(data.sessionId);
        }
        catch {
            /* corrupt by-harness file — игнорируем */
        }
    }
}
if (!existsSync(SESSIONS_DIR)) {
    process.stdout.write('Нет .claude/sessions — пусто.\n');
    process.exit(0);
}
/* 3. Итерируем все session-dirs (кроме `by-harness`) и собираем stale. */
const allSessions = readdirSync(SESSIONS_DIR).filter((name) => name !== 'by-harness');
const stale = allSessions.filter((sid) => !aliveSessionIds.has(sid));
if (stale.length === 0) {
    process.stdout.write('Нет stale session-dirs.\n');
    process.exit(0);
}
process.stdout.write(`Чищу ${String(stale.length)} stale session(s): ${stale.map((s) => s.slice(0, 20)).join(', ')}\n`);
/* 4. Для каждой stale: если есть ports.json — полный cleanup (docker down + kill pids + rm dir),
 *    иначе просто rm dir (мусор без активного стека). */
const sessionsWithPortsJson = new Set(listAllSessions().map((s) => s.sessionId));
for (const sid of stale) {
    if (sessionsWithPortsJson.has(sid)) {
        runSessionEndCleanup(sid, {
            dockerDown,
            killPid,
            dockerProjectPrefix: config.dockerProjectPrefix,
        });
    }
    else {
        try {
            rmSync(join(SESSIONS_DIR, sid), { recursive: true, force: true });
        }
        catch {
            /* swallow — race / уже удалена */
        }
    }
    process.stdout.write(`  ✓ ${sid.slice(0, 20)}\n`);
}
