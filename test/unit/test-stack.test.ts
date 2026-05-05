import { describe, expect, it } from 'bun:test'

import {
  allocateWithRetry,
  defineTestStack,
  isHandleAlive,
  type PortAllocator,
  type ContainerStarter,
  type PortFreer,
} from '../../src/lib/test-stack'
import type { SessionPorts } from '../../src/lib/ports'

describe('allocateWithRetry', () => {
  const goodPorts: SessionPorts = { mcp: 3110, test: 3210, db: 3320, redis: 6410 }

  it('успех с первой попытки', async () => {
    let allocCalls = 0, freeCalls = 0, startCalls = 0
    const allocator: PortAllocator = async () => { allocCalls++; return goodPorts }
    const starter: ContainerStarter = async () => { startCalls++ }
    const freer: PortFreer = async () => { freeCalls++ }

    const ports = await allocateWithRetry('sess-1', { allocator, starter, freer, maxAttempts: 3 })
    expect(ports).toEqual(goodPorts)
    expect(allocCalls).toBe(1)
    expect(startCalls).toBe(1)
    expect(freeCalls).toBe(0)
  })

  it('retry один раз при port-conflict, успех на второй', async () => {
    let allocCalls = 0, freeCalls = 0, startCalls = 0
    const allocator: PortAllocator = async () => { allocCalls++; return goodPorts }
    const starter: ContainerStarter = async () => {
      startCalls++
      if (startCalls === 1) throw new Error('Bind for 0.0.0.0:3320 failed: port is already allocated')
    }
    const freer: PortFreer = async () => { freeCalls++ }

    const ports = await allocateWithRetry('sess-1', { allocator, starter, freer, maxAttempts: 3 })
    expect(ports).toEqual(goodPorts)
    expect(allocCalls).toBe(2)
    expect(startCalls).toBe(2)
    expect(freeCalls).toBe(1)
  })

  it('работает с синхронным (void) PortFreer', async () => {
    let allocCalls = 0, freeCalls = 0, startCalls = 0
    const allocator: PortAllocator = async () => { allocCalls++; return goodPorts }
    const starter: ContainerStarter = async () => {
      startCalls++
      if (startCalls === 1) throw new Error('Bind for 0.0.0.0:3320 failed: port is already allocated')
    }
    /* Sync freer — возвращает void, не Promise */
    const freer: PortFreer = () => { freeCalls++ }

    const ports = await allocateWithRetry('sess-sync-freer', { allocator, starter, freer, maxAttempts: 3 })
    expect(ports).toEqual(goodPorts)
    expect(allocCalls).toBe(2)
    expect(startCalls).toBe(2)
    expect(freeCalls).toBe(1)
  })

  it('пробрасывает ошибку, не относящуюся к port-conflict', async () => {
    const allocator: PortAllocator = async () => goodPorts
    const starter: ContainerStarter = async () => { throw new Error('image not found') }
    const freer: PortFreer = async () => {}

    await expect(allocateWithRetry('sess-1', { allocator, starter, freer, maxAttempts: 3 })).rejects.toThrow('image not found')
  })

  it('сдаётся после maxAttempts при постоянном port-conflict', async () => {
    let attempts = 0
    const allocator: PortAllocator = async () => goodPorts
    const starter: ContainerStarter = async () => {
      attempts++
      throw new Error('port is already allocated')
    }
    const freer: PortFreer = async () => {}

    await expect(allocateWithRetry('sess-1', { allocator, starter, freer, maxAttempts: 3 })).rejects.toThrow(/port/i)
    expect(attempts).toBe(3)
  })
})

describe('defineTestStack (factory shape)', () => {
  it('возвращает контроллер с start/stop/current', () => {
    const stack = defineTestStack()
    expect(typeof stack.start).toBe('function')
    expect(typeof stack.stop).toBe('function')
    expect(typeof stack.current).toBe('function')
    expect(stack.current()).toBeNull()
  })
})

describe('isHandleAlive (v0.5.0)', () => {
  it('false для unreachable host (быстрый refusal)', async () => {
    /* Порт, на котором гарантированно ничего не слушает. */
    const result = await isHandleAlive('http://127.0.0.1:1', 2_000)
    expect(result).toBe(false)
  })

  it('false при таймауте (host висит, не отвечает)', async () => {
    /* 192.0.2.x — TEST-NET-1 (RFC 5737), routable но никто не отвечает —
       fetch висит до AbortController-таймаута. */
    const start = Date.now()
    const result = await isHandleAlive('http://192.0.2.1:80', 500)
    const elapsed = Date.now() - start
    expect(result).toBe(false)
    /* Должны уложиться в ~таймаут + небольшой запас, не висеть на 30s default. */
    expect(elapsed).toBeLessThan(2_000)
  })
})
