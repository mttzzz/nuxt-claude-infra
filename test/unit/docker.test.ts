import { describe, expect, it } from 'bun:test'

import {
  composeProjectName,
  buildComposeEnv,
  type SpawnRunner,
} from '../../src/lib/docker'

describe('composeProjectName', () => {
  it('конкатенирует prefix + sessionId', () => {
    expect(composeProjectName('ai-pushka-test', 'abc-123')).toBe('ai-pushka-test-abc-123')
  })

  it('slug\'ит sessionId если содержит unsafe-символы', () => {
    expect(composeProjectName('ai-test', 'foo_bar.baz')).toBe('ai-test-foo-bar-baz')
  })
})

describe('buildComposeEnv', () => {
  it('собирает env-vars из ports + project config', () => {
    const env = buildComposeEnv({
      ports: { test: 3210, db: 3320, redis: 6410, mcp: 3110 },
      testDbName: 'ai_pushka_test',
      imageTag: 'ai-pushka-test-server:latest',
    })
    expect(env.POSTGRES_PORT).toBe('3320')
    expect(env.REDIS_PORT).toBe('6410')
    expect(env.TEST_SERVER_PORT).toBe('3210')
    expect(env.TEST_DB_NAME).toBe('ai_pushka_test')
    expect(env.IMAGE_TAG).toBe('ai-pushka-test-server:latest')
  })
})

describe('imageExists (mock spawn)', () => {
  it('true когда docker images возвращает не-пустой output', async () => {
    const runner: SpawnRunner = (cmd, args) => {
      expect(cmd).toBe('docker')
      expect(args).toContain('images')
      return { stdout: 'sha256:abc123\n', stderr: '', status: 0 }
    }
    const { imageExists } = await import('../../src/lib/docker')
    expect(imageExists('foo:latest', runner)).toBe(true)
  })

  it('false когда docker images возвращает пустой output', async () => {
    const runner: SpawnRunner = () => ({ stdout: '', stderr: '', status: 0 })
    const { imageExists } = await import('../../src/lib/docker')
    expect(imageExists('foo:latest', runner)).toBe(false)
  })

  it('false при ненулевом exit code', async () => {
    const runner: SpawnRunner = () => ({ stdout: '', stderr: 'error', status: 1 })
    const { imageExists } = await import('../../src/lib/docker')
    expect(imageExists('foo:latest', runner)).toBe(false)
  })
})
