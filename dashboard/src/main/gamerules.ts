import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RepoPaths } from './paths'

function rulesFile(paths: RepoPaths): string {
  return join(paths.serverDir, 'gamerules.json')
}

/**
 * Remembered game-rule selections, stored in server/gamerules.json so they sync
 * between both hosts via Git (committed/pushed with the world on stop).
 *
 * Remember-only: ONLY rules the user has explicitly chosen in the dashboard live
 * here. Rules the user never touched are absent and keep whatever the world
 * already has — we never force a vanilla baseline onto the shared world.
 *
 * Values are kept as strings ("true"/"false"/numbers) so they pass straight to
 * the `gamerule` command.
 */
export function readGameRules(paths: RepoPaths): Record<string, string> {
  try {
    const obj: unknown = JSON.parse(readFileSync(rulesFile(paths), 'utf8'))
    if (obj && typeof obj === 'object') {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = String(v)
      return out
    }
  } catch {
    /* no file yet / unreadable — nothing remembered */
  }
  return {}
}

function writeGameRules(paths: RepoPaths, rules: Record<string, string>): void {
  // LF, no BOM — the Mac dashboard reads this file too (mirrors .gitattributes
  // handling of the other cross-OS text files).
  writeFileSync(rulesFile(paths), JSON.stringify(rules, null, 2) + '\n')
}

/** Remember one rule's value, merging into the existing file. */
export function setGameRule(paths: RepoPaths, rule: string, value: string): void {
  const rules = readGameRules(paths)
  rules[rule] = value
  writeGameRules(paths, rules)
}

/** Remember a batch of rules at once (e.g. "Reset to Vanilla"). */
export function setGameRules(paths: RepoPaths, values: Record<string, string>): void {
  const rules = readGameRules(paths)
  for (const [k, v] of Object.entries(values)) rules[k] = String(v)
  writeGameRules(paths, rules)
}
