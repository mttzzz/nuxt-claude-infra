import { describe, expect, it } from 'bun:test'
import { createServer } from 'node:net'

import { isPortFree } from '../../src/lib/ports'

/*
 * Regression: на Windows docker-биндинги (0.0.0.0:port → container) НЕ видны как listener
 * на 127.0.0.1, поэтому bind-only-проверка ошибочно говорит "free", а потом docker compose up
 * падает с "port is already allocated". Фикс — dual-check: bind + connect.
 *
 * Тесты используют реальный TCP listener, который ловится обоими методами,
 * и подтверждают что общий результат корректный для реальных сценариев.
 */

function startListener(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.once('listening', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({
        port,
        close: () =>
          new Promise<void>((res) => {
            s.close(() => res())
          }),
      })
    })
    s.listen(0, '127.0.0.1')
  })
}

describe('isPortFree', () => {
  it('returns false when something is listening on 127.0.0.1', async () => {
    const { port, close } = await startListener()
    try {
      expect(await isPortFree(port)).toBe(false)
    } finally {
      await close()
    }
  })

  it('returns false when port accepts connections (Windows docker-bind regression)', async () => {
    /* Реальный listener в этом тесте симулирует "что-то принимает соединения". На Windows
       docker-bind 0.0.0.0:port НЕ виден через bind-only check (bindable=true), но connect
       успешен (accepting=true) — именно эта пара ловится dual-check. На Linux/Mac listener
       блокирует и bind, поэтому тест проходит обоими путями. */
    const { port, close } = await startListener()
    try {
      expect(await isPortFree(port)).toBe(false)
    } finally {
      await close()
    }
  })

  it('returns true after listener fully closed', async () => {
    const { port, close } = await startListener()
    await close() // ensure full async close before isPortFree
    expect(await isPortFree(port)).toBe(true)
  })
})
