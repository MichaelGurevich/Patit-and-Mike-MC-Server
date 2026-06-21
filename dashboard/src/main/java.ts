import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Read a Java binary's major version (e.g. 25). 'java -version' prints to stderr. */
function majorOf(javaPath: string): number {
  try {
    const r = spawnSync(javaPath, ['-version'], { encoding: 'utf8', windowsHide: true })
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const m = text.match(/version "(\d+)/)
    return m ? parseInt(m[1], 10) : 0
  } catch {
    return 0
  }
}

/**
 * Find a Java >= `min`, even when an older Java is first on PATH.
 * Returns the path/command to use, or null if none qualifies.
 */
export function findJava(min: number): string | null {
  if (majorOf('java') >= min) return 'java'

  const candidates: string[] = []
  if (process.platform === 'win32') {
    const roots = [
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Zulu'
    ]
    for (const root of roots) {
      if (!existsSync(root)) continue
      for (const name of readdirSync(root)) {
        const p = join(root, name, 'bin', 'java.exe')
        if (existsSync(p)) candidates.push(p)
      }
    }
  } else {
    try {
      const r = spawnSync('/usr/libexec/java_home', ['-v', String(min)], { encoding: 'utf8' })
      const home = (r.stdout ?? '').trim()
      if (home) {
        const p = join(home, 'bin', 'java')
        if (existsSync(p)) candidates.push(p)
      }
    } catch {
      /* not macOS or no java_home */
    }
    const jvmDir = '/Library/Java/JavaVirtualMachines'
    if (existsSync(jvmDir)) {
      for (const name of readdirSync(jvmDir)) {
        const p = join(jvmDir, name, 'Contents', 'Home', 'bin', 'java')
        if (existsSync(p)) candidates.push(p)
      }
    }
  }

  let best: string | null = null
  let bestMajor = 0
  for (const c of candidates) {
    const m = majorOf(c)
    if (m >= min && m > bestMajor) {
      best = c
      bestMajor = m
    }
  }
  return best
}
