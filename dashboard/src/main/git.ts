import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import archiver from 'archiver'
import type { RepoPaths, AppConfig } from './paths'

export type Logger = (line: string) => void

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

export interface LockInfo {
  status: string
  holder: string
  machine: string
  since: string
  note: string
}

/** Run a git command in the repo. Never throws — returns the exit code. */
export function git(root: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', root, ...args], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: stderr + String(e) }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

export function readLock(paths: RepoPaths): LockInfo {
  const lock: LockInfo = { status: 'free', holder: '', machine: '', since: '', note: '' }
  try {
    const text = readFileSync(paths.lockFile, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([^=#]+?)\s*=\s*(.*)$/)
      if (m) (lock as unknown as Record<string, string>)[m[1].trim()] = m[2].trim()
    }
  } catch {
    /* no lock file yet */
  }
  return lock
}

export async function whoami(root: string): Promise<string> {
  const r = await git(root, ['config', 'user.name'])
  return r.stdout.trim() || os.userInfo().username
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function nowStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function dateStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

async function writeLock(paths: RepoPaths, root: string, status: string, note: string): Promise<void> {
  const lines = [
    `status=${status}`,
    `holder=${await whoami(root)}`,
    `machine=${os.hostname()}`,
    `since=${nowStamp()}`,
    `note=${note}`
  ]
  writeFileSync(paths.lockFile, lines.join('\n') + '\n')
}

async function haveUpstream(root: string, branch: string): Promise<boolean> {
  const r = await git(root, ['ls-remote', '--exit-code', '--heads', 'origin', branch])
  return r.code === 0
}

export interface AcquireResult {
  ok: boolean
  reason?: string
}

/** Pull latest, then claim the baton lock so the other machine can't host too. */
export async function acquire(paths: RepoPaths, cfg: AppConfig, log: Logger, force = false): Promise<AcquireResult> {
  const root = paths.root

  const st = await git(root, ['status', '--porcelain'])
  if (st.stdout.trim()) {
    log('Found unsaved local changes — committing them (recovery)...')
    await git(root, ['add', '-A'])
    await git(root, ['commit', '-m', `auto-save: recovered local changes (${await whoami(root)})`])
  }

  if (await haveUpstream(root, cfg.branch)) {
    log('Pulling the latest world from GitHub...')
    const pull = await git(root, ['pull', '--rebase', '--autostash', 'origin', cfg.branch])
    if (pull.code !== 0) {
      return { ok: false, reason: 'Could not pull the latest world (possible sync conflict). See the README.' }
    }
  } else {
    log('No world on GitHub yet (first run) — skipping pull.')
  }

  const lock = readLock(paths)
  const me = await whoami(root)
  if (lock.status === 'active' && lock.holder !== me && !force) {
    return {
      ok: false,
      reason: `LOCKED: ${lock.holder} (on ${lock.machine}) has been hosting since ${lock.since}. Only one person can host at a time.`
    }
  }

  await writeLock(paths, root, 'active', 'playing')
  await git(root, ['add', 'SESSION-LOCK.txt'])
  await git(root, ['commit', '-m', `lock: ${me} started a session`])
  if (await haveUpstream(root, cfg.branch)) {
    const push = await git(root, ['push', 'origin', cfg.branch])
    if (push.code !== 0) {
      return { ok: false, reason: 'Could not claim the lock (someone may have just started). Try again in a moment.' }
    }
  }
  log('Lock acquired — you are clear to play.')
  return { ok: true }
}

function zipWorld(worldDir: string, destZip: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(destZip)
    const archive = archiver('zip', { zlib: { level: 9 } })
    out.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(out)
    archive.directory(worldDir, 'world')
    void archive.finalize()
  })
}

async function newBackup(paths: RepoPaths, cfg: AppConfig, log: Logger): Promise<void> {
  if (!existsSync(paths.worldDir)) return
  if (!existsSync(paths.backupsDir)) mkdirSync(paths.backupsDir, { recursive: true })
  const name = `world-${dateStamp()}.zip`
  const dest = join(paths.backupsDir, name)
  try {
    if (existsSync(dest)) rmSync(dest, { force: true })
    log(`Creating backup ${name} ...`)
    await zipWorld(paths.worldDir, dest)
  } catch (e) {
    log(`WARNING: backup zip failed (${String(e)}). The world is still saved in Git.`)
    return
  }
  const zips = readdirSync(paths.backupsDir)
    .filter((f) => /^world-\d+\.zip$/.test(f))
    .sort()
    .reverse()
  for (const old of zips.slice(cfg.backupKeep)) {
    rmSync(join(paths.backupsDir, old), { force: true })
  }
}

/** Save world -> backup -> commit -> release lock -> push. */
export async function releaseAndPush(paths: RepoPaths, cfg: AppConfig, log: Logger): Promise<void> {
  const root = paths.root
  log('Saving the world and uploading to GitHub...')
  await newBackup(paths, cfg, log)
  await git(root, ['add', '-A'])
  await git(root, ['commit', '-m', `World save: ${await whoami(root)} ${nowStamp()}`])
  await writeLock(paths, root, 'free', 'released')
  await git(root, ['add', 'SESSION-LOCK.txt'])
  await git(root, ['commit', '-m', `lock: released by ${await whoami(root)}`])
  if (await haveUpstream(root, cfg.branch)) {
    await git(root, ['pull', '--rebase', '--autostash', 'origin', cfg.branch])
    const push = await git(root, ['push', 'origin', cfg.branch])
    if (push.code !== 0) {
      log('WARNING: upload (push) failed. World is saved & committed locally — push later when online.')
      return
    }
  } else {
    await git(root, ['push', '-u', 'origin', cfg.branch])
  }
  log('Done — world uploaded. Safe to start again or close.')
}

export async function forceUnlock(paths: RepoPaths, cfg: AppConfig, log: Logger): Promise<void> {
  const root = paths.root
  log('Forcing the session lock to FREE...')
  if (await haveUpstream(root, cfg.branch)) {
    await git(root, ['pull', '--rebase', '--autostash', 'origin', cfg.branch])
  }
  await writeLock(paths, root, 'free', `force-unlocked by ${await whoami(root)}`)
  await git(root, ['add', 'SESSION-LOCK.txt'])
  await git(root, ['commit', '-m', `lock: force-unlocked by ${await whoami(root)}`])
  if (await haveUpstream(root, cfg.branch)) {
    await git(root, ['push', 'origin', cfg.branch])
  }
  log('Lock cleared. You can start now.')
}
