import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { totalmem } from 'node:os'
import {
  findRepoRoot,
  setRepoRoot,
  repoPaths,
  looksLikeRepo,
  DEFAULT_CONFIG,
  loadMemoryMB,
  setMemoryMB,
  defaultMemoryMB
} from './paths'
import { ServerController, type ServerState } from './server'
import { forceUnlock, readLock } from './git'
import { readRoster } from './players'
import { getCapabilities } from './capabilities'
import { readProperties, setProperty } from './properties'
import { readGameRules, setGameRule, setGameRules } from './gamerules'
import { getConnectInfo } from './net'

let win: BrowserWindow | null = null
let controller: ServerController | null = null
let repoRoot: string | null = null
let quitting = false

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function buildController(root: string): void {
  const paths = repoPaths(root)
  controller = new ServerController(paths, DEFAULT_CONFIG, {
    log: (line) => send('log', line),
    state: (s: ServerState) => {
      send('state', s)
      if (s === 'stopped' && quitting) app.quit()
    },
    event: (ev) => send('event', ev)
  })
  // Apply the saved per-machine RAM override (if any) so the next start uses it.
  controller.setMemoryMB(loadMemoryMB())
}

const TOTAL_RAM_MB = Math.floor(totalmem() / (1024 * 1024))

/** Keep a requested heap within sane bounds: at least 1 GB, never more than the
 *  machine's physical RAM (allocating beyond it would make things far worse). */
function clampMemoryMB(mb: number | null): number | null {
  if (mb == null || !Number.isFinite(mb) || mb <= 0) return null
  return Math.max(1024, Math.min(Math.round(mb), TOTAL_RAM_MB))
}

function createWindow(): void {
  // Window/taskbar icon for dev runs (the packaged .exe icon is set by
  // electron-builder from build/icon.ico). __dirname is out/main at runtime.
  const iconPath = join(__dirname, '../../build/icon.ico')

  win = new BrowserWindow({
    width: 1000,
    height: 740,
    minWidth: 760,
    minHeight: 520,
    title: 'MC Server Dashboard',
    backgroundColor: '#fdf0d5',
    autoHideMenuBar: true,
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.webContents.on('did-finish-load', () => {
    console.log('[ready] renderer loaded OK')
    if (process.env['SMOKE_TEST']) setTimeout(() => app.quit(), 400)
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[error] renderer failed to load:', code, desc)
    if (process.env['SMOKE_TEST']) app.exit(1)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  repoRoot = findRepoRoot()
  if (repoRoot) buildController(repoRoot)

  ipcMain.handle('getStatus', () => ({
    repoRoot,
    state: controller?.getState() ?? 'idle',
    readyAt: controller?.getReadyAt() ?? null,
    lock: repoRoot ? readLock(repoPaths(repoRoot)) : null
  }))
  ipcMain.handle('start', () => controller?.start())
  ipcMain.handle('stop', () => controller?.stop())
  ipcMain.handle('send', (_e, cmd: string) => controller?.send(cmd))
  ipcMain.handle('setPerf', (_e, on: boolean) => controller?.setPerfPolling(on))
  ipcMain.handle('getMemory', () => {
    const overrideMB = loadMemoryMB()
    return {
      overrideMB, // null when using the default
      defaultMB: defaultMemoryMB(),
      totalMB: TOTAL_RAM_MB
    }
  })
  ipcMain.handle('setMemory', (_e, mb: number | null) => {
    const clamped = clampMemoryMB(mb)
    setMemoryMB(clamped)
    controller?.setMemoryMB(clamped)
    return clamped
  })
  ipcMain.handle('getRoster', () => (repoRoot ? readRoster(repoPaths(repoRoot)) : []))
  ipcMain.handle('getCapabilities', () => (repoRoot ? getCapabilities(repoRoot, DEFAULT_CONFIG) : null))
  ipcMain.handle('getProps', () => (repoRoot ? readProperties(repoPaths(repoRoot)) : {}))
  ipcMain.handle('getConnectInfo', () => {
    const info = getConnectInfo()
    const port = repoRoot ? readProperties(repoPaths(repoRoot))['server-port'] || '25565' : '25565'
    return { ...info, port }
  })
  ipcMain.handle('setDifficulty', (_e, value: string) => {
    if (!repoRoot) return
    // Persist for next start (and Git sync) AND apply live if the server is up.
    setProperty(repoPaths(repoRoot), 'difficulty', value)
    controller?.send(`difficulty ${value}`)
  })
  ipcMain.handle('getGameRules', () => (repoRoot ? readGameRules(repoPaths(repoRoot)) : {}))
  ipcMain.handle('setGameRule', (_e, rule: string, value: string) => {
    if (!repoRoot) return
    // Remember it (synced via Git, re-applied on next start) AND apply live now.
    setGameRule(repoPaths(repoRoot), rule, value)
    controller?.send(`gamerule ${rule} ${value}`)
  })
  ipcMain.handle('setGameRules', (_e, values: Record<string, string>) => {
    if (!repoRoot) return
    setGameRules(repoPaths(repoRoot), values)
    for (const [rule, value] of Object.entries(values)) controller?.send(`gamerule ${rule} ${value}`)
  })
  ipcMain.handle('forceUnlock', async () => {
    if (!repoRoot) return
    await forceUnlock(repoPaths(repoRoot), DEFAULT_CONFIG, (l) => send('log', l))
    send('lock', readLock(repoPaths(repoRoot)))
  })
  ipcMain.handle('chooseRepo', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    const dir = r.filePaths[0]
    if (!looksLikeRepo(dir)) return { ok: false, reason: 'That folder is not the Minecraft server repo.' }
    setRepoRoot(dir)
    repoRoot = dir
    buildController(dir)
    return { ok: true, repoRoot: dir }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// If the server is running when the user quits, stop & save first, then quit.
app.on('before-quit', (e) => {
  if (controller?.isBusy() && !quitting) {
    e.preventDefault()
    quitting = true
    send('log', 'Window closing — stopping the server and saving first...')
    controller.stop()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
