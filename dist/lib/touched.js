// Учёт файлов, которые правила текущая Claude-сессия.
//
// Модель: все сессии работают в одной ветке одного worktree без блокировок.
// Чтобы никто случайно не закоммитил правки соседней сессии, каждая сессия
// ведёт список своих touched-файлов и коммитит только его явно через `bun commit:mine`.
//
// Хранилище: `.claude/sessions/<sessionId>/touched.txt` — построчный список путей
// относительно корня репо, уникальный, стабильный порядок (сортируем при чтении).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
export const DEFAULT_SESSIONS_DIR = '.claude/sessions';
function sessionDir(sessionsDir, sessionId) {
    return join(sessionsDir, sessionId);
}
function touchedPath(sessionsDir, sessionId) {
    return join(sessionDir(sessionsDir, sessionId), 'touched.txt');
}
function normalizePath(input, cwd = process.cwd()) {
    if (!input) {
        return null;
    }
    const abs = isAbsolute(input) ? input : resolve(cwd, input);
    const rel = relative(cwd, abs).replaceAll('\\', '/');
    if (!rel || rel.startsWith('..')) {
        return null;
    }
    return rel;
}
export function readTouched(sessionsDir, sessionId) {
    const file = touchedPath(sessionsDir, sessionId);
    if (!existsSync(file)) {
        return [];
    }
    const raw = readFileSync(file, 'utf8');
    const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    return [...new Set(lines)].sort();
}
export function addTouched(sessionsDir, sessionId, filePath, cwd = process.cwd()) {
    const rel = normalizePath(filePath, cwd);
    if (!rel) {
        return;
    }
    const dir = sessionDir(sessionsDir, sessionId);
    mkdirSync(dir, { recursive: true });
    const existing = new Set(readTouched(sessionsDir, sessionId));
    if (existing.has(rel)) {
        return;
    }
    existing.add(rel);
    const out = [...existing].sort().join('\n') + '\n';
    writeFileSync(touchedPath(sessionsDir, sessionId), out, 'utf8');
}
export function clearTouched(sessionsDir, sessionId) {
    const dir = sessionDir(sessionsDir, sessionId);
    if (existsSync(dir)) {
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            // ignore
        }
    }
}
