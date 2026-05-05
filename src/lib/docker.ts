import { spawnSync } from 'node:child_process'

import { slugSessionId, type SessionPorts } from './ports.js'

/*
 * Минимальный интерфейс runner'а — для DI в тестах.
 * Реальный runner делегирует в node:child_process spawnSync.
 */
export interface SpawnRunner {
  (cmd: string, args: readonly string[], opts?: { env?: NodeJS.ProcessEnv; cwd?: string }): {
    stdout: string
    stderr: string
    status: number | null
  }
}

const defaultRunner: SpawnRunner = (cmd, args, opts) => {
  const result = spawnSync(cmd, [...args], { encoding: 'utf8', env: opts?.env, cwd: opts?.cwd })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  }
}

/*
 * Имя docker-compose project: <prefix>-<slug-session-id>.
 * Один project = один комплект контейнеров (postgres-test, redis-test, test-server).
 */
export function composeProjectName(prefix: string, sessionId: string): string {
  return `${prefix}-${slugSessionId(sessionId)}`
}

/*
 * Env-vars для docker-compose, который потом подставляет их в template
 * через ${VAR}-синтаксис.
 */
export function buildComposeEnv(opts: {
  ports: SessionPorts
  testDbName: string
  imageTag: string
}): Record<string, string> {
  return {
    POSTGRES_PORT: String(opts.ports.db),
    REDIS_PORT: String(opts.ports.redis),
    TEST_SERVER_PORT: String(opts.ports.test),
    TEST_DB_NAME: opts.testDbName,
    IMAGE_TAG: opts.imageTag,
  }
}

/*
 * Существует ли docker-image локально.
 */
export function imageExists(tag: string, runner: SpawnRunner = defaultRunner): boolean {
  const result = runner('docker', ['images', '-q', tag])
  return result.status === 0 && result.stdout.trim().length > 0
}

export interface BuildImageOpts {
  imageTag: string
  /** Путь к Dockerfile relative to cwd. По умолчанию `Dockerfile`. */
  dockerfile?: string
  /** Build target (для multi-stage). */
  target?: string
  /** Дополнительные --build-arg KEY=VALUE. */
  buildArgs?: Record<string, string>
  /** cwd для запуска docker build. */
  cwd?: string
}

/*
 * Сборка test-server образа. Идемпотентна: если образ существует — пропуск.
 * Передай force=true чтобы пересобрать всегда.
 */
export function buildTestServerImage(
  opts: BuildImageOpts,
  force = false,
  runner: SpawnRunner = defaultRunner,
): void {
  if (!force && imageExists(opts.imageTag, runner)) return

  const args: string[] = ['build', '-t', opts.imageTag, '-f', opts.dockerfile ?? 'Dockerfile']
  if (opts.target) args.push('--target', opts.target)
  for (const [key, value] of Object.entries(opts.buildArgs ?? {})) {
    args.push('--build-arg', `${key}=${value}`)
  }
  args.push('.')

  const result = runner('docker', args, { cwd: opts.cwd })
  if (result.status !== 0) {
    throw new Error(`docker build failed: ${result.stderr || result.stdout}`)
  }
}

export interface ComposeOpts {
  composeFile: string
  projectName: string
  env: Record<string, string>
  cwd?: string
}

/*
 * docker compose -p <name> -f <file> up -d --wait.
 * --wait блокирует до health-check'а всех healthcheck-сервисов.
 */
export function startTestStackContainers(opts: ComposeOpts, runner: SpawnRunner = defaultRunner): void {
  const result = runner(
    'docker',
    ['compose', '-p', opts.projectName, '-f', opts.composeFile, 'up', '-d', '--wait'],
    { env: { ...process.env, ...opts.env }, cwd: opts.cwd },
  )
  if (result.status !== 0) {
    throw new Error(`docker compose up failed: ${result.stderr || result.stdout}`)
  }
}

/*
 * docker compose -p <name> down -v (volume cleanup).
 */
export function stopTestStackContainers(
  opts: Omit<ComposeOpts, 'env'>,
  runner: SpawnRunner = defaultRunner,
): void {
  runner(
    'docker',
    ['compose', '-p', opts.projectName, '-f', opts.composeFile, 'down', '-v', '--remove-orphans'],
    { cwd: opts.cwd },
  )
  /* Игнорируем status — down может быть idempotent no-op. */
}
