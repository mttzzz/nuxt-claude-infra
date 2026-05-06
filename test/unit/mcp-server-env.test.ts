import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildMcpServerEnv } from '../../src/cli/mcp-server'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'nci-mcp-env-'))
  const envFile = join(dir, '.env')
  const envTestFile = join(dir, '.env.test')
  return { dir, envFile, envTestFile, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('buildMcpServerEnv — file-only (backward compat)', () => {
  it('reads base from file when processEnv is empty', () => {
    const { envFile, envTestFile, cleanup } = setup()
    try {
      writeFileSync(envFile, 'DATABASE_URL=postgres://file\nNUXT_OPENAI_API_KEY=file-key')
      writeFileSync(envTestFile, '')

      const env = buildMcpServerEnv({ envFile, envTestFile, port: '3147', processEnv: {} })

      expect(env.DATABASE_URL).toBe('postgres://file')
      expect(env.NUXT_OPENAI_API_KEY).toBe('file-key')
      expect(env.PORT).toBe('3147')
      expect(env.BETTER_AUTH_URL).toBe('http://localhost:3147')
    } finally {
      cleanup()
    }
  })
})

describe('buildMcpServerEnv — process.env (new infisical-run path)', () => {
  it('reads base from processEnv when file is missing', () => {
    const { envFile, envTestFile, cleanup } = setup()
    try {
      writeFileSync(envTestFile, '')
      const processEnv = {
        NUXT_OPENAI_API_KEY: 'env-key',
        POSTGRES_URL: 'postgres://env',
      }

      const env = buildMcpServerEnv({ envFile, envTestFile, port: '3200', processEnv })

      expect(env.NUXT_OPENAI_API_KEY).toBe('env-key')
      expect(env.POSTGRES_URL).toBe('postgres://env')
      expect(env.PORT).toBe('3200')
    } finally {
      cleanup()
    }
  })

  it('processEnv wins over file when both present', () => {
    const { envFile, envTestFile, cleanup } = setup()
    try {
      writeFileSync(envFile, 'NUXT_OPENAI_API_KEY=file-key\nPOSTGRES_URL=postgres://file')
      writeFileSync(envTestFile, '')
      const processEnv = { NUXT_OPENAI_API_KEY: 'env-key' }

      const env = buildMcpServerEnv({ envFile, envTestFile, port: '3147', processEnv })

      expect(env.NUXT_OPENAI_API_KEY).toBe('env-key')
      expect(env.POSTGRES_URL).toBe('postgres://file')
    } finally {
      cleanup()
    }
  })
})

describe('buildMcpServerEnv — DEV_DB_KEYS protection', () => {
  it('.env.test overrides .env for non-DB keys, .env wins for DB keys', () => {
    const { envFile, envTestFile, cleanup } = setup()
    try {
      writeFileSync(envFile, 'BETTER_AUTH_SECRET=prod\nNUXT_DB_PORT=3306')
      writeFileSync(envTestFile, 'BETTER_AUTH_SECRET=test\nNUXT_DB_PORT=9999')

      const env = buildMcpServerEnv({ envFile, envTestFile, port: '3147', processEnv: {} })

      expect(env.BETTER_AUTH_SECRET).toBe('test')
      expect(env.NUXT_DB_PORT).toBe('3306')
    } finally {
      cleanup()
    }
  })
})
