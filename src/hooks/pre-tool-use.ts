#!/usr/bin/env bun
// PreToolUse hook: minimal guards.
//
// Защита: блокировать DROP/TRUNCATE на dev-БД через MCP MySQL.
// Обычный SELECT/INSERT/UPDATE/DELETE пропускаем — dev-БД легко восстанавливается из дампа,
// но полное удаление таблиц — это аккуратно.
//
// Hook не нуждается в .claude-infra.json: блокировка срабатывает на ЛЮБОЙ MCP-инструмент,
// который match'ит шаблон `mcp__<anything>__<anything>_sql_query`. Это покрывает все
// типичные MCP-конфиги MySQL независимо от TOOL_PREFIX.
import { denyPreToolUse, readHookInput, silentExit } from '../lib/claude-input'

const input = readHookInput()
const toolName = input.tool_name ?? ''

// Универсальный matcher: mcp__<prefix>__<...>_sql_query
const SQL_TOOL_PATTERN = /^mcp__[a-z0-9_]+__.*_sql_query$/i

if (SQL_TOOL_PATTERN.test(toolName)) {
  const sql = String((input.tool_input as { sql?: unknown } | undefined)?.sql ?? '')
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .trim()
  if (stripped) {
    const head = stripped.split(/\s+/, 1)[0]?.toUpperCase() ?? ''
    if (head === 'DROP' || head === 'TRUNCATE') {
      denyPreToolUse(
        [
          `MCP SQL \`${head}\` на dev-БД заблокирован хуком.`,
          'Для полной чистки таблиц попроси пользователя явно подтвердить.',
          'Обычные DML (INSERT/UPDATE/DELETE) и DDL ALTER/CREATE пропускаются.',
        ].join(' '),
      )
    }
  }
}

silentExit()
