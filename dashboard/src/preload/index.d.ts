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
  lock: LockInfo | null
}

export interface ChooseRepoResult {
  ok: boolean
  reason?: string
  repoRoot?: string
}

export interface DashboardApi {
  getStatus(): Promise<StatusInfo>
  start(): Promise<void>
  stop(): Promise<void>
  send(cmd: string): Promise<void>
  forceUnlock(): Promise<void>
  chooseRepo(): Promise<ChooseRepoResult>
  onLog(cb: (line: string) => void): () => void
  onState(cb: (s: string) => void): () => void
  onLock(cb: (lock: LockInfo) => void): () => void
}

declare global {
  interface Window {
    api: DashboardApi
  }
}

export {}
