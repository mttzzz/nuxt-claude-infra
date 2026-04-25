import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { z } from 'zod'

/*
 * ProjectConfig — то, что отличает проект от проекта при общей инфре.
 *
 * Со v0.2.0: все ключевые поля либо имеют convention-derived defaults
 * (`dockerProjectPrefix`/`testDbName` выводятся из имени cwd), либо optional.
 * `.claude-infra.json` тоже опционален — если его нет, всё работает с defaults.
 *
 * Override через .claude-infra.json нужен только когда convention не совпадает
 * с реальным именованием в проекте.
 */

/*
 * Schema для содержимого .claude-infra.json (input).
 * Все поля optional — пустой `{}` валиден; недостающее доводится conventions.
 */
export const ProjectConfigInputSchema = z.object({
  dockerProjectPrefix: z.string().min(1).optional(),
  testDbName: z.string().min(1).optional(),
  mcpMysqlToolsPrefix: z.string().optional(),
  ports: z
    .object({
      mcp: z.tuple([z.number(), z.number()]),
      test: z.tuple([z.number(), z.number()]),
      db: z.tuple([z.number(), z.number()]),
      redis: z.tuple([z.number(), z.number()]),
    })
    .optional(),
  paths: z
    .object({
      dockerCompose: z.string(),
      sessionsDir: z.string(),
      playwrightArtifactsDir: z.string(),
    })
    .optional(),
  killZombiesPatterns: z.array(z.string()).optional(),
})

export type ProjectConfigInput = z.infer<typeof ProjectConfigInputSchema>

/*
 * ProjectConfig — fully-resolved (после применения defaults). Этот объект
 * передаётся в hook-функции и cli-runners.
 */
export interface ProjectConfig {
  dockerProjectPrefix: string
  testDbName: string
  mcpMysqlToolsPrefix?: string
  ports: {
    mcp: [number, number]
    test: [number, number]
    db: [number, number]
    redis: [number, number]
  }
  paths: {
    dockerCompose: string
    sessionsDir: string
    playwrightArtifactsDir: string
  }
  killZombiesPatterns: string[]
}

const DEFAULT_PORTS = {
  mcp: [3100, 3199] as [number, number],
  test: [3200, 3299] as [number, number],
  db: [3310, 3399] as [number, number],
  redis: [6400, 6499] as [number, number],
}

const DEFAULT_PATHS = {
  dockerCompose: 'docker-compose.test.yml',
  sessionsDir: '.claude/sessions',
  playwrightArtifactsDir: '.playwright-mcp',
}

const DEFAULT_KILL_ZOMBIES_PATTERNS = [
  'nuxi.*_dev',
  'tinypool',
  '@playwright/test.*test-server',
  'test-server\\.ts',
]

/*
 * deriveProjectSlug отрезает domain-suffix от имени директории,
 * если имя похоже на домен. Используется для convention-defaults.
 *
 *   "ai.pushka.biz"    → "ai.pushka"
 *   "easy2.pushka.biz" → "easy2.pushka"
 *   "kp.modmb.com"     → "kp.modmb"
 *   "myapp"            → "myapp"          (1 segment — не трогаем)
 *   "foo.bar"          → "foo"            (2 segment — отрезаем последний)
 */
export function deriveProjectSlug(cwd: string): string {
  const name = basename(cwd)
  const parts = name.split('.')
  if (parts.length <= 1) return name
  return parts.slice(0, -1).join('.')
}

/*
 * "ai.pushka.biz" → "ai-pushka-test"
 * "myapp"         → "myapp-test"
 */
export function deriveDockerProjectPrefix(cwd: string): string {
  const slug = deriveProjectSlug(cwd)
  return slug.replaceAll('.', '-') + '-test'
}

/*
 * "ai.pushka.biz" → "ai_pushka_test"
 * "my-app"        → "my_app_test"
 */
export function deriveTestDbName(cwd: string): string {
  const slug = deriveProjectSlug(cwd)
  return slug.replaceAll('.', '_').replaceAll('-', '_') + '_test'
}

/*
 * Применяет defaults поверх partial input. Возвращает fully-resolved ProjectConfig.
 * cwd используется для convention-derivation; по умолчанию process.cwd().
 */
export function resolveProjectConfig(input: ProjectConfigInput | undefined, cwd: string = process.cwd()): ProjectConfig {
  return {
    dockerProjectPrefix: input?.dockerProjectPrefix ?? deriveDockerProjectPrefix(cwd),
    testDbName: input?.testDbName ?? deriveTestDbName(cwd),
    mcpMysqlToolsPrefix: input?.mcpMysqlToolsPrefix,
    ports: input?.ports ?? DEFAULT_PORTS,
    paths: input?.paths ?? DEFAULT_PATHS,
    killZombiesPatterns: input?.killZombiesPatterns ?? DEFAULT_KILL_ZOMBIES_PATTERNS,
  }
}

/*
 * Прочитать .claude-infra.json (если есть) и применить convention-defaults.
 *
 * - Файла нет / path = undefined → defaults целиком.
 * - Файл есть — загружается, валидируется, недостающее доводится из defaults.
 * - Невалидный JSON / схема — ZodError.
 */
export async function loadProjectConfig(path: string = '.claude-infra.json', cwd: string = process.cwd()): Promise<ProjectConfig> {
  if (!existsSync(path)) {
    return resolveProjectConfig(undefined, cwd)
  }
  const raw = await Bun.file(path).json()
  const input = ProjectConfigInputSchema.parse(raw)
  return resolveProjectConfig(input, cwd)
}

/*
 * Старая публичная схема для backwards-compat — предупреждение для тех, кто импортирует.
 * @deprecated Используй ProjectConfigInputSchema (для входа) или ProjectConfig (как тип результата).
 */
export const ProjectConfigSchema = ProjectConfigInputSchema
