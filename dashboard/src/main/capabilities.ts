import { findJava } from './java'
import { repoPaths, type AppConfig } from './paths'
import { readLock, git, type LockInfo } from './git'

export interface Capabilities {
  javaOk: boolean
  javaVersion: number | null
  online: boolean
  structuredMode: 'stdout'
  lock: LockInfo
}

/** Snapshot of what the dashboard can currently do — drives UI affordances. */
export async function getCapabilities(root: string, cfg: AppConfig): Promise<Capabilities> {
  const paths = repoPaths(root)
  const java = findJava(cfg.javaMin)
  const ls = await git(root, ['ls-remote', '--exit-code', '--heads', 'origin', cfg.branch])
  return {
    javaOk: !!java,
    javaVersion: java ? cfg.javaMin : null,
    online: ls.code === 0,
    structuredMode: 'stdout',
    lock: readLock(paths)
  }
}
