#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
// bun preview:branch <branch> — переключить рабочий worktree на указанную ветку
// с предварительным mysqldump dev-БД и `bunx prisma migrate deploy`. Dev-сервер
// (3001) и mcp-server (3101) сами пересоберутся через HMR, потому что оба
// смотрят в dev-БД.
//
// Preview нельзя активировать дважды подряд: `.preview-state.json` — флаг активного
// preview. Сначала `bun preview:reset`, потом новый `bun preview:branch`.
import { existsSync, mkdirSync } from 'node:fs'

import { readDevDbConfig } from '../lib/dev-env'
import { currentBranch } from '../lib/git-branch'
import { DEFAULT_BACKUPS_DIR, readPreviewState, writePreviewState, type PreviewState } from '../lib/preview-state'

const branch = process.argv[2]
if (!branch) {
  process.stderr.write('[preview] Использование: bun preview:branch <branch>\n')
  process.exit(1)
}

const existing = readPreviewState()
if (existing) {
  process.stderr.write(
    `[preview] Уже активен preview на ветке ${existing.previewBranch}. Сначала \`bun preview:reset\`.\n`,
  )
  process.exit(1)
}

const original = currentBranch()
if (!original) {
  process.stderr.write('[preview] Не удалось определить текущую ветку.\n')
  process.exit(1)
}
if (original === branch) {
  process.stderr.write(`[preview] Ты уже на ветке ${branch}. Ничего делать не буду.\n`)
  process.exit(0)
}

process.stdout.write(`[preview] Preview на ветке ${branch} (от ${original}).\n`)

// 1. Dump dev-БД.
if (!existsSync(DEFAULT_BACKUPS_DIR)) {
  mkdirSync(DEFAULT_BACKUPS_DIR, { recursive: true })
}
const timestamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '').replace(/-/g, '').replace('T', '-')
const dumpPath = `${DEFAULT_BACKUPS_DIR}/dev-${timestamp}.sql`
const dbConfig = readDevDbConfig()

process.stdout.write(`[preview] mysqldump → ${dumpPath}\n`)
const dumpArgs = [
  `--host=${dbConfig.host}`,
  `--port=${String(dbConfig.port)}`,
  `--user=${dbConfig.user}`,
  `--password=${dbConfig.password}`,
  '--single-transaction',
  '--routines',
  '--triggers',
  '--add-drop-table',
  dbConfig.database,
]
const dumpResult = spawnSync('mysqldump', dumpArgs, {
  stdio: ['ignore', 'pipe', 'inherit'],
  encoding: 'buffer',
  maxBuffer: 1024 * 1024 * 1024,
})
if (dumpResult.status !== 0 || !dumpResult.stdout) {
  process.stderr.write('[preview] mysqldump упал. Проверь, что утилита в PATH и что dev-БД доступна.\n')
  process.exit(1)
}
Bun.write(dumpPath, dumpResult.stdout as unknown as Uint8Array)

// 2. git stash (если worktree грязный).
let stashed = false
let stashRef: string | null = null
const statusResult = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
if ((statusResult.stdout ?? '').trim()) {
  process.stdout.write('[preview] Worktree грязный → git stash push -u.\n')
  const stash = spawnSync(
    'git',
    ['stash', 'push', '--include-untracked', '--message', `preview-${original}-${timestamp}`],
    { stdio: 'inherit' },
  )
  if (stash.status !== 0) {
    process.stderr.write('[preview] git stash упал. Отмена.\n')
    process.exit(1)
  }
  stashed = true
  const stashList = spawnSync('git', ['stash', 'list', '-1', '--format=%gd'], { encoding: 'utf8' })
  stashRef = (stashList.stdout ?? '').trim() || null
}

// 3. Checkout.
process.stdout.write(`[preview] git checkout ${branch}\n`)
const checkout = spawnSync('git', ['checkout', branch], { stdio: 'inherit' })
if (checkout.status !== 0) {
  process.stderr.write(`[preview] git checkout ${branch} упал. Откатываю stash.\n`)
  if (stashed && stashRef) {
    spawnSync('git', ['stash', 'pop', stashRef], { stdio: 'inherit' })
  }
  process.exit(1)
}

// 4. Prisma migrate deploy (применяет ранее созданные миграции, новые не создаёт).
process.stdout.write('[preview] bunx prisma migrate deploy\n')
const migrate = spawnSync('bunx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' })
if (migrate.status !== 0) {
  process.stderr.write('[preview] Prisma migrate упал. Восстанови вручную: `bun preview:reset`.\n')
  // Не выходим с ошибкой — dump сохранён, пользователь может откатить.
}

// 5. Сохраняем state.
const state: PreviewState = {
  originalBranch: original,
  previewBranch: branch,
  dumpPath,
  stashed,
  stashRef,
  createdAt: new Date().toISOString(),
}
writePreviewState(state)

process.stdout.write(
  [
    `\n[preview] Готово.`,
    `[preview] Dev-сервер на 3001 должен сам подхватить изменения через HMR.`,
    `[preview] Откат: \`bun preview:reset\`. Dump сохранён в ${dumpPath}.`,
  ].join('\n') + '\n',
)
