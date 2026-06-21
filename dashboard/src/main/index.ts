import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { findRepoRoot, setRepoRoot, repoPaths, looksLikeRepo, DEFAULT_CONFIG } from './paths'
import { ServerController, type ServerState } from './server'
import { forceUnlock, readLock } from './git'
import { readRoster } from './players'
import { getCapabilities } from './capabilities'
import { readProperties, setProperty } from './properties'

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
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1000,
    height: 740,
    minWidth: 760,
    minHeight: 520,
    title: 'MC Server Dashboard',
    backgroundColor: '#0f1216',
    autoHideMenuBar: true,
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
  ipcMain.handle('getRoster', () => (repoRoot ? readRoster(repoPaths(repoRoot)) : []))
  ipcMain.handle('getCapabilities', () => (repoRoot ? getCapabilities(repoRoot, DEFAULT_CONFIG) : null))
  ipcMain.handle('getProps', () => (repoRoot ? readProperties(repoPaths(repoRoot)) : {}))
  ipcMain.handle('setDifficulty', (_e, value: string) => {
    if (!repoRoot) return
    // Persist for next start (and Git sync) AND apply live if the server is up.
    setProperty(repoPaths(repoRoot), 'difficulty', value)
    controller?.send(`difficulty ${value}`)
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
