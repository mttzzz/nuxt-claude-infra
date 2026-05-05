/*
 * No-op teardown: stack живёт до SessionEnd hook'а пакета (он делает docker compose down).
 * Между прогонами тестов в одной сессии stack переиспользуется.
 */
export default async function globalTeardown(): Promise<void> {
  /* intentionally empty */
}
