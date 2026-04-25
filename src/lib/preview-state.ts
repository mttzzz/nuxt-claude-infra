import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface PreviewState {
  originalBranch: string
  previewBranch: string
  dumpPath: string
  stashed: boolean
  stashRef: string | null
  createdAt: string
}

export const DEFAULT_STATE_PATH = '.preview-state.json'
export const DEFAULT_BACKUPS_DIR = '.preview-backups'

export function readPreviewState(path = DEFAULT_STATE_PATH): PreviewState | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PreviewState
  } catch {
    return null
  }
}

export function writePreviewState(state: PreviewState, path = DEFAULT_STATE_PATH): void {
  const dir = dirname(path)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8')
}

export function clearPreviewState(path = DEFAULT_STATE_PATH): void {
  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch {
      // ignore
    }
  }
}
