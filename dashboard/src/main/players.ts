import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { RepoPaths } from './paths'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJson(file: string): any {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// 26.x keeps these under world/players/<kind>; older layouts used world/<kind>.
function pickDir(paths: RepoPaths, kind: 'stats' | 'advancements'): string {
  const modern = join(paths.worldDir, 'players', kind)
  const legacy = join(paths.worldDir, kind)
  return existsSync(modern) ? modern : legacy
}

function nameMap(paths: RepoPaths): Map<string, string> {
  const map = new Map<string, string>()
  const uc = readJson(join(paths.serverDir, 'usercache.json'))
  if (Array.isArray(uc)) {
    for (const e of uc) if (e?.uuid && e?.name) map.set(e.uuid, e.name)
  }
  return map
}

function countAdvancements(file: string): number {
  const data = readJson(file)
  if (!data) return 0
  let n = 0
  for (const key of Object.keys(data)) {
    if (key === 'DataVersion' || key.startsWith('minecraft:recipes/')) continue
    if (data[key]?.done === true) n++
  }
  return n
}

function blank(uuid: string, name: string): PlayerStat {
  return { uuid, name, playTimeTicks: 0, deaths: 0, blocksMined: 0, distanceWalkedM: 0, jumps: 0, advancements: 0 }
}

/** Build a roster from usercache + per-player stats/advancements JSON. Read-only. */
export function readRoster(paths: RepoPaths): PlayerStat[] {
  const names = nameMap(paths)
  const statsD = pickDir(paths, 'stats')
  const advD = pickDir(paths, 'advancements')
  const out: PlayerStat[] = []

  if (existsSync(statsD)) {
    for (const f of readdirSync(statsD)) {
      if (!f.endsWith('.json')) continue
      const uuid = f.replace(/\.json$/, '')
      const data = readJson(join(statsD, f))
      const custom = data?.stats?.['minecraft:custom'] ?? {}
      const mined = data?.stats?.['minecraft:mined'] ?? {}
      const blocksMined = Object.values(mined).reduce((a: number, b) => a + (Number(b) || 0), 0)
      out.push({
        uuid,
        name: names.get(uuid) ?? uuid.slice(0, 8),
        playTimeTicks: custom['minecraft:play_time'] ?? custom['minecraft:total_world_time'] ?? 0,
        deaths: custom['minecraft:deaths'] ?? 0,
        blocksMined,
        distanceWalkedM: Math.round((custom['minecraft:walk_one_cm'] ?? 0) / 100),
        jumps: custom['minecraft:jump'] ?? 0,
        advancements: countAdvancements(join(advD, f))
      })
    }
  }

  // Include cached players that have no stats file yet.
  for (const [uuid, name] of names) {
    if (!out.some((p) => p.uuid === uuid)) out.push(blank(uuid, name))
  }

  return out.sort((a, b) => b.playTimeTicks - a.playTimeTicks)
}
