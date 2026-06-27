import { contextBridge, ipcRenderer, clipboard } from 'electron'

const api = {
  getStatus: () => ipcRenderer.invoke('getStatus'),
  start: () => ipcRenderer.invoke('start'),
  stop: () => ipcRenderer.invoke('stop'),
  cancelStop: () => ipcRenderer.invoke('cancelStop'),
  send: (cmd: string) => ipcRenderer.invoke('send', cmd),
  setPerf: (on: boolean) => ipcRenderer.invoke('setPerf', on),
  getMemory: () => ipcRenderer.invoke('getMemory'),
  setMemory: (mb: number | null) => ipcRenderer.invoke('setMemory', mb),
  getNotify: () => ipcRenderer.invoke('getNotify'),
  setNotify: (on: boolean) => ipcRenderer.invoke('setNotify', on),
  broadcast: (text: string) => ipcRenderer.invoke('broadcast', text),
  getRoster: () => ipcRenderer.invoke('getRoster'),
  getCapabilities: () => ipcRenderer.invoke('getCapabilities'),
  getProps: () => ipcRenderer.invoke('getProps'),
  getLoadedProps: () => ipcRenderer.invoke('getLoadedProps'),
  setProp: (key: string, value: string) => ipcRenderer.invoke('setProp', key, value),
  setGamemode: (value: string) => ipcRenderer.invoke('setGamemode', value),
  setWhitelist: (on: boolean) => ipcRenderer.invoke('setWhitelist', on),
  setDifficulty: (value: string) => ipcRenderer.invoke('setDifficulty', value),
  getGameRules: () => ipcRenderer.invoke('getGameRules'),
  setGameRule: (rule: string, value: string) => ipcRenderer.invoke('setGameRule', rule, value),
  setGameRules: (values: Record<string, string>) => ipcRenderer.invoke('setGameRules', values),
  getConnectInfo: () => ipcRenderer.invoke('getConnectInfo'),
  forceUnlock: () => ipcRenderer.invoke('forceUnlock'),
  chooseRepo: () => ipcRenderer.invoke('chooseRepo'),
  writeClipboard: (text: string) => clipboard.writeText(text),
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
  },
  onEvent: (cb: (ev: unknown) => void) => {
    const h = (_e: unknown, ev: unknown): void => cb(ev)
    ipcRenderer.on('event', h)
    return () => ipcRenderer.removeListener('event', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
