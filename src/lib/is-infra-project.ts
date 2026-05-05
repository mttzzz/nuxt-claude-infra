import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_NAME = '@mttzzz/nuxt-claude-infra'

/*
 * Возвращает true, если cwd-директория относится к проекту с per-session test-инфрой:
 *   1. есть `.claude-infra.json` (явный маркер), либо
 *   2. в `package.json` есть зависимость на этот пакет (любая секция).
 *
 * Используется хуками для early-return на не-инфра проектах:
 * глобально зарегистрированные хуки в `~/.claude/settings.json` срабатывают
 * во ВСЕХ Claude-сессиях, но реальная логика выполняется только когда cwd —
 * инфра-проект.
 */
export function isInfraProject(cwd: string = process.cwd()): boolean {
  if (existsSync(join(cwd, '.claude-infra.json'))) return true

  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return false

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    return Boolean(
      pkg.dependencies?.[PACKAGE_NAME] ??
      pkg.devDependencies?.[PACKAGE_NAME] ??
      pkg.peerDependencies?.[PACKAGE_NAME],
    )
  } catch {
    return false
  }
}
