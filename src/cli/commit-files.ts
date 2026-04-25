#!/usr/bin/env bun
// bun commit:files "<message>" <file1> <file2> ...
//
// Коммитит явно указанный список файлов. Не зависит от touched.txt и sessionId —
// безопасен для субагентов и параллельных сессий. Это единственный способ
// коммитить в проекте (`bun commit:mine` удалён как ненадёжный).
//
// Валидирует: файлы существуют на диске; каждый файл dirty в `git status`;
// не даёт сделать пустой commit.
//
// Пример:
//   bun commit:files "feat(contracts): новая схема" shared/contracts/foo.ts test/unit/foo.test.ts
import { commitFiles } from '../lib/commit-files-core'

const [message, ...files] = process.argv.slice(2)

if (!message) {
  process.stderr.write('[commit:files] Использование: bun commit:files "<сообщение>" <file1> <file2> ...\n')
  process.exit(1)
}

const result = commitFiles({ message, files })
if (!result.ok) {
  process.stderr.write(`[commit:files] ${result.error}\n`)
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }
  process.exit(1)
}

if (result.skipped.length > 0) {
  process.stdout.write(`[commit:files] Пропущены неизменённые:\n  ${result.skipped.join('\n  ')}\n`)
}
process.stdout.write(`${result.stdout}\n`)
