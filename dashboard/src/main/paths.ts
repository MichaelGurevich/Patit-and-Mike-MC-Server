import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface AppConfig {
  xms: string
  xmx: string
  branch: string
  javaMin: number
  backupKeep: number
}

export const DEFAULT_CONFIG: AppConfig = {
  xms: '2G',
  xmx: '4G',
  branch: 'main',
  javaMin: 25,
  backupKeep: 10
}

interface Settings {
  repoRoot?: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8')) as Settings
  } catch {
    return {}
  }
}

function saveSettings(s: Settings): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
  } catch {
    /* ignore */
  }
}

/** A folder is the repo root if it has SESSION-LOCK.txt, or a server/ dir + .git. */
export function looksLikeRepo(dir: string): boolean {
  return (
    existsSync(join(dir, 'SESSION-LOCK.txt')) ||
    (existsSync(join(dir, 'server')) && existsSync(join(dir, '.git')))
  )
}

function walkUp(start: string): string | null {
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (looksLikeRepo(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Resolve the Minecraft repo root: saved setting, else walk up from likely spots. */
export function findRepoRoot(): string | null {
  const saved = loadSettings().repoRoot
  if (saved && looksLikeRepo(saved)) return saved
  for (const c of [process.cwd(), app.getAppPath(), __dirname]) {
    const found = walkUp(c)
    if (found) return found
  }
  return null
}

export function setRepoRoot(dir: string): void {
  const s = loadSettings()
  s.repoRoot = dir
  saveSettings(s)
}

export interface RepoPaths {
  root: string
  serverDir: string
  worldDir: string
  backupsDir: string
  lockFile: string
  jarFile: string
}

export function repoPaths(root: string): RepoPaths {
  const serverDir = join(root, 'server')
  return {
    root,
    serverDir,
    worldDir: join(serverDir, 'world'),
    backupsDir: join(root, 'backups'),
    lockFile: join(root, 'SESSION-LOCK.txt'),
    jarFile: join(serverDir, 'server.jar')
  }
}
