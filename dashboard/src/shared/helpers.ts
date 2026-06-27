// Pure, dependency-free helpers shared by the Electron main process and the
// renderer. Kept strictly side-effect free (no node / electron / DOM imports) so
// they can be unit-tested in isolation later — see the PRD "Testing decisions".
// These four functions encode the load-bearing logic of the Advanced tab feature:
//   clamp / clampField        — numeric bound enforcement
//   buildNotifyMessage        — the exact `say` string per auto-notify trigger
//   shouldCountdown           — whether Stop & Save runs its countdown
//   diffFromLoadedSnapshot    — drives the "applies on next restart" badge

/** Fixed length (seconds) of the enforced Stop & Save countdown. Not configurable. */
export const STOP_COUNTDOWN_SECONDS = 10

/** Clamp a number to [min, max]. Non-finite input collapses to `min` — the safe
 *  lower bound — so a malformed field never writes a wild value. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Inclusive numeric bounds for every clamped field (server settings + numeric
 *  game rules). A raw out-of-range value in server.properties can stop the server
 *  booting and strand the other host, so every numeric input snaps to a bound.
 *  Note: max-players is capped at 20 on purpose — pointless higher at this scale. */
export const BOUNDS: Record<string, { min: number; max: number }> = {
  'max-players': { min: 1, max: 20 },
  'view-distance': { min: 3, max: 32 },
  'simulation-distance': { min: 3, max: 32 },
  'spawn-protection': { min: 0, max: 64 },
  randomTickSpeed: { min: 0, max: 256 },
  playersSleepingPercentage: { min: 0, max: 100 },
  spawnRadius: { min: 0, max: 128 }
}

/** Clamp a value for a known key using BOUNDS; unknown keys pass through. */
export function clampField(key: string, value: number): number {
  const b = BOUNDS[key]
  return b ? clamp(value, b.min, b.max) : value
}

export type NotifyAction = 'ready' | 'stop' | 'difficulty' | 'whitelist' | 'rules'

/**
 * The exact console command emitted for each auto-notify trigger. Returns the
 * FULL command string INCLUDING the leading `say ` — callers pass the result
 * straight to ServerController.send(). Fixed text in v1 (no templating).
 *  - ready:      say Server is up — join in!
 *  - stop:       say Server saving and shutting down in 10s…
 *  - difficulty: say Difficulty set to <detail>          (detail = e.g. "hard")
 *  - whitelist:  say Whitelist enabled | say Whitelist disabled   (detail = "on"/"off")
 *  - rules:      say Game rules updated   (single consolidated ping)
 */
export function buildNotifyMessage(action: NotifyAction, detail?: string): string {
  switch (action) {
    case 'ready':
      return 'say Server is up — join in!'
    case 'stop':
      return 'say Server saving and shutting down in 10s…'
    case 'difficulty':
      return `say Difficulty set to ${detail ?? ''}`.trimEnd()
    case 'whitelist':
      return `say Whitelist ${detail === 'on' ? 'enabled' : 'disabled'}`
    case 'rules':
      return 'say Game rules updated'
  }
}

/** The Stop & Save countdown runs only when someone is online; at 0 players it is
 *  pointless to make the host wait, so we skip straight to save + stop. */
export function shouldCountdown(playerCount: number): boolean {
  return playerCount > 0
}

/** Restart-only server.properties keys: editable in the UI but only read by the
 *  server at boot. These drive the "applies on next restart" badge. Live-applied
 *  fields (difficulty, gamemode/defaultgamemode, whitelist) are deliberately absent. */
export const RESTART_ONLY_KEYS = [
  'max-players',
  'view-distance',
  'simulation-distance',
  'pvp',
  'spawn-protection',
  'motd',
  'allow-flight'
] as const

/**
 * Keys whose current value differs from the snapshot the running server loaded at
 * start. Compares ONLY keys present in `loaded`, so pass a `loaded` snapshot that
 * already contains just the restart-only keys. Returns [] when nothing differs
 * (or when `loaded` is empty, i.e. the server was never started this session).
 */
export function diffFromLoadedSnapshot(
  current: Record<string, string>,
  loaded: Record<string, string>
): string[] {
  const out: string[] = []
  for (const key of Object.keys(loaded)) {
    if (current[key] !== undefined && current[key] !== loaded[key]) out.push(key)
  }
  return out
}
