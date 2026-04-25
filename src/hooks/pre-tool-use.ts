#!/usr/bin/env bun
// PreToolUse hook: minimal guards.
//
// Модель: сессии НЕ разделены на writer/reader. Каждая сессия пишет свободно в одну
// рабочую копию, но коммитит только свои touched-файлы через `bun commit:mine`.
//
// Этот hook оставлен только для одной защиты: не допустить случайный DROP/TRUNCATE
// на dev-БД через MCP MySQL. Обычный SELECT/INSERT/UPDATE/DELETE пропускаем —
// dev-БД легко восстанавливается из дампа, но полное удаление таблиц — это аккуратно.
//
// Имя MCP-инструмента и query-key читается из .claude-infra.json (mcpMysqlToolsPrefix).
import { loadProjectConfig } from '../config'
import { denyPreToolUse, readHookInput, silentExit } from '../lib/claude-input'

const config = await loadProjectConfig('.claude-infra.json')

// MCP MySQL tools обычно называются `<prefix><projectId>_sql_query`.
// Точный query-tool name указан в проекте — для ai это `mcp__ai__ai_sql_query`.
// Извлекаем суффикс `_sql_query` после префикса; если префикса нет, hook ничего не делает.
const sqlToolPrefix = config.mcpMysqlToolsPrefix
if (!sqlToolPrefix) {
  silentExit()
}

const input = readHookInput()
const toolName = input.tool_name ?? ''

if (toolName.startsWith(sqlToolPrefix ?? '') && toolName.endsWith('_sql_query')) {
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
