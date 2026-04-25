// Core-логика `bun commit:files` — выделена для тестируемости.
// CLI-обёртка в scripts/claude/commit-files.ts.
import { type SpawnSyncReturns, spawnSync } from 'node:child_process'

export type CommitFilesArgs = {
  message: string
  files: string[]
}

export type CommitFilesResult =
  | { ok: true; committed: string[]; skipped: string[]; stdout: string }
  | { ok: false; error: string; stderr?: string }

export type Runner = (cmd: string, args: string[]) => SpawnSyncReturns<string>

const defaultRunner: Runner = (cmd, args) =>
  spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/**
 * Выполняет коммит явно указанных файлов.
 * - Спрашивает `git status --porcelain` по списку и фильтрует только dirty
 *   (modified/added/untracked/deleted — всё, что `git add` умеет стейджить).
 * - Если ни один файл не dirty — ошибка, чтобы не делать пустой коммит.
 * - `git add` обрабатывает деления, добавления, и модификации единообразно.
 *
 * Тестируется через inject-able `runner`.
 */
export function commitFiles(args: CommitFilesArgs, deps: { runner?: Runner } = {}): CommitFilesResult {
  const runner = deps.runner ?? defaultRunner

  const message = args.message.trim()
  if (!message) {
    return { ok: false, error: 'Пустое commit-сообщение.' }
  }
  if (args.files.length === 0) {
    return { ok: false, error: 'Список файлов пуст.' }
  }

  const porcelain = runner('git', ['status', '--porcelain', '--', ...args.files])
  if (porcelain.status !== 0) {
    return { ok: false, error: 'git status упал.', stderr: porcelain.stderr }
  }

  const dirty = parsePorcelain(porcelain.stdout)
  const toAdd = args.files.filter((f) => dirty.has(f))
  const skipped = args.files.filter((f) => !dirty.has(f))

  if (toAdd.length === 0) {
    return {
      ok: false,
      error: `Ни один из указанных файлов не изменён в git. Возможно, опечатка в пути:\n  ${args.files.join('\n  ')}`,
    }
  }

  const add = runner('git', ['add', '--', ...toAdd])
  if (add.status !== 0) {
    return { ok: false, error: 'git add упал.', stderr: add.stderr }
  }

  const commit = runner('git', ['commit', '-m', message])
  if (commit.status !== 0) {
    return { ok: false, error: 'git commit упал.', stderr: commit.stderr }
  }

  return {
    ok: true,
    committed: toAdd,
    skipped,
    stdout: `[commit:files] Закоммичено ${String(toAdd.length)} файл(ов).`,
  }
}

/**
 * Парсит вывод `git status --porcelain` в Set путей.
 * Формат строки: "XY path" (где XY — 2 символа статуса), или rename "R  old -> new".
 * Пути могут быть в кавычках если содержат пробелы — снимаем их.
 */
function parsePorcelain(raw: string): Set<string> {
  const result = new Set<string>()
  for (const line of raw.split('\n').filter(Boolean)) {
    const rawPath = line.slice(3).replace(/^"(.*)"$/, '$1')
    const arrow = rawPath.indexOf(' -> ')
    result.add(arrow === -1 ? rawPath : rawPath.slice(arrow + 4))
  }
  return result
}
