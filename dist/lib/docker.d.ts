import { type SessionPorts } from './ports.js';
export interface SpawnRunner {
    (cmd: string, args: readonly string[], opts?: {
        env?: NodeJS.ProcessEnv;
        cwd?: string;
    }): {
        stdout: string;
        stderr: string;
        status: number | null;
    };
}
export declare function composeProjectName(prefix: string, sessionId: string): string;
export declare function buildComposeEnv(opts: {
    ports: SessionPorts;
    testDbName: string;
    imageTag: string;
}): Record<string, string>;
export declare function imageExists(tag: string, runner?: SpawnRunner): boolean;
export interface BuildImageOpts {
    imageTag: string;
    /** Путь к Dockerfile relative to cwd. По умолчанию `Dockerfile`. */
    dockerfile?: string;
    /** Build target (для multi-stage). */
    target?: string;
    /** Дополнительные --build-arg KEY=VALUE. */
    buildArgs?: Record<string, string>;
    /**
     * cwd для запуска docker build.
     * Также используется как build context — финальный аргумент `'.'` в `docker build`
     * резолвится относительно cwd. Если нужен другой context — поставь cwd на нужную директорию.
     */
    cwd?: string;
}
export declare function buildTestServerImage(opts: BuildImageOpts, force?: boolean, runner?: SpawnRunner): void;
export interface ComposeOpts {
    composeFile: string;
    projectName: string;
    env: Record<string, string>;
    cwd?: string;
}
export declare function startTestStackContainers(opts: ComposeOpts, runner?: SpawnRunner): void;
export declare function stopTestStackContainers(opts: Omit<ComposeOpts, 'env'>, runner?: SpawnRunner): void;
//# sourceMappingURL=docker.d.ts.map