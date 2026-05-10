import type { HostStackContext } from './define-config.js';
/** sha256 (первые 8 hex) от build inputs. Walks dirs, читает stat (size+mtime). */
export declare function hashBuildInputs(rootDir: string, dirs: string[], files: string[]): string;
/** sha256 (первые 8 hex) от drizzle migrations (per-dir layout v1.0-beta). */
export declare function hashMigrations(rootDir: string): string;
export declare function loadCachedHash(path: string): string | null;
export declare function saveCachedHash(path: string, hash: string): void;
/** Health check: GET ${host}/api/health/ready. true только при 2xx. */
export declare function isServerAlive(host: string, timeoutMs: number): Promise<boolean>;
export interface EnsureTestDbOptions {
    adminUrl: string;
    database: string;
}
/** Идемпотентно создаёт test-БД на локальном PG если её нет. */
export declare function ensureTestDb(opts: EnsureTestDbOptions): Promise<void>;
export interface RunMigrationsOptions {
    postgresUrl: string;
    migrationsDir: string;
    cachePath: string;
    force?: boolean;
}
export interface RunMigrationsResult {
    skipped: boolean;
    newHash: string;
}
/** Прогнать `drizzle-kit migrate` если hash миграций не совпадает с cached. */
export declare function runMigrationsIfNeeded(opts: RunMigrationsOptions): RunMigrationsResult;
export interface EnsureStackResult {
    /** 1-indexed: hosts[1..workerCount]. hosts[0] оставлен пустым для удобства маппинга. */
    hosts: string[];
    migrationSkipped: boolean;
    workerCount: number;
}
/**
 * Готовит N-worker test-стек: ensureDb (worker 1) + migrate + клон в worker 2..N через CREATE DATABASE TEMPLATE.
 * Health-checks все N серверов. НЕ спавнит — это делает preview-test CLI.
 * Бросает ошибку с инструкцией если серверы не отвечают.
 */
export declare function ensureTestStack(ctx: HostStackContext, opts?: {
    timeoutMs?: number;
    workerCount?: number;
}): Promise<EnsureStackResult>;
/**
 * Создаёт вторичные test-БД (worker 2..N) клонированием primary через CREATE DATABASE TEMPLATE.
 * Force=true → DROP+CREATE. Force=false → пропускает существующие.
 * TEMPLATE требует чтобы в primary не было активных коннектов — закрываем их.
 */
export declare function ensureSecondaryDbsFromPrimary(ctx: HostStackContext, workerCount: number, force: boolean): Promise<void>;
//# sourceMappingURL=orchestrator.d.ts.map