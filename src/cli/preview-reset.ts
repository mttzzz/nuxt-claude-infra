// bun preview:reset — вернуть исходную ветку и восстановить dev-БД из последнего dump.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { readDevDbConfig } from '../lib/dev-env'
import { clearPreviewState, readPreviewState } from '../lib/preview-state'

const state = readPreviewState()
if (!state) {
  process.stderr.write('[preview:reset] Активного preview нет (нет .preview-state.json).\n')
  process.exit(1)
}

process.stdout.write(`[preview:reset] Возвращаемся с ${state.previewBranch} на ${state.originalBranch}.\n`)

// 1. git checkout <original>
const checkout = spawnSync('git', ['checkout', state.originalBranch], { stdio: 'inherit' })
if (checkout.status !== 0) {
  process.stderr.write('[preview:reset] git checkout упал. State не сбрасываю, попробуй вручную.\n')
  process.exit(1)
}

// 2. git stash pop (если стэшили при старте)
if (state.stashed && state.stashRef) {
  process.stdout.write(`[preview:reset] git stash pop ${state.stashRef}\n`)
  const stashPop = spawnSync('git', ['stash', 'pop', state.stashRef], { stdio: 'inherit' })
  if (stashPop.status !== 0) {
    process.stderr.write('[preview:reset] git stash pop упал. Разбирайся руками.\n')
  }
}

// 3. Восстанавливаем dev-БД из dump.
if (!existsSync(state.dumpPath)) {
  process.stderr.write(`[preview:reset] Dump не найден: ${state.dumpPath}. БД не восстановлена!\n`)
  clearPreviewState()
  process.exit(1)
}

const dbConfig = readDevDbConfig()
process.stdout.write(`[preview:reset] Восстанавливаем dev-БД из ${state.dumpPath}.\n`)

const dumpContent = readFileSync(state.dumpPath)
const restore = spawnSync(
  'mysql',
  [
    `--host=${dbConfig.host}`,
    `--port=${String(dbConfig.port)}`,
    `--user=${dbConfig.user}`,
    `--password=${dbConfig.password}`,
    dbConfig.database,
  ],
  {
    input: dumpContent,
    stdio: ['pipe', 'inherit', 'inherit'],
  },
)

if (restore.status !== 0) {
  process.stderr.write('[preview:reset] mysql restore упал. БД в странном состоянии!\n')
  process.exit(1)
}

clearPreviewState()
process.stdout.write(`[preview:reset] Готово. Ветка: ${state.originalBranch}, БД восстановлена.\n`)
