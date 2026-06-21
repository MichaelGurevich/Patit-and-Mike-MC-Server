import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getStatus: () => ipcRenderer.invoke('getStatus'),
  start: () => ipcRenderer.invoke('start'),
  stop: () => ipcRenderer.invoke('stop'),
  send: (cmd: string) => ipcRenderer.invoke('send', cmd),
  forceUnlock: () => ipcRenderer.invoke('forceUnlock'),
  chooseRepo: () => ipcRenderer.invoke('chooseRepo'),
  onLog: (cb: (line: string) => void) => {
    const h = (_e: unknown, line: string): void => cb(line)
    ipcRenderer.on('log', h)
    return () => ipcRenderer.removeListener('log', h)
  },
  onState: (cb: (s: string) => void) => {
    const h = (_e: unknown, s: string): void => cb(s)
    ipcRenderer.on('state', h)
    return () => ipcRenderer.removeListener('state', h)
  },
  onLock: (cb: (lock: unknown) => void) => {
    const h = (_e: unknown, lock: unknown): void => cb(lock)
    ipcRenderer.on('lock', h)
    return () => ipcRenderer.removeListener('lock', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
