import { z } from 'zod'

/*
 * ProjectConfig — то, что отличает проект от проекта при общей инфре.
 * Каждый проект в корне держит .claude-infra.json по этой схеме.
 * Скрипты пакета принимают ProjectConfig аргументом, не ходят за глобалами.
 */
export const ProjectConfigSchema = z.object({
  /* Префикс docker-compose project-name (например, ai-pushka-test). */
  dockerProjectPrefix: z.string().min(1),

  /* Имя test-БД (например, ai_pushka_test). */
  testDbName: z.string().min(1),

  /*
   * Префикс MCP-инструментов для dev-БД (например, mcp__ai__).
   * Используется PreToolUse-хуком для блокировки DROP/TRUNCATE.
   * undefined — у проекта нет MCP-сервера для dev-БД.
   */
  mcpMysqlToolsPrefix: z.string().optional(),

  /* Per-session port ranges. По умолчанию — общие для всех Nuxt-проектов с этой инфрой. */
  ports: z
    .object({
      mcp: z.tuple([z.number(), z.number()]),
      test: z.tuple([z.number(), z.number()]),
      db: z.tuple([z.number(), z.number()]),
      redis: z.tuple([z.number(), z.number()]),
    })
    .default({
      mcp: [3100, 3199],
      test: [3200, 3299],
      db: [3310, 3399],
      redis: [6400, 6499],
    }),

  paths: z
    .object({
      /* Путь до docker-compose файла теста. */
      dockerCompose: z.string(),
      /* Путь до .claude/sessions/. Обычно не меняется. */
      sessionsDir: z.string(),
      /* Путь для артефактов Playwright MCP (скриншоты, snapshots). */
      playwrightArtifactsDir: z.string(),
    })
    .default({
      dockerCompose: 'docker-compose.test.yml',
      sessionsDir: '.claude/sessions',
      playwrightArtifactsDir: '.playwright-mcp',
    }),

  /*
   * Паттерны процессов, которые kill-zombies считает «своими» и может убивать.
   * На Unix дополнительно фильтруется по ppid=1 (orphans only).
   */
  killZombiesPatterns: z
    .array(z.string())
    .default(['nuxi.*_dev', 'tinypool', '@playwright/test.*test-server', 'test-server\\.ts']),
})

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

/*
 * Прочитать и провалидировать .claude-infra.json из произвольного пути.
 * Бросает ZodError при неверной схеме.
 */
export async function loadProjectConfig(path: string): Promise<ProjectConfig> {
  const raw = await Bun.file(path).json()
  return ProjectConfigSchema.parse(raw)
}
