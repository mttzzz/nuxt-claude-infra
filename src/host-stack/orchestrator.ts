/* Orchestrator host-test-stack: hash, cache, ensureDb, migrate, server health.
 *
 * Pattern: standard nuxt-test-utils — `setup({ host })` ожидает уже работающий external server.
 * Сервер пользователь запускает ВРУЧНУЮ в отдельном терминале:
 *   bun preview:test
 * Этот orchestrator только готовит БД/проверяет alive (вызывается из vitest globalSetup и playwright globalSetup).
 * Если сервер мёртв — кидает ошибку с инструкцией. */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import postgres from 'postgres'

import type { HostStackContext } from './define-config.js'

/** sha256 (первые 8 hex) от build inputs. Walks dirs, читает stat (size+mtime). */
export function hashBuildInputs(rootDir: string, dirs: string[], files: string[]): string {
  const hash = createHash('sha256')
  function walk(dir: string): void {
    if (!existsSync(dir)) return
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        walk(p)
      } else if (e.isFile()) {
        const stat = statSync(p)
        hash.update(`${p}|${String(stat.size)}|${String(stat.mtimeMs)}\n`)
      }
    }
  }
  for (const d of dirs) walk(join(rootDir, d))
  for (const f of files) {
    const p = join(rootDir, f)
    if (existsSync(p)) {
      const stat = statSync(p)
      hash.update(`${p}|${String(stat.size)}|${String(stat.mtimeMs)}\n`)
    }
  }
  return hash.digest('hex').slice(0, 8)
}

/** sha256 (первые 8 hex) от drizzle migrations (per-dir layout v1.0-beta). */
export function hashMigrations(rootDir: string): string {
  if (!existsSync(rootDir)) {
    throw new Error(`migrations root не найден: ${rootDir}`)
  }
  const dirs = readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  const hash = createHash('sha256')
  for (const dir of dirs) {
    hash.update(dir)
    const snap = join(rootDir, dir, 'snapshot.json')
    if (existsSync(snap)) hash.update(readFileSync(snap))
  }
  return hash.digest('hex').slice(0, 8)
}

export function loadCachedHash(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    const content = readFileSync(path, 'utf8').trim()
    return /^[0-9a-f]{8}$/.test(content) ? content : null
  } catch {
    return null
  }
}

export function saveCachedHash(path: string, hash: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, hash, 'utf8')
}

/** Health check: GET ${host}/api/health/ready. true только при 2xx. */
export async function isServerAlive(host: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${host}/api/health/ready`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export interface EnsureTestDbOptions {
  adminUrl: string
  database: string
}

/** Идемпотентно создаёт test-БД на локальном PG если её нет. */
export async function ensureTestDb(opts: EnsureTestDbOptions): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(opts.database)) {
    throw new Error(`ensureTestDb: невалидное имя БД "${opts.database}"`)
  }
  const sql = postgres(opts.adminUrl, { max: 1, onnotice: () => {} })
  try {
    const rows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${opts.database}) AS exists
    `
    if (!rows[0]?.exists) {
      /* CREATE DATABASE не разрешает параметризацию имени — используем unsafe + валидация выше */
      await sql.unsafe(`CREATE DATABASE "${opts.database}"`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export interface RunMigrationsOptions {
  postgresUrl: string
  migrationsDir: string
  cachePath: string
  force?: boolean
}

export interface RunMigrationsResult {
  skipped: boolean
  newHash: string
}

/** Прогнать `drizzle-kit migrate` если hash миграций не совпадает с cached. */
export function runMigrationsIfNeeded(opts: RunMigrationsOptions): RunMigrationsResult {
  const newHash = hashMigrations(opts.migrationsDir)
  const cached = loadCachedHash(opts.cachePath)

  if (!opts.force && cached === newHash) {
    return { skipped: true, newHash }
  }

  const result = spawnSync('bun', ['drizzle-kit', 'migrate'], {
    env: { ...process.env, POSTGRES_URL: opts.postgresUrl },
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`drizzle-kit migrate failed (status=${String(result.status)})`)
  }

  saveCachedHash(opts.cachePath, newHash)
  return { skipped: false, newHash }
}

export interface EnsureStackResult {
  /** 1-indexed: hosts[1..workerCount]. hosts[0] оставлен пустым для удобства маппинга. */
  hosts: string[]
  migrationSkipped: boolean
  workerCount: number
}

/**
 * Готовит N-worker test-стек: ensureDb (worker 1) + migrate + клон в worker 2..N через CREATE DATABASE TEMPLATE.
 * Health-checks все N серверов. НЕ спавнит — это делает preview-test CLI.
 * Бросает ошибку с инструкцией если серверы не отвечают.
 */
export async function ensureTestStack(
  ctx: HostStackContext,
  opts: { timeoutMs?: number; workerCount?: number } = {},
): Promise<EnsureStackResult> {
  const timeoutMs = opts.timeoutMs ?? 5_000
  const workerCount = opts.workerCount ?? ctx.resolveWorkerCount()

  /* Primary worker DB (worker 1) — мигрируется. */
  await ensureTestDb({ adminUrl: ctx.testAdminPostgresUrl(), database: ctx.testDbName(1) })
  const migration = runMigrationsIfNeeded({
    postgresUrl: ctx.testPostgresUrl(1),
    migrationsDir: ctx.options.migrationsDir,
    cachePath: ctx.migrationsHashFile,
  })

  /* Вторичные workers — клонируем primary через CREATE DATABASE TEMPLATE. */
  if (workerCount > 1) {
    await ensureSecondaryDbsFromPrimary(ctx, workerCount, !migration.skipped)
  }

  const hosts: string[] = []
  hosts[0] = ''
  for (let i = 1; i <= workerCount; i++) {
    const host = ctx.testServerUrl(i)
    hosts[i] = host
    if (!(await isServerAlive(host, timeoutMs))) {
      throw new Error(
        [
          `[test-stack] test-server worker ${String(i)} не отвечает на ${host}/api/health/ready.`,
          `Запусти стек в отдельном терминале:`,
          `  bun preview:test`,
          `(спавнит ${String(workerCount)} серверов параллельно). TEST_WORKERS=N для другого числа.`,
        ].join('\n'),
      )
    }
  }

  return { hosts, migrationSkipped: migration.skipped, workerCount }
}

/**
 * Создаёт вторичные test-БД (worker 2..N) клонированием primary через CREATE DATABASE TEMPLATE.
 * Force=true → DROP+CREATE. Force=false → пропускает существующие.
 * TEMPLATE требует чтобы в primary не было активных коннектов — закрываем их.
 */
export async function ensureSecondaryDbsFromPrimary(
  ctx: HostStackContext,
  workerCount: number,
  force: boolean,
): Promise<void> {
  const sql = postgres(ctx.testAdminPostgresUrl(), { max: 1, onnotice: () => {} })
  const primary = ctx.testDbName(1)
  try {
    for (let i = 2; i <= workerCount; i++) {
      const db = ctx.testDbName(i)
      if (!/^[a-zA-Z0-9_]+$/.test(db)) {
        throw new Error(`ensureSecondaryDbsFromPrimary: невалидное имя БД "${db}"`)
      }
      const exists = await sql<{ exists: boolean }[]>`
        SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${db}) AS exists
      `
      if (exists[0]?.exists && !force) continue
      if (exists[0]?.exists) {
        await sql.unsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db}' AND pid<>pg_backend_pid()`,
        )
        await sql.unsafe(`DROP DATABASE "${db}"`)
      }
      await sql.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${primary}' AND pid<>pg_backend_pid()`,
      )
      await sql.unsafe(`CREATE DATABASE "${db}" TEMPLATE "${primary}"`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
