import { spawnSync } from 'node:child_process';
import { slugSessionId } from './ports.js';
const defaultRunner = (cmd, args, opts) => {
    const result = spawnSync(cmd, [...args], { encoding: 'utf8', env: opts?.env, cwd: opts?.cwd });
    return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        status: result.status,
    };
};
/*
 * Имя docker-compose project: <prefix>-<slug-session-id>.
 * Один project = один комплект контейнеров (postgres-test, redis-test, test-server).
 */
export function composeProjectName(prefix, sessionId) {
    return `${prefix}-${slugSessionId(sessionId)}`;
}
/*
 * Env-vars для docker-compose, который потом подставляет их в template
 * через ${VAR}-синтаксис.
 */
export function buildComposeEnv(opts) {
    return {
        POSTGRES_PORT: String(opts.ports.db),
        REDIS_PORT: String(opts.ports.redis),
        TEST_SERVER_PORT: String(opts.ports.test),
        TEST_DB_NAME: opts.testDbName,
        IMAGE_TAG: opts.imageTag,
    };
}
/*
 * Существует ли docker-image локально.
 */
export function imageExists(tag, runner = defaultRunner) {
    const result = runner('docker', ['images', '-q', tag]);
    return result.status === 0 && result.stdout.trim().length > 0;
}
/*
 * Сборка test-server образа. Идемпотентна: если образ существует — пропуск.
 * Передай force=true чтобы пересобрать всегда.
 */
export function buildTestServerImage(opts, force = false, runner = defaultRunner) {
    if (!force && imageExists(opts.imageTag, runner))
        return;
    const args = ['build', '-t', opts.imageTag, '-f', opts.dockerfile ?? 'Dockerfile'];
    if (opts.target)
        args.push('--target', opts.target);
    for (const [key, value] of Object.entries(opts.buildArgs ?? {})) {
        args.push('--build-arg', `${key}=${value}`);
    }
    args.push('.');
    const result = runner('docker', args, { cwd: opts.cwd });
    if (result.status !== 0) {
        throw new Error(`docker build failed: ${result.stderr || result.stdout}`);
    }
}
/*
 * docker compose -p <name> -f <file> up -d --wait.
 * --wait блокирует до health-check'а всех healthcheck-сервисов.
 */
export function startTestStackContainers(opts, runner = defaultRunner) {
    const result = runner('docker', ['compose', '-p', opts.projectName, '-f', opts.composeFile, 'up', '-d', '--wait'], { env: { ...process.env, ...opts.env }, cwd: opts.cwd });
    if (result.status !== 0) {
        throw new Error(`docker compose up failed: ${result.stderr || result.stdout}`);
    }
}
/*
 * docker compose -p <name> down -v (volume cleanup).
 * В отличие от start, env не пробрасывается — `down` не делает port-interpolation,
 * defaultRunner унаследует process.env через spawnSync. Кастомный SpawnRunner
 * должен сам обеспечить PATH-наследование если нужно вызвать docker из non-PATH.
 */
export function stopTestStackContainers(opts, runner = defaultRunner) {
    runner('docker', ['compose', '-p', opts.projectName, '-f', opts.composeFile, 'down', '-v', '--remove-orphans'], { cwd: opts.cwd });
    /* Игнорируем status — down может быть idempotent no-op. */
}
