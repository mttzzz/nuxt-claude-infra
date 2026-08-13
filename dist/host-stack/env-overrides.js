function intFromEnv(key) {
    const raw = process.env[key];
    if (raw === undefined || raw.trim() === '')
        return undefined;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n))
        throw new Error(`${key}=${raw} — ожидалось число`);
    return n;
}
export function applyEnvOverrides(o) {
    o.dbBase = process.env.HOSTSTACK_DB_BASE ?? o.dbBase;
    o.dbHost = process.env.HOSTSTACK_DB_HOST ?? o.dbHost;
    o.dbPort = intFromEnv('HOSTSTACK_DB_PORT') ?? o.dbPort;
    o.dbUser = process.env.HOSTSTACK_DB_USER ?? o.dbUser;
    o.dbPassword = process.env.HOSTSTACK_DB_PASSWORD ?? o.dbPassword;
    o.redisHost = process.env.HOSTSTACK_REDIS_HOST ?? o.redisHost;
    o.redisPort = intFromEnv('HOSTSTACK_REDIS_PORT') ?? o.redisPort;
    o.redisPassword = process.env.HOSTSTACK_REDIS_PASSWORD ?? o.redisPassword;
    o.redisDbBase = intFromEnv('HOSTSTACK_REDIS_DB_BASE') ?? o.redisDbBase;
}
