import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isInfraProject } from '../../src/lib/is-infra-project'

describe('hooks early-return на non-infra cwd', () => {
  it('isInfraProject(empty dir) === false (smoke)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nci-hook-er-'))
    try {
      expect(isInfraProject(dir)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
