import { existsSync, readFileSync } from 'node:fs';
function parseEnvFile(path) {
    if (!existsSync(path)) {
        return {};
    }
    const out = {};
    for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const idx = line.indexOf('=');
        if (idx === -1) {
            continue;
        }
        const key = line.slice(0, idx).trim();
        let value = line.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}
export function readDevDbConfig(opts = {}) {
    const env = parseEnvFile(opts.envPath ?? '.env');
    const host = env.NUXT_DB_HOST || '127.0.0.1';
    const port = Number.parseInt(env.NUXT_DB_PORT ?? '3306', 10);
    const user = env.NUXT_DB_USER || 'root';
    const password = env.NUXT_DB_PASSWORD || 'root';
    const database = env.NUXT_DB_NAME || opts.defaultDatabase || '';
    return { host, port, user, password, database };
}
