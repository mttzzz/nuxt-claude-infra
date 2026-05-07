import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
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
});
const DEFAULT_PORTS = {
    mcp: [3100, 3199],
    test: [3200, 3299],
    db: [3310, 3399],
    redis: [6400, 6499],
};
const DEFAULT_PATHS = {
    dockerCompose: 'docker-compose.test.yml',
    sessionsDir: '.claude/sessions',
    playwrightArtifactsDir: '.playwright-mcp',
};
const DEFAULT_KILL_ZOMBIES_PATTERNS = [
    'nuxi.*_dev',
    'tinypool',
    '@playwright/test.*test-server',
    'test-server\\.ts',
];
/*
 * deriveProjectSlug отрезает domain-suffix от имени директории,
 * если имя похоже на домен. Используется для convention-defaults.
 *
 *   "shop.example.com" → "shop.example"
 *   "myapp.io"         → "myapp"
 *   "myapp"            → "myapp"          (1 segment — не трогаем)
 *   "foo.bar"          → "foo"            (2 segment — отрезаем последний)
 */
export function deriveProjectSlug(cwd) {
    const name = basename(cwd);
    const parts = name.split('.');
    if (parts.length <= 1)
        return name;
    return parts.slice(0, -1).join('.');
}
/*
 * "shop.example.com" → "shop-example-test"
 * "myapp"            → "myapp-test"
 */
export function deriveDockerProjectPrefix(cwd) {
    const slug = deriveProjectSlug(cwd);
    return slug.replaceAll('.', '-') + '-test';
}
/*
 * "shop.example.com" → "shop_example_test"
 * "my-app"           → "my_app_test"
 */
export function deriveTestDbName(cwd) {
    const slug = deriveProjectSlug(cwd);
    return slug.replaceAll('.', '_').replaceAll('-', '_') + '_test';
}
/*
 * Применяет defaults поверх partial input. Возвращает fully-resolved ProjectConfig.
 * cwd используется для convention-derivation; по умолчанию process.cwd().
 */
export function resolveProjectConfig(input, cwd = process.cwd()) {
    return {
        dockerProjectPrefix: input?.dockerProjectPrefix ?? deriveDockerProjectPrefix(cwd),
        testDbName: input?.testDbName ?? deriveTestDbName(cwd),
        ports: input?.ports ?? DEFAULT_PORTS,
        paths: input?.paths ?? DEFAULT_PATHS,
        killZombiesPatterns: input?.killZombiesPatterns ?? DEFAULT_KILL_ZOMBIES_PATTERNS,
    };
}
/*
 * Прочитать .claude-infra.json (если есть) и применить convention-defaults.
 *
 * - Файла нет / path = undefined → defaults целиком.
 * - Файл есть — загружается, валидируется, недостающее доводится из defaults.
 * - Невалидный JSON / схема — ZodError.
 */
export async function loadProjectConfig(path = '.claude-infra.json', cwd = process.cwd()) {
    if (!existsSync(path)) {
        return resolveProjectConfig(undefined, cwd);
    }
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const input = ProjectConfigInputSchema.parse(raw);
    return resolveProjectConfig(input, cwd);
}
/*
 * Старая публичная схема для backwards-compat — предупреждение для тех, кто импортирует.
 * @deprecated Используй ProjectConfigInputSchema (для входа) или ProjectConfig (как тип результата).
 */
export const ProjectConfigSchema = ProjectConfigInputSchema;
