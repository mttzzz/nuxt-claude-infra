import { describe, expect, it } from 'bun:test'

import {
  composeProjectName,
  buildComposeEnv,
  imageExists,
  buildTestServerImage,
  startTestStackContainers,
  stopTestStackContainers,
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

describe('buildTestServerImage (mock spawn)', () => {
  it('пропускает build когда image существует и force=false', async () => {
    const calls: Array<[string, readonly string[]]> = []
    const runner: SpawnRunner = (cmd, args) => {
      calls.push([cmd, args])
      // imageExists check — non-empty stdout → image exists
      if (args[0] === 'images') return { stdout: 'sha256:abc\n', stderr: '', status: 0 }
      // build — should not be called
      return { stdout: '', stderr: '', status: 0 }
    }
    const { buildTestServerImage } = await import('../../src/lib/docker')
    buildTestServerImage({ imageTag: 'foo:latest' }, false, runner)
    // Только imageExists вызван — build не должен был запуститься
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[1][0]).toBe('images')
  })

  it('строит с --target и --build-arg когда переданы', async () => {
    const calls: Array<[string, readonly string[]]> = []
    const runner: SpawnRunner = (cmd, args) => {
      calls.push([cmd, args])
      // imageExists check — empty stdout → image doesn't exist
      if (args[0] === 'images') return { stdout: '', stderr: '', status: 0 }
      // build success
      return { stdout: 'built', stderr: '', status: 0 }
    }
    const { buildTestServerImage } = await import('../../src/lib/docker')
    buildTestServerImage(
      {
        imageTag: 'foo:latest',
        target: 'production',
        buildArgs: { SENTRY_AUTH_TOKEN: 'xxx' },
      },
      false,
      runner,
    )
    expect(calls).toHaveLength(2)
    const buildArgs = calls[1]?.[1] ?? []
    expect(buildArgs).toContain('build')
    expect(buildArgs).toContain('--target')
    expect(buildArgs).toContain('production')
    expect(buildArgs).toContain('--build-arg')
    expect(buildArgs).toContain('SENTRY_AUTH_TOKEN=xxx')
    expect(buildArgs[buildArgs.length - 1]).toBe('.')
  })

  it('throws при non-zero exit', async () => {
    const runner: SpawnRunner = (cmd, args) => {
      if (args[0] === 'images') return { stdout: '', stderr: '', status: 0 }
      return { stdout: '', stderr: 'build error', status: 1 }
    }
    const { buildTestServerImage } = await import('../../src/lib/docker')
    expect(() => buildTestServerImage({ imageTag: 'foo:latest' }, false, runner)).toThrow(/docker build failed/)
  })
})

describe('startTestStackContainers (mock spawn)', () => {
  it('строит правильную команду docker compose up и пробрасывает env', async () => {
    let captured: { cmd: string; args: readonly string[]; env?: NodeJS.ProcessEnv } | null = null
    const runner: SpawnRunner = (cmd, args, opts) => {
      captured = { cmd, args, env: opts?.env }
      return { stdout: '', stderr: '', status: 0 }
    }
    const { startTestStackContainers } = await import('../../src/lib/docker')
    startTestStackContainers(
      {
        composeFile: 'docker-compose.test.yml',
        projectName: 'ai-test-abc',
        env: { POSTGRES_PORT: '3320', TEST_DB_NAME: 'ai_test' },
      },
      runner,
    )
    expect(captured).not.toBeNull()
    expect(captured!.cmd).toBe('docker')
    expect(captured!.args).toEqual([
      'compose',
      '-p',
      'ai-test-abc',
      '-f',
      'docker-compose.test.yml',
      'up',
      '-d',
      '--wait',
    ])
    // env должен содержать наши ключи + унаследованные из process.env
    expect(captured!.env?.POSTGRES_PORT).toBe('3320')
    expect(captured!.env?.TEST_DB_NAME).toBe('ai_test')
  })

  it('throws при non-zero exit', async () => {
    const runner: SpawnRunner = () => ({ stdout: '', stderr: 'compose error', status: 1 })
    const { startTestStackContainers } = await import('../../src/lib/docker')
    expect(() =>
      startTestStackContainers(
        {
          composeFile: 'docker-compose.test.yml',
          projectName: 'ai-test',
          env: {},
        },
        runner,
      ),
    ).toThrow(/docker compose up failed/)
  })
})

describe('stopTestStackContainers (mock spawn)', () => {
  it('строит правильную команду docker compose down и НЕ throws при non-zero', async () => {
    let captured: { cmd: string; args: readonly string[] } | null = null
    const runner: SpawnRunner = (cmd, args) => {
      captured = { cmd, args }
      return { stdout: '', stderr: 'compose error', status: 1 }
    }
    const { stopTestStackContainers } = await import('../../src/lib/docker')
    expect(() =>
      stopTestStackContainers(
        {
          composeFile: 'docker-compose.test.yml',
          projectName: 'ai-test',
        },
        runner,
      ),
    ).not.toThrow()
    expect(captured!.args).toEqual([
      'compose',
      '-p',
      'ai-test',
      '-f',
      'docker-compose.test.yml',
      'down',
      '-v',
      '--remove-orphans',
    ])
  })
})
