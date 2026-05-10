import { afterEach, describe, expect, it } from 'bun:test'

import { resolveWorkerId } from '../../src/host-stack/helpers/worker-id.js'

const KEYS = ['TEST_WORKER_ID', 'VITEST_POOL_ID', 'TEST_PARALLEL_INDEX', 'TEST_WORKERS'] as const

describe('resolveWorkerId', () => {
  afterEach(() => {
    for (const k of KEYS) delete process.env[k]
  })

  it('default 1 без env', () => {
    expect(resolveWorkerId()).toBe(1)
  })

  it('TEST_WORKER_ID имеет высший приоритет', () => {
    process.env.TEST_WORKER_ID = '7'
    process.env.VITEST_POOL_ID = '3'
    process.env.TEST_PARALLEL_INDEX = '5'
    /* cap = TEST_WORKERS env (NaN → fallback default 4 → modulo 4 → ((7-1)%4)+1=3) */
    expect(resolveWorkerId(4)).toBe(3)
  })

  it('VITEST_POOL_ID 1-indexed', () => {
    process.env.VITEST_POOL_ID = '2'
    expect(resolveWorkerId(4)).toBe(2)
  })

  it('TEST_PARALLEL_INDEX 0-indexed → +1', () => {
    process.env.TEST_PARALLEL_INDEX = '0'
    expect(resolveWorkerId(4)).toBe(1)
    process.env.TEST_PARALLEL_INDEX = '3'
    expect(resolveWorkerId(4)).toBe(4)
  })

  it('modulo по N: VITEST_POOL_ID > N → cyclic', () => {
    process.env.VITEST_POOL_ID = '5'
    expect(resolveWorkerId(4)).toBe(1) /* ((5-1)%4)+1 = 1 */
    process.env.VITEST_POOL_ID = '8'
    expect(resolveWorkerId(4)).toBe(4) /* ((8-1)%4)+1 = 4 */
    process.env.VITEST_POOL_ID = '20'
    expect(resolveWorkerId(4)).toBe(4) /* ((20-1)%4)+1 = 4 */
  })

  it('TEST_WORKERS env переопределяет default cap', () => {
    process.env.TEST_WORKERS = '8'
    process.env.VITEST_POOL_ID = '5'
    expect(resolveWorkerId(4)).toBe(5) /* cap=8 → ((5-1)%8)+1 = 5 */
  })
})
