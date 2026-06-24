export interface LockInfo {
  status: string
  holder: string
  machine: string
  since: string
  note: string
}

export interface StatusInfo {
  repoRoot: string | null
  state: string
  readyAt: number | null
  lock: LockInfo | null
}

export interface ChooseRepoResult {
  ok: boolean
  reason?: string
  repoRoot?: string
}

export interface PlayerStat {
  uuid: string
  name: string
  playTimeTicks: number
  deaths: number
  blocksMined: number
  distanceWalkedM: number
  jumps: number
  advancements: number
}

export interface ConnectInfo {
  lan: string | null
  tailscale: string | null
  port: string
}

export interface MemoryInfo {
  /** Saved per-machine override in MB, or null when using the default. */
  overrideMB: number | null
  /** The built-in default max heap (-Xmx) in MB. */
  defaultMB: number
  /** This machine's total physical RAM in MB. */
  totalMB: number
}

export interface Capabilities {
  javaOk: boolean
  javaVersion: number | null
  online: boolean
  structuredMode: 'stdout'
  lock: LockInfo
}

export type ServerEvent =
  | { type: 'ready'; bootSeconds: number }
  | { type: 'saved' }
  | { type: 'joined'; name: string }
  | { type: 'left'; name: string }
  | { type: 'chat'; name: string; message: string }
  | { type: 'advancement'; name: string; kind: string; title: string }
  | { type: 'list'; online: number; max: number; names: string[] }
  | { type: 'perf'; mspt: number; tps: number }

export interface DashboardApi {
  getStatus(): Promise<StatusInfo>
  start(): Promise<void>
  stop(): Promise<void>
  send(cmd: string): Promise<void>
  setPerf(on: boolean): Promise<void>
  getMemory(): Promise<MemoryInfo>
  setMemory(mb: number | null): Promise<number | null>
  getRoster(): Promise<PlayerStat[]>
  getCapabilities(): Promise<Capabilities | null>
  getProps(): Promise<Record<string, string>>
  setDifficulty(value: string): Promise<void>
  getGameRules(): Promise<Record<string, string>>
  setGameRule(rule: string, value: string): Promise<void>
  setGameRules(values: Record<string, string>): Promise<void>
  getConnectInfo(): Promise<ConnectInfo>
  forceUnlock(): Promise<void>
  chooseRepo(): Promise<ChooseRepoResult>
  writeClipboard(text: string): void
  onLog(cb: (line: string) => void): () => void
  onState(cb: (s: string) => void): () => void
  onLock(cb: (lock: LockInfo) => void): () => void
  onEvent(cb: (ev: ServerEvent) => void): () => void
}

declare global {
  interface Window {
    api: DashboardApi
  }
}

export {}
