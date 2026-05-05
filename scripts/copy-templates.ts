import { mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src/templates'
const DEST = 'dist/templates'

mkdirSync(DEST, { recursive: true })
const files = readdirSync(SRC)
for (const file of files) {
  copyFileSync(join(SRC, file), join(DEST, file))
}
console.log(`Copied ${files.length} template(s) to ${DEST}/`)
