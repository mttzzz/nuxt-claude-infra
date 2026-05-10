/* Worker ID resolution: vitest и playwright по-разному передают индекс параллельного runner'а.
 * Возвращаем 1-indexed worker id, ОГРАНИЧЕННЫЙ workerCountDefault через modulo —
 * vitest монотонно увеличивает VITEST_POOL_ID (re-use forks с isolate:false не сбрасывает счётчик),
 * а серверов всего N. Маппинг: workerId = ((rawId - 1) mod N) + 1.
 *
 * Источники raw id (в порядке приоритета):
 *   1. TEST_WORKER_ID — explicit override (отладка/CLI).
 *   2. VITEST_POOL_ID — vitest 2+ ставит для каждого fork (1-indexed).
 *   3. TEST_PARALLEL_INDEX — playwright ставит worker.parallelIndex (0-indexed).
 *   4. Дефолт 1.
 */
export function resolveWorkerId(workerCountDefault: number = 4): number {
  const raw = resolveRawId()
  const cap = resolveCap(workerCountDefault)
  return ((raw - 1) % cap) + 1
}

function resolveRawId(): number {
  const override = process.env.TEST_WORKER_ID
  if (override) {
    const n = Number.parseInt(override, 10)
    if (Number.isFinite(n) && n >= 1) return n
  }
  const vitestId = process.env.VITEST_POOL_ID
  if (vitestId) {
    const n = Number.parseInt(vitestId, 10)
    if (Number.isFinite(n) && n >= 1) return n
  }
  const playwrightIdx = process.env.TEST_PARALLEL_INDEX
  if (playwrightIdx) {
    const n = Number.parseInt(playwrightIdx, 10)
    if (Number.isFinite(n) && n >= 0) return n + 1 /* 0-indexed → 1-indexed */
  }
  return 1
}

function resolveCap(workerCountDefault: number): number {
  const raw = process.env.TEST_WORKERS
  if (!raw) return workerCountDefault
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? n : workerCountDefault
}
