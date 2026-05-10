/*
 * @mttzzz/nuxt-claude-infra v2.0 — host-stack для Nuxt-проектов.
 *
 * Per-worker DB (`{dbBase}_w{N}`) + N preview-серверов параллельно.
 * См. host-stack/index.ts для полного API.
 *
 * v2.0 changes (breaking from v1.x):
 *   - Removed: cli/* (commit-files, kill-zombies) — заменены bash в ~/.claude/scripts/
 *   - Removed: hooks/* (session-start, session-end, pre/post-tool-use) — все obsolete после v1.0,
 *     pre-tool-use SQL guard переехал в bash ~/.claude/scripts/sql-guard.sh
 *   - Removed: lib/* (claude-input, commit-files-core, harness-pid, etc.) — поддерживали bins/hooks
 *   - Removed: config.ts (loadProjectConfig) — нужен был только hooks
 *   - Package больше не имеет bins. Не нужно глобально устанавливать.
 *   - Чистый TypeScript devDep — только host-stack module.
 */
export * from './host-stack/index.js';
