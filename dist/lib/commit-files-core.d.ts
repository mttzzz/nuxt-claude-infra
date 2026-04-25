import { type SpawnSyncReturns } from 'node:child_process';
export type CommitFilesArgs = {
    message: string;
    files: string[];
};
export type CommitFilesResult = {
    ok: true;
    committed: string[];
    skipped: string[];
    stdout: string;
} | {
    ok: false;
    error: string;
    stderr?: string;
};
export type Runner = (cmd: string, args: string[]) => SpawnSyncReturns<string>;
/**
 * Выполняет коммит явно указанных файлов.
 * - Спрашивает `git status --porcelain` по списку и фильтрует только dirty
 *   (modified/added/untracked/deleted — всё, что `git add` умеет стейджить).
 * - Если ни один файл не dirty — ошибка, чтобы не делать пустой коммит.
 * - `git add` обрабатывает деления, добавления, и модификации единообразно.
 *
 * Тестируется через inject-able `runner`.
 */
export declare function commitFiles(args: CommitFilesArgs, deps?: {
    runner?: Runner;
}): CommitFilesResult;
//# sourceMappingURL=commit-files-core.d.ts.map