// Классификатор bash-команд: считается ли команда мутирующей для shared state.
//
// Нужен не для блокировок (reader-роли убраны), а как справочник для
// вспомогательной логики: например, что можно смело запускать параллельно, а
// что держит shared test-инфру. Используется в тестах и потенциально в будущих
// hook-ах (например, для предупреждений пользователя перед dangerous command).
//
// Логика: разбиваем на подкоманды по ';', '&&', '||', '|', '&'. Проверяем каждую.
// Любая мутирующая подкоманда → вся команда мутирующая.
const MUTATING_GIT_SUBCOMMANDS = new Set([
    'commit',
    'checkout',
    'switch',
    'merge',
    'rebase',
    'reset',
    'stash',
    'push',
    'pull',
    'fetch',
    'add',
    'rm',
    'mv',
    'restore',
    'clean',
    'tag',
    'branch',
    'cherry-pick',
    'revert',
    'apply',
    'worktree',
]);
const READONLY_GIT_SUBCOMMANDS = new Set([
    'log',
    'diff',
    'show',
    'status',
    'blame',
    'grep',
    'ls-files',
    'ls-tree',
    'rev-parse',
    'rev-list',
    'describe',
    'config',
    'remote',
    'shortlog',
    'reflog',
    'bisect',
]);
const MUTATING_BUN_SCRIPTS = new Set([
    'test:e2e',
    'test:e2e:ui',
    'test:integration',
    'test:component',
    'test:server',
    'test:db:up',
    'test:db:down',
    'test:db:migrate',
    'test:watch',
    'test:schemas',
    'test',
    'dev',
    'build',
    'generate',
    'preview',
    'lint:fix',
    'fmt',
    'migration:merge',
    'migration:seed-billing',
    'migration:seed-billing:clean',
]);
const MUTATING_PROJECT_SCRIPTS = new Set(['release:tests', 'preview:branch', 'preview:reset', 'commit:mine']);
const DESTRUCTIVE_UNIX = new Set(['rm', 'mv', 'cp', 'chmod', 'chown', 'mkdir', 'rmdir', 'touch', 'ln']);
const DESTRUCTIVE_POWERSHELL = new Set([
    'remove-item',
    'move-item',
    'copy-item',
    'new-item',
    'set-content',
    'add-content',
    'out-file',
]);
export function isMutatingBash(command) {
    if (!command || !command.trim()) {
        return { mutating: false, reason: null };
    }
    const subCommands = splitCommand(command);
    for (const sub of subCommands) {
        const verdict = classifySubCommand(sub);
        if (verdict.mutating) {
            return verdict;
        }
    }
    return { mutating: false, reason: null };
}
function splitCommand(cmd) {
    // Упрощённый splitter: уважает кавычки, игнорирует операторы внутри строк.
    const out = [];
    let buf = '';
    let i = 0;
    let quote = null;
    while (i < cmd.length) {
        const ch = cmd[i];
        if (quote) {
            buf += ch;
            if (ch === quote && cmd[i - 1] !== '\\') {
                quote = null;
            }
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            buf += ch;
            i++;
            continue;
        }
        const two = cmd.slice(i, i + 2);
        if (two === '&&' || two === '||') {
            pushIfNotEmpty(out, buf);
            buf = '';
            i += 2;
            continue;
        }
        if (ch === ';' || ch === '|' || ch === '&') {
            pushIfNotEmpty(out, buf);
            buf = '';
            i++;
            continue;
        }
        buf += ch;
        i++;
    }
    pushIfNotEmpty(out, buf);
    return out;
}
function pushIfNotEmpty(list, part) {
    const trimmed = part.trim();
    if (trimmed) {
        list.push(trimmed);
    }
}
function classifySubCommand(sub) {
    const token = tokenize(sub);
    if (!token) {
        return { mutating: false, reason: null };
    }
    const binary = token.binary.toLowerCase();
    const bin = basename(binary);
    if (bin === 'git' || bin === 'git.exe') {
        return classifyGit(token.args);
    }
    if (bin === 'bun' || bin === 'bun.exe' || bin === 'bunx' || bin === 'bunx.exe') {
        return classifyBun(bin, token.args);
    }
    if (bin === 'docker' || bin === 'docker.exe') {
        return classifyDocker(token.args);
    }
    if (bin === 'npm' || bin === 'pnpm' || bin === 'yarn') {
        return classifyNpmLike(token.args);
    }
    if (bin === 'playwright' || bin === 'playwright.exe') {
        return { mutating: true, reason: `playwright управляет shared test-стендом (${sub})` };
    }
    if (bin === 'npx') {
        if (token.args[0] === 'playwright') {
            return { mutating: true, reason: `npx playwright управляет shared test-стендом` };
        }
    }
    if (DESTRUCTIVE_UNIX.has(bin)) {
        return { mutating: true, reason: `${bin} меняет файловую систему` };
    }
    if (DESTRUCTIVE_POWERSHELL.has(bin)) {
        return { mutating: true, reason: `${bin} меняет файловую систему` };
    }
    return { mutating: false, reason: null };
}
function classifyGit(args) {
    const sub = findFirstNonFlag(args);
    if (!sub) {
        return { mutating: false, reason: null };
    }
    if (MUTATING_GIT_SUBCOMMANDS.has(sub)) {
        return { mutating: true, reason: `git ${sub} меняет состояние репозитория` };
    }
    if (READONLY_GIT_SUBCOMMANDS.has(sub)) {
        return { mutating: false, reason: null };
    }
    // Неизвестные git-подкоманды — по-умолчанию считаем мутирующими (безопаснее).
    return { mutating: true, reason: `git ${sub} не в списке readonly — блокируем для reader` };
}
function classifyBun(bin, args) {
    // `bun <file>` / `bun run <script>` / `bun <script>` (bun умеет запускать script из package.json без run)
    const first = findFirstNonFlag(args);
    if (!first) {
        return { mutating: false, reason: null };
    }
    // bun x / bunx — аналог npx
    if (bin.startsWith('bunx') || first === 'x') {
        const innerArgs = first === 'x' ? args.slice(args.indexOf('x') + 1) : args;
        const next = findFirstNonFlag(innerArgs);
        if (next === 'playwright') {
            return { mutating: true, reason: 'bunx playwright управляет shared test-стендом' };
        }
        return { mutating: false, reason: null };
    }
    const script = first === 'run' ? findFirstNonFlag(args.slice(args.indexOf('run') + 1)) : first;
    if (!script) {
        return { mutating: false, reason: null };
    }
    if (MUTATING_BUN_SCRIPTS.has(script) || MUTATING_PROJECT_SCRIPTS.has(script)) {
        return { mutating: true, reason: `bun ${script} меняет репо/инфру/БД` };
    }
    // Специальная обработка test:unit — readonly
    if (script === 'test:unit' || script === 'typecheck' || script === 'lint' || script === 'fmt:check') {
        return { mutating: false, reason: null };
    }
    // Неизвестные scripts из package.json — считаем мутирующими для безопасности.
    if (script.startsWith('migration:') || script.startsWith('test:') || script.startsWith('dev')) {
        return { mutating: true, reason: `bun ${script} вероятно мутирующая` };
    }
    return { mutating: false, reason: null };
}
function classifyDocker(args) {
    const sub = findFirstNonFlag(args);
    if (!sub) {
        return { mutating: false, reason: null };
    }
    const mutating = new Set(['run', 'rm', 'kill', 'start', 'stop', 'restart', 'pull', 'push', 'build', 'commit', 'exec']);
    if (mutating.has(sub)) {
        return { mutating: true, reason: `docker ${sub} меняет контейнеры/образы` };
    }
    if (sub === 'compose') {
        const next = findFirstNonFlag(args.slice(args.indexOf(sub) + 1));
        if (next && ['up', 'down', 'rm', 'kill', 'start', 'stop', 'restart', 'build', 'pull', 'exec'].includes(next)) {
            return { mutating: true, reason: `docker compose ${next} меняет инфру` };
        }
    }
    return { mutating: false, reason: null };
}
function classifyNpmLike(args) {
    const sub = findFirstNonFlag(args);
    if (!sub) {
        return { mutating: false, reason: null };
    }
    const mutating = new Set(['install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update', 'run', 'exec', 'publish']);
    if (mutating.has(sub)) {
        return { mutating: true, reason: `${sub} ставит/меняет зависимости или запускает скрипт` };
    }
    return { mutating: false, reason: null };
}
function tokenize(sub) {
    const parts = sub.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    if (!parts || parts.length === 0) {
        return null;
    }
    return {
        binary: unquote(parts[0]),
        args: parts.slice(1).map(unquote),
    };
}
function unquote(s) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}
function basename(path) {
    const unixBase = path.split('/').pop() ?? path;
    return unixBase.split('\\').pop() ?? unixBase;
}
function findFirstNonFlag(args) {
    for (const a of args) {
        if (!a.startsWith('-')) {
            return a;
        }
    }
    return null;
}
