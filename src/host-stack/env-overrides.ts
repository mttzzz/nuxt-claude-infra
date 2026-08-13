/* Переопределения инфраструктуры из окружения.
 *
 * Вне дорожки (lane) переменных HOSTSTACK_* нет и функция ничего не делает — поведение
 * проектов не меняется. Внутри дорожки тесты идут в runner-поде: Postgres общий и живёт по
 * DNS-имени сервиса, Redis свой в namespace, а базовое имя БД включает имя дорожки, иначе
 * две дорожки одного проекта подрались бы за одни и те же _w{N}.
 *
 * Порты preview-серверов НЕ переопределяются: у пода свой сетевой namespace, поэтому
 * portBase + workerId приватен и одинаков у всех дорожек.
 */
import type { ResolvedHostStackOptions } from './define-config.js'

function intFromEnv(key: string): number | undefined {
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return undefined
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) throw new Error(`${key}=${raw} — ожидалось число`)
  return n
}

export function applyEnvOverrides(o: ResolvedHostStackOptions): void {
  o.dbBase = process.env.HOSTSTACK_DB_BASE ?? o.dbBase
  o.dbHost = process.env.HOSTSTACK_DB_HOST ?? o.dbHost
  o.dbPort = intFromEnv('HOSTSTACK_DB_PORT') ?? o.dbPort
  o.dbUser = process.env.HOSTSTACK_DB_USER ?? o.dbUser
  o.dbPassword = process.env.HOSTSTACK_DB_PASSWORD ?? o.dbPassword
  o.redisHost = process.env.HOSTSTACK_REDIS_HOST ?? o.redisHost
  o.redisPort = intFromEnv('HOSTSTACK_REDIS_PORT') ?? o.redisPort
  o.redisPassword = process.env.HOSTSTACK_REDIS_PASSWORD ?? o.redisPassword
  o.redisDbBase = intFromEnv('HOSTSTACK_REDIS_DB_BASE') ?? o.redisDbBase
}
