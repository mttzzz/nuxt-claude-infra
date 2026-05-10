/* runPreviewTest(ctx) — entry point для project's `bun preview:test` script.
 *
 * Логика:
 *   1. hash inputs → если нужно, build
 *   2. ensureDb worker 1 + migrate, клон в worker 2..N через CREATE DATABASE TEMPLATE
 *   3. spawn N серверов: bun .output/server/index.mjs на портах portBase+1..portBase+N
 *   4. ждём health на всех — потом печатаем READY
 *   5. Ctrl+C → graceful kill всех детей
 *
 * Vitest/playwright globalSetup только проверяет alive (через ensureTestStack).
 * Если меняешь server/** → перезапусти этот процесс. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import { ensureTestDb, hashBuildInputs, isServerAlive, loadCachedHash, runMigrationsIfNeeded, saveCachedHash, } from './orchestrator.js';
export async function runPreviewTest(ctx) {
    const workerCount = ctx.resolveWorkerCount();
    /* --- BUILD --- */
    const newHash = hashBuildInputs(process.cwd(), ctx.options.buildInputDirs, ctx.options.buildInputFiles);
    const cached = loadCachedHash(ctx.buildHashFile);
    const outputExists = existsSync(ctx.buildOutputMarker);
    if (cached === newHash && outputExists) {
        console.log(`[preview:test] build cache hit (${newHash}) → skip nuxt build`);
    }
    else {
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
    /* --- DB SETUP --- */
    console.log(`[preview:test] preparing ${String(workerCount)} test DB(s)...`);
    await ensureTestDb({ adminUrl: ctx.testAdminPostgresUrl(), database: ctx.testDbName(1) });
    const migration = runMigrationsIfNeeded({
        postgresUrl: ctx.testPostgresUrl(1),
        migrationsDir: ctx.options.migrationsDir,
        cachePath: ctx.migrationsHashFile,
    });
    console.log(`[preview:test] primary DB ${ctx.testDbName(1)} migrations=${migration.skipped ? 'skipped' : 'applied'}`);
    if (workerCount > 1) {
        const sql = postgres(ctx.testAdminPostgresUrl(), { max: 1, onnotice: () => { } });
        try {
            for (let i = 2; i <= workerCount; i++) {
                const db = ctx.testDbName(i);
                const force = !migration.skipped;
                const exists = await sql `
          SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${db}) AS exists
        `;
                if (exists[0]?.exists && !force)
                    continue;
                if (exists[0]?.exists) {
                    await sql.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db}' AND pid<>pg_backend_pid()`);
                    await sql.unsafe(`DROP DATABASE "${db}"`);
                }
                await sql.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${ctx.testDbName(1)}' AND pid<>pg_backend_pid()`);
                await sql.unsafe(`CREATE DATABASE "${db}" TEMPLATE "${ctx.testDbName(1)}"`);
                console.log(`[preview:test] cloned ${ctx.testDbName(1)} → ${db}`);
            }
        }
        finally {
            await sql.end({ timeout: 5 });
        }
    }
    /* --- SPAWN N SERVERS --- */
    const children = [];
    function killAll(signal = 'SIGTERM') {
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
    process.on('SIGINT', () => {
        console.log('\n[preview:test] SIGINT — killing all workers...');
        killAll('SIGTERM');
        setTimeout(() => process.exit(0), 1000);
    });
    process.on('SIGTERM', () => {
        killAll('SIGTERM');
        process.exit(0);
    });
    for (let i = 1; i <= workerCount; i++) {
        /* SAFETY: НЕ передаём process.env — buildTestServerEnv whitelist-only.
         * См. host-stack/define-config.ts buildServerEnv для деталей. */
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
            killAll('SIGTERM');
            process.exit(code ?? 1);
        });
        children.push(child);
    }
    console.log(`[preview:test] spawned ${String(workerCount)} servers, waiting for health...`);
    /* --- WAIT FOR ALL HEALTHY --- */
    const HEALTH_TIMEOUT_MS = 30_000;
    const HEALTH_POLL_MS = 200;
    const startedAt = Date.now();
    const ready = new Set();
    while (ready.size < workerCount) {
        if (Date.now() - startedAt > HEALTH_TIMEOUT_MS) {
            console.error(`[preview:test] timeout waiting for healthcheck — ready=${[...ready].join(',')}`);
            killAll('SIGTERM');
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
    console.log(`[preview:test] all ${String(workerCount)} workers ready. press Ctrl+C to stop.`);
    /* Keep process alive — children собственными exit-handlers повалят нас. */
    await new Promise(() => { });
}
