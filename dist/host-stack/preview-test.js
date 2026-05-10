/* runPreviewTest(ctx) — entry point для project's `bun preview:test` script.
 *
 * Pipeline:
 *   1. ensureBuildArtifact   — hash inputs → build if needed
 *   2. preparePrimaryDb      — ensureDb + migrate worker 1
 *   3. ensureSecondaryDbs    — клон 2..N через CREATE DATABASE TEMPLATE (если workerCount > 1)
 *   4. spawnPreviewServers   — N процессов bun .output/server/index.mjs
 *   5. waitForAllHealthy     — poll /api/health/ready всех серверов
 *   6. blockUntilSignal      — ждём SIGINT/SIGTERM, потом graceful kill
 *
 * Vitest/playwright globalSetup только проверяет alive (через ensureTestStack).
 * Если меняешь server/** → перезапусти этот процесс. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ensureSecondaryDbsFromPrimary, ensureTestDb, hashBuildInputs, isServerAlive, loadCachedHash, runMigrationsIfNeeded, saveCachedHash, } from './orchestrator.js';
export async function runPreviewTest(ctx) {
    const workerCount = ctx.resolveWorkerCount();
    ensureBuildArtifact(ctx);
    const migrationApplied = await preparePrimaryDb(ctx);
    if (workerCount > 1) {
        await ensureSecondaryDbsFromPrimary(ctx, workerCount, migrationApplied);
    }
    const children = spawnPreviewServers(ctx, workerCount);
    installSignalHandlers(children);
    await waitForAllHealthy(ctx, workerCount, children);
    console.log(`[preview:test] all ${String(workerCount)} workers ready. press Ctrl+C to stop.`);
    await blockForever();
}
/** Phase 1: hash inputs → if changed, run `bun nuxt build` (foreground). */
function ensureBuildArtifact(ctx) {
    const newHash = hashBuildInputs(ctx.options.rootDir, ctx.options.buildInputDirs, ctx.options.buildInputFiles);
    const cached = loadCachedHash(ctx.buildHashFile);
    const outputExists = existsSync(ctx.buildOutputMarker);
    if (cached === newHash && outputExists) {
        console.log(`[preview:test] build cache hit (${newHash}) → skip nuxt build`);
        return;
    }
    const reason = !outputExists ? 'no .output/' : `hash changed ${cached ?? '(none)'} → ${newHash}`;
    console.log(`[preview:test] building production bundle (${reason})...`);
    const buildResult = spawnSync('bun', ['nuxt', 'build'], { stdio: 'inherit' });
    if (buildResult.status !== 0) {
        console.error('[preview:test] build failed');
        process.exit(buildResult.status ?? 1);
    }
    saveCachedHash(ctx.buildHashFile, newHash);
    console.log(`[preview:test] build done, cached as ${newHash}`);
}
/** Phase 2: ensure primary worker DB exists + migrations applied. Returns true if migration was run. */
async function preparePrimaryDb(ctx) {
    console.log(`[preview:test] preparing test DB(s)...`);
    await ensureTestDb({ adminUrl: ctx.testAdminPostgresUrl(), database: ctx.testDbName(1) });
    const migration = runMigrationsIfNeeded({
        postgresUrl: ctx.testPostgresUrl(1),
        migrationsDir: ctx.options.migrationsDir,
        cachePath: ctx.migrationsHashFile,
    });
    console.log(`[preview:test] primary DB ${ctx.testDbName(1)} migrations=${migration.skipped ? 'skipped' : 'applied'}`);
    return !migration.skipped;
}
/** Phase 4: spawn N `bun run .output/server/index.mjs` processes with per-worker env. */
function spawnPreviewServers(ctx, workerCount) {
    const children = [];
    for (let i = 1; i <= workerCount; i++) {
        /* SAFETY: НЕ передаём process.env — buildTestServerEnv whitelist-only. */
        const env = ctx.buildTestServerEnv(i);
        const child = spawn('bun', ['run', '.output/server/index.mjs'], {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const prefix = `[w${String(i)}]`;
        child.stdout?.on('data', (data) => {
            process.stdout.write(`${prefix} ${data.toString()}`);
        });
        child.stderr?.on('data', (data) => {
            process.stderr.write(`${prefix} ${data.toString()}`);
        });
        child.on('exit', (code, signal) => {
            console.error(`${prefix} exited (code=${String(code)} signal=${String(signal)})`);
            killAll(children, 'SIGTERM');
            process.exit(code ?? 1);
        });
        children.push(child);
    }
    console.log(`[preview:test] spawned ${String(workerCount)} servers, waiting for health...`);
    return children;
}
/** Send signal to all children. Idempotent (skips already-killed). */
function killAll(children, signal) {
    for (const child of children) {
        if (!child.killed) {
            try {
                child.kill(signal);
            }
            catch {
                /* swallow */
            }
        }
    }
}
/** Install SIGINT/SIGTERM handlers — graceful kill of children, then exit. */
function installSignalHandlers(children) {
    process.on('SIGINT', () => {
        console.log('\n[preview:test] SIGINT — killing all workers...');
        killAll(children, 'SIGTERM');
        setTimeout(() => process.exit(0), 1000);
    });
    process.on('SIGTERM', () => {
        killAll(children, 'SIGTERM');
        process.exit(0);
    });
}
/** Phase 5: poll /api/health/ready пока все workers не вернут 2xx. */
async function waitForAllHealthy(ctx, workerCount, children) {
    const HEALTH_TIMEOUT_MS = 30_000;
    const HEALTH_POLL_MS = 200;
    const startedAt = Date.now();
    const ready = new Set();
    while (ready.size < workerCount) {
        if (Date.now() - startedAt > HEALTH_TIMEOUT_MS) {
            console.error(`[preview:test] timeout waiting for healthcheck — ready=${[...ready].join(',') || '(none)'}`);
            killAll(children, 'SIGTERM');
            process.exit(1);
        }
        for (let i = 1; i <= workerCount; i++) {
            if (ready.has(i))
                continue;
            const alive = await isServerAlive(ctx.testServerUrl(i), 1500);
            if (alive) {
                ready.add(i);
                console.log(`[preview:test] worker ${String(i)} ready @ ${ctx.testServerUrl(i)} (DB ${ctx.testDbName(i)})`);
            }
        }
        if (ready.size < workerCount) {
            await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
        }
    }
}
/** Phase 6: block forever — children's exit handlers will exit process. */
function blockForever() {
    return new Promise(() => { });
}
