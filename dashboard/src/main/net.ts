import os from 'node:os'
import { spawnSync } from 'node:child_process'

export interface ConnectInfo {
  lan: string | null
  tailscale: string | null
}

/** Best-guess private LAN IPv4 for same-network play. */
export function getLanIp(): string | null {
  const ifaces = os.networkInterfaces()
  const addrs: string[] = []
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) addrs.push(ni.address)
    }
  }
  const priv = addrs.find(
    (a) => a.startsWith('192.168.') || a.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a)
  )
  return priv ?? addrs[0] ?? null
}

function tailscaleCandidates(): string[] {
  return process.platform === 'win32'
    ? ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe']
    : ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']
}

/** Tailscale IPv4 (100.x) for playing apart, or null if Tailscale isn't up. */
export function getTailscaleIp(): string | null {
  for (const bin of tailscaleCandidates()) {
    const r = spawnSync(bin, ['ip', '-4'], { encoding: 'utf8', windowsHide: true })
    if (r.status === 0 && r.stdout) {
      const ip = r.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean)
      if (ip) return ip
    }
  }
  return null
}

export function getConnectInfo(): ConnectInfo {
  return { lan: getLanIp(), tailscale: getTailscaleIp() }
}
