import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isInfraProject } from '../../src/lib/is-infra-project'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'nci-infra-'))
}

describe('isInfraProject', () => {
  it('false когда cwd пуст', () => {
    const dir = makeDir()
    try {
      expect(isInfraProject(dir)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('true когда есть .claude-infra.json (даже пустой)', () => {
    const dir = makeDir()
    try {
      writeFileSync(join(dir, '.claude-infra.json'), '{}', 'utf8')
      expect(isInfraProject(dir)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('true когда package.json имеет @mttzzz/nuxt-claude-infra в dependencies', () => {
    const dir = makeDir()
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { '@mttzzz/nuxt-claude-infra': 'github:...' } }),
        'utf8',
      )
      expect(isInfraProject(dir)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('true когда package.json имеет пакет в devDependencies', () => {
    const dir = makeDir()
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ devDependencies: { '@mttzzz/nuxt-claude-infra': '*' } }),
        'utf8',
      )
      expect(isInfraProject(dir)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('false когда package.json есть, но без нашего пакета', () => {
    const dir = makeDir()
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { vue: '^3.0' } }),
        'utf8',
      )
      expect(isInfraProject(dir)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('false при невалидном JSON в package.json', () => {
    const dir = makeDir()
    try {
      writeFileSync(join(dir, 'package.json'), '{invalid json', 'utf8')
      expect(isInfraProject(dir)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
