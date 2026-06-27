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
  /** Per-machine RAM override for the server, in MB. Absent = use DEFAULT_CONFIG.
   *  Deliberately NOT in the repo/git config: Mike's PC and Patit's Mac have
   *  different amounts of RAM, so this stays local to each machine. */
  maxRamMB?: number
  /** Whether auto-notify `say` pings are sent on server events. Absent = on;
   *  only an explicit `false` disables it. Local per-machine preference. */
  notifyPlayers?: boolean
}

/** Parse a JVM heap string like "4G" or "2048M" into whole megabytes. */
export function parseHeapMB(s: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([GMgm])?\s*$/.exec(s)
  if (!m) return 0
  const n = parseFloat(m[1])
  return Math.round((m[2] || 'M').toUpperCase() === 'G' ? n * 1024 : n)
}

/** The default max heap (-Xmx) in MB, from DEFAULT_CONFIG. */
export function defaultMemoryMB(): number {
  return parseHeapMB(DEFAULT_CONFIG.xmx)
}

/**
 * JVM heap flags for spawning the server. With a per-machine RAM override we set
 * -Xms == -Xmx: a single fixed-size heap avoids the GC resize pauses that show up
 * as solo "Can't keep up!" hitches. With no override we fall back to the pinned
 * config values (Xms 2G / Xmx 4G), preserving the original behaviour.
 */
export function memoryFlags(cfg: AppConfig, overrideMB: number | null): { xms: string; xmx: string } {
  if (overrideMB && overrideMB > 0) {
    const v = `${Math.round(overrideMB)}M`
    return { xms: v, xmx: v }
  }
  return { xms: cfg.xms, xmx: cfg.xmx }
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

/** The saved per-machine RAM override in MB, or null when none is set. */
export function loadMemoryMB(): number | null {
  const v = loadSettings().maxRamMB
  return typeof v === 'number' && v > 0 ? v : null
}

/** Save (or clear, when null) the per-machine RAM override in MB. */
export function setMemoryMB(mb: number | null): void {
  const s = loadSettings()
  if (mb && mb > 0) s.maxRamMB = Math.round(mb)
  else delete s.maxRamMB
  saveSettings(s)
}

/** Whether auto-notify `say` pings are enabled. Defaults TRUE when unset —
 *  only an explicit stored `false` turns notifications off. */
export function loadNotify(): boolean {
  return loadSettings().notifyPlayers !== false
}

/** Persist the auto-notify toggle. Always written (true or false). */
export function setNotify(on: boolean): void {
  const s = loadSettings()
  s.notifyPlayers = on
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
