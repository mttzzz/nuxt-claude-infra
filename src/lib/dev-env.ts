import { existsSync, readFileSync } from 'node:fs'

export interface DevDbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const idx = line.indexOf('=')
    if (idx === -1) {
      continue
    }
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export interface ReadDevDbConfigOptions {
  envPath?: string
  /* Имя БД, если в .env нет NUXT_DB_NAME. Обычно — имя проектной dev-БД. */
  defaultDatabase?: string
}

export function readDevDbConfig(opts: ReadDevDbConfigOptions = {}): DevDbConfig {
  const env = parseEnvFile(opts.envPath ?? '.env')
  const host = env.NUXT_DB_HOST || '127.0.0.1'
  const port = Number.parseInt(env.NUXT_DB_PORT ?? '3306', 10)
  const user = env.NUXT_DB_USER || 'root'
  const password = env.NUXT_DB_PASSWORD || 'root'
  const database = env.NUXT_DB_NAME || opts.defaultDatabase || ''
  return { host, port, user, password, database }
}
