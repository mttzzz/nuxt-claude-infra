#!/usr/bin/env node
// bun kill:zombies — прибить всех node/bun-зомби от нашей инфры.
//
// Известные источники:
//   - tinypool worker (orphan после vitest exit)
//   - @playwright/test cli.js test-server (если упал playwright)
//   - bun scripts/test-server.ts и nuxi _dev (если остались от старых прогонов)
//
// Что НЕ трогаем:
//   - Юзерский `bun dev` (3001) и его nuxi dev --host дочки
//   - IDE LSP (oxlint/oxfmt/eslint) — у них живой ppid, под фильтр не попадут
//   - vscode-server и @playwright/mcp (если mcp используется активно)
//   - postgres-mcp и прочие MCP-сервера (свои/parent-привязанные процессы)
//
// Платформа:
//   - Win: исторически "matches → kill" (родитель в выборке wmic не используется).
//   - Unix (mac/linux): дополнительно требуем ppid=1 (orphan), чтобы не задеть пользовательский
//     bun dev 3001 и его tinypool/nuxi-дочки (у них parent живой).
import { setTimeout as delay } from 'node:timers/promises';
import { isMainModule } from '../lib/is-main.js';
import { killTree, listProcs } from '../lib/proc.js';
const IS_WINDOWS = process.platform === 'win32';
export function isCandidate(cmd) {
    if (!cmd)
        return false;
    return (/node_modules[\\/]tinypool[\\/]dist[\\/]entry[\\/]process\.js/.test(cmd) ||
        /@playwright[\\/]test[\\/]cli\.js test-server/.test(cmd) ||
        /scripts[\\/]test-server\.ts/.test(cmd) ||
        (cmd.includes('nuxi') && cmd.includes('_dev')));
}
export function isZombie(p) {
    if (!isCandidate(p.cmd))
        return false;
    if (IS_WINDOWS)
        return true;
    return p.ppid === 1;
}
if (isMainModule(import.meta)) {
    /*
     * Retry-loop: vitest exit → workers ещё в stdout flush / shutdown,
     * появляются с задержкой ~200-500ms. 3 попытки покрывают race.
     */
    let totalKilled = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0)
            await delay(500);
        const zombies = listProcs().filter(isZombie);
        if (zombies.length === 0)
            continue;
        for (const z of zombies) {
            if (killTree(z.pid)) {
                totalKilled++;
                process.stdout.write(`✓ pid=${String(z.pid)} ${z.cmd.slice(0, 80)}\n`);
            }
        }
    }
    if (totalKilled === 0) {
        process.stdout.write('[kill:zombies] зомби не найдены ✅\n');
    }
    else {
        process.stdout.write(`[kill:zombies] убито ${String(totalKilled)}\n`);
    }
}
