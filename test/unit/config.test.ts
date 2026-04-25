import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  deriveDockerProjectPrefix,
  deriveProjectSlug,
  deriveTestDbName,
  loadProjectConfig,
  ProjectConfigInputSchema,
  resolveProjectConfig,
} from '../../src/config'

describe('deriveProjectSlug', () => {
  it.each([
    ['/projects/ai.pushka.biz', 'ai.pushka'],
    ['/projects/easy2.pushka.biz', 'easy2.pushka'],
    ['/projects/kp.modmb.com', 'kp.modmb'],
    ['/projects/myapp', 'myapp'],
    ['/projects/foo.bar', 'foo'],
  ])('%s → %s', (cwd, expected) => {
    expect(deriveProjectSlug(cwd)).toBe(expected)
  })
})

describe('deriveDockerProjectPrefix', () => {
  it.each([
    ['/projects/ai.pushka.biz', 'ai-pushka-test'],
    ['/projects/easy2.pushka.biz', 'easy2-pushka-test'],
    ['/projects/octane.pushka.biz', 'octane-pushka-test'],
    ['/projects/myapp', 'myapp-test'],
  ])('%s → %s', (cwd, expected) => {
    expect(deriveDockerProjectPrefix(cwd)).toBe(expected)
  })
})

describe('deriveTestDbName', () => {
  it.each([
    ['/projects/ai.pushka.biz', 'ai_pushka_test'],
    ['/projects/easy2.pushka.biz', 'easy2_pushka_test'],
    ['/projects/my-app', 'my_app_test'],
  ])('%s → %s', (cwd, expected) => {
    expect(deriveTestDbName(cwd)).toBe(expected)
  })
})

describe('resolveProjectConfig', () => {
  it('возвращает full convention-defaults когда input undefined', () => {
    const config = resolveProjectConfig(undefined, '/projects/ai.pushka.biz')
    expect(config.dockerProjectPrefix).toBe('ai-pushka-test')
    expect(config.testDbName).toBe('ai_pushka_test')
    expect(config.mcpMysqlToolsPrefix).toBeUndefined()
    expect(config.ports.mcp).toEqual([3100, 3199])
    expect(config.paths.dockerCompose).toBe('docker-compose.test.yml')
    expect(config.killZombiesPatterns.length).toBeGreaterThan(0)
  })

  it('override из input побеждает над convention', () => {
    const config = resolveProjectConfig({ dockerProjectPrefix: 'custom-prefix' }, '/projects/ai.pushka.biz')
    expect(config.dockerProjectPrefix).toBe('custom-prefix')
    // testDbName всё ещё convention
    expect(config.testDbName).toBe('ai_pushka_test')
  })

  it('mcpMysqlToolsPrefix передаётся как есть (нет convention)', () => {
    const config = resolveProjectConfig({ mcpMysqlToolsPrefix: 'mcp__ai__' }, '/projects/ai.pushka.biz')
    expect(config.mcpMysqlToolsPrefix).toBe('mcp__ai__')
  })
})

describe('loadProjectConfig', () => {
  it('файл отсутствует → defaults c convention', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nci-config-'))
    try {
      const config = await loadProjectConfig(join(dir, '.claude-infra.json'), '/projects/ai.pushka.biz')
      expect(config.dockerProjectPrefix).toBe('ai-pushka-test')
      expect(config.testDbName).toBe('ai_pushka_test')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('файл с пустым {} → всё через defaults', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nci-config-'))
    try {
      const path = join(dir, '.claude-infra.json')
      writeFileSync(path, '{}', 'utf8')
      const config = await loadProjectConfig(path, '/projects/easy2.pushka.biz')
      expect(config.dockerProjectPrefix).toBe('easy2-pushka-test')
      expect(config.testDbName).toBe('easy2_pushka_test')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('файл с override — поля побеждают, отсутствующие из convention', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nci-config-'))
    try {
      const path = join(dir, '.claude-infra.json')
      writeFileSync(path, JSON.stringify({ mcpMysqlToolsPrefix: 'mcp__custom__' }), 'utf8')
      const config = await loadProjectConfig(path, '/projects/ai.pushka.biz')
      expect(config.mcpMysqlToolsPrefix).toBe('mcp__custom__')
      expect(config.dockerProjectPrefix).toBe('ai-pushka-test')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('невалидный input — ZodError', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nci-config-'))
    try {
      const path = join(dir, '.claude-infra.json')
      writeFileSync(path, JSON.stringify({ dockerProjectPrefix: 123 }), 'utf8')
      expect(loadProjectConfig(path, '/projects/ai.pushka.biz')).rejects.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('ProjectConfigInputSchema (deprecated alias = ProjectConfigSchema)', () => {
  it('пустой объект валиден', () => {
    expect(() => ProjectConfigInputSchema.parse({})).not.toThrow()
  })
})
