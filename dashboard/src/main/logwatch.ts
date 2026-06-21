// Turns raw vanilla server stdout lines into typed events.
// Line format (26.x): "[HH:MM:SS] [Server thread/INFO]: message"

export type ServerEvent =
  | { type: 'ready'; bootSeconds: number }
  | { type: 'saved' }
  | { type: 'joined'; name: string }
  | { type: 'left'; name: string }
  | { type: 'chat'; name: string; message: string }
  | { type: 'advancement'; name: string; kind: string; title: string }
  | { type: 'list'; online: number; max: number; names: string[] }
  | { type: 'perf'; mspt: number; tps: number }

function strip(line: string): string {
  const m = line.match(/^\[[0-9:]+\]\s\[[^\]]*\/[A-Z]+\]:\s?(.*)$/)
  return m ? m[1] : line
}

export function parse(line: string): ServerEvent | null {
  const msg = strip(line)
  let m: RegExpMatchArray | null

  if ((m = msg.match(/^Done \(([\d.]+)s\)!/))) return { type: 'ready', bootSeconds: parseFloat(m[1]) }
  if (/^Saved the game$/.test(msg)) return { type: 'saved' }
  if ((m = msg.match(/^(\w+) joined the game$/))) return { type: 'joined', name: m[1] }
  if ((m = msg.match(/^(\w+) left the game$/))) return { type: 'left', name: m[1] }
  if ((m = msg.match(/^(?:\[Not Secure\] )?<(\w+)> (.*)$/))) return { type: 'chat', name: m[1], message: m[2] }
  if ((m = msg.match(/^(\w+) has (made the advancement|completed the challenge|reached the goal) \[(.+)\]$/)))
    return { type: 'advancement', name: m[1], kind: m[2], title: m[3] }
  if ((m = msg.match(/^There are (\d+) of a max of (\d+) players online:?\s*(.*)$/))) {
    const names = m[3].trim()
      ? m[3].split(',').map((s) => s.trim()).filter(Boolean)
      : []
    return { type: 'list', online: parseInt(m[1], 10), max: parseInt(m[2], 10), names }
  }
  if ((m = msg.match(/Average time per tick:\s*([\d.]+)\s*ms/i))) {
    const mspt = parseFloat(m[1])
    const tps = mspt <= 50 ? 20 : Math.round((1000 / mspt) * 10) / 10
    return { type: 'perf', mspt, tps }
  }
  return null
}

// Lines produced by polling `tick query` — parsed for perf, hidden from the console.
const PERF_NOISE = [/^Target tick rate:/, /^Average time per tick:/, /^Percentiles:/, /^The game is running/]

export function isPerfNoise(line: string): boolean {
  const msg = strip(line)
  return PERF_NOISE.some((re) => re.test(msg))
}
