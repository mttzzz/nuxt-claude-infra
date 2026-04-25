// Кросс-runtime проверка «текущий файл запущен как entrypoint».
//
// Bun: `import.meta.main` есть искаропки.
// Node ESM: то же значение можно получить, сравнив `process.argv[1]` с file-path
// текущего модуля. Работает на любой Node ≥20.
//
// Использование (CLI/hook entry):
//   if (isMainModule(import.meta)) { ... }
import { fileURLToPath } from 'node:url';
export function isMainModule(meta) {
    // Bun-fast-path.
    const bunMain = meta.main;
    if (typeof bunMain === 'boolean')
        return bunMain;
    if (!meta.url || !process.argv[1])
        return false;
    try {
        return fileURLToPath(meta.url) === process.argv[1];
    }
    catch {
        return false;
    }
}
