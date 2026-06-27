import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { clampField, diffFromLoadedSnapshot } from '../../shared/helpers'

type State = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

interface LockInfo {
  status: string
  holder: string
  machine: string
  since: string
  note: string
}

interface PlayerStat {
  uuid: string
  name: string
  playTimeTicks: number
  deaths: number
  blocksMined: number
  distanceWalkedM: number
  jumps: number
  advancements: number
}

type ServerEvent =
  | { type: 'ready'; bootSeconds: number }
  | { type: 'saved' }
  | { type: 'joined'; name: string }
  | { type: 'left'; name: string }
  | { type: 'chat'; name: string; message: string }
  | { type: 'advancement'; name: string; kind: string; title: string }
  | { type: 'list'; online: number; max: number; names: string[] }
  | { type: 'perf'; mspt: number; tps: number }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'countdownCancelled' }

// One-click console commands. The Console tab keeps just the harmless ones (save,
// list); the world-changing time/weather buttons now live in Advanced "Live world"
// (see LIVE_WORLD) where they're plain buttons — no gibberish gate any more.
type Cmd = { label: string; cmd: string | string[] }

const QUICK: Cmd[] = [
  { label: '💾 Save', cmd: 'save-all flush' },
  { label: '👥 Who’s on', cmd: 'list' }
]

// Live-world buttons surfaced in the Advanced tab. All require a running server.
const LIVE_TIME: Cmd[] = [
  { label: '☀ Day', cmd: 'time set day' },
  { label: '🌅 Noon', cmd: 'time set noon' },
  { label: '🌙 Night', cmd: 'time set night' },
  { label: '🌌 Midnight', cmd: 'time set midnight' },
  { label: '🛏 Cozy night', cmd: ['time set night', 'weather clear'] }
]
const LIVE_WEATHER: Cmd[] = [
  { label: '🌤 Clear', cmd: 'weather clear' },
  { label: '🌧 Rain', cmd: 'weather rain' },
  { label: '⛈ Thunder', cmd: 'weather thunder' }
]

const DIFFICULTIES: { id: string; label: string }[] = [
  { id: 'peaceful', label: '☮ Peaceful' },
  { id: 'easy', label: '🙂 Easy' },
  { id: 'normal', label: '⚔ Normal' },
  { id: 'hard', label: '💀 Hard' }
]

const GAMERULES = [
  'keepInventory',
  'mobGriefing',
  'doDaylightCycle',
  'doWeatherCycle',
  'doInsomnia',
  'doFireTick',
  'fallDamage',
  'doMobSpawning',
  'naturalRegeneration',
  'doImmediateRespawn'
]

// Vanilla Java Edition defaults for the standard game rules (difficulty excluded
// on purpose — it isn't a game rule). Used by the "Reset to Vanilla" button.
const VANILLA_DEFAULTS: Record<string, string> = {
  announceAdvancements: 'true',
  commandBlockOutput: 'true',
  disableRaids: 'false',
  doDaylightCycle: 'true',
  doEntityDrops: 'true',
  doFireTick: 'true',
  doImmediateRespawn: 'false',
  doInsomnia: 'true',
  doLimitedCrafting: 'false',
  doMobLoot: 'true',
  doMobSpawning: 'true',
  doPatrolSpawning: 'true',
  doTileDrops: 'true',
  doTraderSpawning: 'true',
  doWeatherCycle: 'true',
  drowningDamage: 'true',
  fallDamage: 'true',
  fireDamage: 'true',
  forgiveDeadPlayers: 'true',
  freezeDamage: 'true',
  keepInventory: 'false',
  logAdminCommands: 'true',
  mobGriefing: 'true',
  naturalRegeneration: 'true',
  reducedDebugInfo: 'false',
  sendCommandFeedback: 'true',
  showDeathMessages: 'true',
  spectatorsGenerateChunks: 'true',
  universalAnger: 'false',
  maxCommandChainLength: '65536',
  maxEntityCramming: '24',
  randomTickSpeed: '3',
  spawnRadius: '10'
}

// Default join gamemode options for the Advanced server-settings picker.
const GAMEMODES: { id: string; label: string }[] = [
  { id: 'survival', label: '⚔ Survival' },
  { id: 'creative', label: '🧱 Creative' },
  { id: 'adventure', label: '🗺 Adventure' },
  { id: 'spectator', label: '👻 Spectator' }
]

// The five game rules surfaced only in Advanced (added to the 10 in the Game
// rules tab). Booleans render as on/off segs; numbers as clamped inputs.
const ADV_BOOL_RULES = ['doMobLoot', 'doTileDrops']
const ADV_NUM_RULES = ['randomTickSpeed', 'playersSleepingPercentage', 'spawnRadius']

const STATE_LABEL: Record<State, string> = {
  idle: 'Idle',
  starting: 'Starting…',
  running: 'Running',
  stopping: 'Saving…',
  stopped: 'Stopped',
  error: 'Error'
}

type Level = 'info' | 'warn' | 'error'

function levelOf(line: string): Level {
  if (/\/ERROR\]/.test(line) || /Exception|\bat [\w.$]+\(/.test(line)) return 'error'
  if (/\/WARN\]/.test(line)) return 'warn'
  return 'info'
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function fmtPlaytime(ticks: number): string {
  const mins = Math.floor(ticks / 20 / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface MemoryInfo {
  overrideMB: number | null
  defaultMB: number
  totalMB: number
}

// RAM tiers (GB) offered in the memory picker. Filtered down to what physically
// fits this machine; the default and any current pick are always kept.
const RAM_TIERS_GB = [2, 3, 4, 6, 8, 12, 16, 24, 32]

function memChoicesMB(totalMB: number, defaultMB: number, overrideMB: number | null): number[] {
  const set = new Set<number>(RAM_TIERS_GB.map((g) => g * 1024).filter((mb) => mb <= totalMB))
  if (defaultMB <= totalMB) set.add(defaultMB)
  if (overrideMB) set.add(overrideMB)
  return [...set].sort((a, b) => a - b)
}

function gbLabel(mb: number): string {
  const gb = mb / 1024
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
}

// Full-body skin renders (resolve real skins because online-mode=true). These are
// free third-party render services; they go down from time to time, so we keep an
// ordered fallback list and PlayerSkin advances to the next one on load error.
// Any host added here must also be allowed in the renderer CSP (index.html img-src).
function skinBodyUrls(uuid: string): string[] {
  return [
    `https://crafatar.com/renders/body/${uuid}?overlay&scale=8`,
    `https://mc-heads.net/body/${uuid}/150`,
    `https://visage.surgeplay.com/full/256/${uuid}`
  ]
}

function PlayerSkin({ uuid, name }: { uuid: string; name: string }): JSX.Element {
  const urls = skinBodyUrls(uuid)
  const [idx, setIdx] = useState(0)
  // Exhausted every service (all offline/unreachable): show a neutral placeholder.
  if (idx >= urls.length) return <div className="pcard-skin-fallback">🧍</div>
  return (
    <img
      key={urls[idx]}
      src={urls[idx]}
      alt={`${name} skin`}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
    />
  )
}

function StateBadge({ state }: { state: State }): JSX.Element {
  return <span className={`badge ${state}`}>{STATE_LABEL[state]}</span>
}

function SessionStatus({
  lock,
  state,
  onForce
}: {
  lock: LockInfo | null
  state: State
  onForce: () => void
}): JSX.Element {
  if (state === 'running' || state === 'starting') {
    return (
      <div className="status-strip ok">
        <span>🛠️</span>
        <span className="grow">You&apos;re hosting — happy building!</span>
      </div>
    )
  }
  if (lock && lock.status === 'active') {
    return (
      <div className="status-strip warn">
        <span>🔒</span>
        <span className="grow">
          <strong>{lock.holder}</strong> is hosting (on {lock.machine}) since {lock.since}.
        </span>
        <button className="mini" onClick={onForce}>
          Force-unlock
        </button>
      </div>
    )
  }
  return (
    <div className="status-strip free">
      <span>✅</span>
      <span className="grow">Ready when you are — nobody is hosting.</span>
    </div>
  )
}

// Small amber "applies on next restart" pill shown beside restart-only fields
// whose current value differs from what the running server loaded at start.
function RestartBadge(): JSX.Element {
  return <span className="restart-badge">applies on next restart</span>
}

// A labelled numeric field for the Advanced grid. It edits a local draft string so
// the user can type freely, then commits the CLAMPED value on blur / Enter — the
// parent clamps and reflects the bounded value back through `value`.
function NumField({
  label,
  value,
  onCommit,
  badge,
  mono
}: {
  label: string
  value: string
  onCommit: (raw: string) => void
  badge?: boolean
  mono?: boolean
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  // Keep the draft in sync when the canonical (clamped) value changes elsewhere.
  useEffect(() => setDraft(value), [value])
  return (
    <div className="adv-field">
      <div className={`field-label${mono ? ' rule-name' : ''}`}>
        {label}
        {badge && <RestartBadge />}
      </div>
      <input
        className="adv-input"
        type="number"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </div>
  )
}

// A labelled free-text field for the Advanced grid (e.g. MOTD). Commits on blur /
// Enter so we don't persist on every keystroke.
function TextField({
  label,
  value,
  onCommit,
  badge,
  wide
}: {
  label: string
  value: string
  onCommit: (text: string) => void
  badge?: boolean
  wide?: boolean
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className={`adv-field${wide ? ' adv-field-wide' : ''}`}>
      <div className="field-label">
        {label}
        {badge && <RestartBadge />}
      </div>
      <input
        className="adv-input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </div>
  )
}

type Theme = 'light' | 'dark'
type Tab = 'console' | 'players' | 'rules' | 'advanced'

export default function App(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('mc-theme') as Theme) || 'light'
  )
  const [tab, setTab] = useState<Tab>('console')
  const [repoRoot, setRepoRoot] = useState<string | null>(null)
  const [state, setState] = useState<State>('idle')
  const [lock, setLock] = useState<LockInfo | null>(null)
  const [readyAt, setReadyAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())

  const [lines, setLines] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<'all' | Level>('all')
  const [autoscroll, setAutoscroll] = useState(true)
  const [cmd, setCmd] = useState('')

  const [online, setOnline] = useState<string[]>([])
  const [roster, setRoster] = useState<PlayerStat[]>([])
  const [perfOn, setPerfOn] = useState(false)
  const [perf, setPerf] = useState<{ mspt: number; tps: number } | null>(null)
  const [ruleState, setRuleState] = useState<Record<string, boolean>>({})
  const [difficulty, setDifficulty] = useState('')
  const [mem, setMem] = useState<MemoryInfo | null>(null)
  const [connect, setConnect] = useState<{ lan: string | null; tailscale: string | null; port: string }>({
    lan: null,
    tailscale: null,
    port: '25565'
  })
  const [copied, setCopied] = useState('')

  // ----- Advanced tab state -----
  // Live, enforced Stop & Save countdown (seconds left), or null when not counting
  // down. Driven entirely by 'countdown'/'countdownCancelled' events from main.
  const [countdown, setCountdown] = useState<number | null>(null)
  // Master in-game notify toggle (gates the automatic `say` pings).
  const [notify, setNotify] = useState(true)
  // Free-text broadcast box (only meaningful while running).
  const [broadcast, setBroadcast] = useState('')
  // Full server.properties map (current persisted values) + the restart-only
  // snapshot the running process loaded at start (null when stopped).
  const [props, setProps] = useState<Record<string, string>>({})
  const [loadedProps, setLoadedProps] = useState<Record<string, string> | null>(null)
  // Raw string values for the 5 advanced game rules (separate from the boolean
  // `ruleState` used by the Game rules tab so numbers survive round-trips).
  const [advRules, setAdvRules] = useState<Record<string, string>>({})

  const consoleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('mc-theme', theme)
  }, [theme])

  const toggleTheme = (): void => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  const refresh = useCallback(async () => {
    const s = await window.api.getStatus()
    setRepoRoot(s.repoRoot)
    setState(s.state as State)
    setLock(s.lock)
    setReadyAt(s.readyAt)
  }, [])

  const loadRoster = useCallback(async () => {
    try {
      setRoster(await window.api.getRoster())
    } catch {
      /* ignore */
    }
  }, [])

  // Load the FULL server.properties map (the Advanced server-settings section
  // reads from it) and keep the sidebar Difficulty in sync from the same fetch.
  const loadProps = useCallback(async () => {
    try {
      const p = await window.api.getProps()
      setProps(p)
      setDifficulty((p.difficulty ?? '').trim())
    } catch {
      /* ignore */
    }
  }, [])

  // The restart-only snapshot the running process loaded at start — null when
  // stopped. Drives the "applies on next restart" badge via diffFromLoadedSnapshot.
  const loadLoadedProps = useCallback(async () => {
    try {
      setLoadedProps(await window.api.getLoadedProps())
    } catch {
      /* ignore */
    }
  }, [])

  const loadNotify = useCallback(async () => {
    try {
      setNotify(await window.api.getNotify())
    } catch {
      /* ignore */
    }
  }, [])

  const loadRules = useCallback(async () => {
    try {
      const stored = await window.api.getGameRules()
      // Show vanilla as the visual default, then overlay the remembered picks.
      const next: Record<string, boolean> = {}
      for (const r of GAMERULES) next[r] = VANILLA_DEFAULTS[r] === 'true'
      for (const [r, v] of Object.entries(stored)) {
        if (v === 'true' || v === 'false') next[r] = v === 'true'
      }
      setRuleState(next)
      // Advanced rules keep raw string values (booleans AND numbers); fall back to
      // vanilla defaults so the inputs/segs are never blank.
      const adv: Record<string, string> = {}
      for (const r of [...ADV_BOOL_RULES, ...ADV_NUM_RULES]) adv[r] = VANILLA_DEFAULTS[r] ?? ''
      for (const [r, v] of Object.entries(stored)) {
        if (r in adv) adv[r] = v
      }
      setAdvRules(adv)
    } catch {
      /* ignore */
    }
  }, [])

  const changeDifficulty = (id: string): void => {
    setDifficulty(id)
    void window.api.setDifficulty(id)
  }

  const loadMem = useCallback(async () => {
    try {
      setMem(await window.api.getMemory())
    } catch {
      /* ignore */
    }
  }, [])

  // Heap size is fixed once the JVM starts, so this only affects the next launch.
  const changeMem = (mb: number): void => {
    setMem((m) => (m ? { ...m, overrideMB: mb } : m)) // optimistic
    void window.api.setMemory(mb).then(() => loadMem()) // reconcile with clamped value
  }

  // ----- Advanced server-settings persistence -----
  // All of these write to a file via window.api regardless of run state, so the
  // Advanced fields stay editable while stopped (the value applies on next start).

  // Persist a server.properties key (optimistic; the API writes to the file).
  const setProp = (key: string, value: string): void => {
    setProps((p) => ({ ...p, [key]: value }))
    void window.api.setProp(key, value)
  }
  // Clamp a numeric server.properties field to its bound, then persist the CLAMPED
  // value (never the raw text) and reflect it back into the input.
  const commitNumProp = (key: string, raw: string): void => {
    const v = clampField(key, Number(raw))
    setProp(key, String(v))
  }
  const toggleNotify = (next: boolean): void => {
    setNotify(next)
    void window.api.setNotify(next)
  }
  const sendBroadcast = (e: FormEvent): void => {
    e.preventDefault()
    const t = broadcast.trim()
    if (!t) return
    void window.api.broadcast(t)
    setBroadcast('')
  }

  // Persist an advanced game rule (remembered + applied live by main). Numbers are
  // clamped to their bound first so a wild value can't be written.
  const setAdvRule = (rule: string, value: string): void => {
    setAdvRules((p) => ({ ...p, [rule]: value }))
    void window.api.setGameRule(rule, value)
  }
  const commitAdvNumRule = (rule: string, raw: string): void => {
    setAdvRule(rule, String(clampField(rule, Number(raw))))
  }

  const loadConnect = useCallback(async () => {
    try {
      setConnect(await window.api.getConnectInfo())
    } catch {
      /* ignore */
    }
  }, [])

  const addr = (ip: string): string => (connect.port === '25565' ? ip : `${ip}:${connect.port}`)

  const copy = (key: string, text: string): void => {
    window.api.writeClipboard(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 1200)
  }

  useEffect(() => {
    void refresh()
    void loadRoster()
    void loadProps()
    void loadLoadedProps()
    void loadNotify()
    void loadRules()
    void loadConnect()
    void loadMem()
    const offLog = window.api.onLog((line) => setLines((p) => [...p.slice(-1500), line]))
    const offState = window.api.onState((s) => {
      setState(s as State)
      void refresh()
      // The loaded snapshot changes meaning at every transition (a new start
      // re-snapshots; a stop clears it), so refresh it — and the live props — here.
      void loadProps()
      void loadLoadedProps()
      if (s === 'stopping' || s === 'stopped' || s === 'error') setCountdown(null)
      if (s === 'stopped' || s === 'error') {
        setOnline([])
        setPerf(null)
        void loadRoster()
      }
    })
    const offLock = window.api.onLock((l) => setLock(l))
    const offEvent = window.api.onEvent((ev: ServerEvent) => {
      switch (ev.type) {
        case 'ready':
          setReadyAt(Date.now())
          setOnline([])
          setCountdown(null)
          void loadConnect()
          void loadProps()
          void loadLoadedProps()
          break
        case 'joined':
          setOnline((p) => (p.includes(ev.name) ? p : [...p, ev.name]))
          break
        case 'left':
          setOnline((p) => p.filter((n) => n !== ev.name))
          break
        case 'list':
          setOnline(ev.names)
          break
        case 'perf':
          setPerf({ mspt: ev.mspt, tps: ev.tps })
          break
        case 'saved':
          void loadRoster()
          break
        case 'countdown':
          setCountdown(ev.secondsLeft)
          break
        case 'countdownCancelled':
          setCountdown(null)
          break
        default:
          break
      }
    })
    return () => {
      offLog()
      offState()
      offLock()
      offEvent()
    }
  }, [refresh, loadRoster, loadProps, loadLoadedProps, loadNotify, loadRules, loadConnect, loadMem])

  // Uptime ticker (only meaningful while running).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const visibleLines = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return lines.filter((l) => {
      if (levelFilter !== 'all' && levelOf(l) !== levelFilter) return false
      if (f && !l.toLowerCase().includes(f)) return false
      return true
    })
  }, [lines, filter, levelFilter])

  useEffect(() => {
    const el = consoleRef.current
    if (el && autoscroll) el.scrollTop = el.scrollHeight
  }, [visibleLines, autoscroll])

  const running = state === 'running'
  const busy = state === 'starting' || state === 'stopping'

  const sendCmd = (c: string | string[]): void => {
    const list = Array.isArray(c) ? c : [c]
    for (const one of list) if (one.trim()) void window.api.send(one.trim())
  }
  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    sendCmd(cmd)
    setCmd('')
  }

  const togglePerf = (): void => {
    const next = !perfOn
    setPerfOn(next)
    void window.api.setPerf(next)
    if (!next) setPerf(null)
  }

  // Remember the pick (synced via Git, re-applied on next start) — main also
  // applies it live if the server is running.
  const setRule = (rule: string, val: boolean): void => {
    setRuleState((p) => ({ ...p, [rule]: val }))
    void window.api.setGameRule(rule, String(val))
  }

  const resetVanilla = (): void => {
    if (!window.confirm('Reset all game rules to vanilla defaults?\n\nDifficulty is NOT changed.')) return
    const next: Record<string, boolean> = {}
    for (const [rule, def] of Object.entries(VANILLA_DEFAULTS)) {
      if (def === 'true' || def === 'false') next[rule] = def === 'true'
    }
    setRuleState((p) => ({ ...p, ...next }))
    void window.api.setGameRules(VANILLA_DEFAULTS)
  }

  const forceUnlock = (): void => {
    if (window.confirm('Force-unlock the session?\n\nOnly do this if you are SURE nobody is currently playing (e.g. the other person crashed). Hosting at the same time can corrupt the shared world.')) {
      void window.api.forceUnlock()
    }
  }

  const copyConsole = (): void => window.api.writeClipboard(visibleLines.join('\n'))

  if (!repoRoot) {
    return (
      <div className="locate">
        <h1>🎮 MC Server Dashboard</h1>
        <p>I couldn&apos;t find your Minecraft server folder.</p>
        <button
          className="primary"
          onClick={async () => {
            const r = await window.api.chooseRepo()
            if (r.ok) void refresh()
          }}
        >
          Choose server folder…
        </button>
      </div>
    )
  }

  const uptime = running && readyAt ? fmtDuration(now - readyAt) : null

  // Restart-only fields whose current value differs from what the running process
  // loaded at start — each gets an "applies on next restart" badge. Empty when
  // stopped (no loaded snapshot to diff against).
  const restartChanged = running && loadedProps ? diffFromLoadedSnapshot(props, loadedProps) : []

  return (
    <div className="app">
      {/* ---------- Top bar ---------- */}
      <div className="topbar">
        <div className="brand">🎮 MC Dashboard</div>
        <div className="topbar-status">
          <StateBadge state={state} />
          {uptime && <span className="chip">⏱ {uptime}</span>}
          {perfOn && perf && (
            <span className={`chip ${perf.tps >= 19.5 ? 'good' : perf.mspt > 50 ? 'bad' : 'warnchip'}`}>
              {perf.mspt.toFixed(1)} ms · {perf.tps} TPS
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <button
            className={`mini ${perfOn ? 'on' : ''}`}
            title="Toggle performance polling"
            onClick={togglePerf}
          >
            📊 Perf
          </button>
          <button className="mini" title="Toggle light / dark theme" onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Dark' : '☀ Light'}
          </button>
        </div>
      </div>

      {/* ---------- Two-pane body ---------- */}
      <div className="layout">
        {/* ----- Sidebar: controls, connect, who's online ----- */}
        <aside className="sidebar">
          <section className="card control">
            <div className="card-title">Server control</div>
            <div className="card-body">
              <SessionStatus lock={lock} state={state} onForce={forceUnlock} />

              {!running && !busy && (
                <button
                  className="primary big"
                  onClick={() => {
                    setLines([])
                    setTab('console')
                    void window.api.start()
                  }}
                >
                  ▶ Start &amp; Play
                </button>
              )}
              {running &&
                (countdown != null ? (
                  // Mid-countdown: the button becomes a Cancel affordance so a
                  // misclicked Stop can be reversed before the server goes down.
                  <button className="danger big" onClick={() => void window.api.cancelStop()}>
                    ■ Stopping in {countdown}s… — Cancel
                  </button>
                ) : (
                  <button className="danger big" onClick={() => void window.api.stop()}>
                    ■ Stop &amp; Save
                  </button>
                ))}
              {busy && (
                <button className="big" disabled>
                  {state === 'starting' ? 'Starting…' : 'Saving & uploading…'}
                </button>
              )}

              <div>
                <div className="field-label">Difficulty</div>
                <div className="diff-grid">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      className={difficulty === d.id ? 'on' : ''}
                      onClick={() => changeDifficulty(d.id)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <span className="muted hint2">
                  {running ? 'Applied live' : 'Saved for next start'}
                </span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">
              <span>🔌 Connect</span>
              <button className="mini" onClick={() => void loadConnect()}>
                Refresh
              </button>
            </div>
            <div className="card-body">
              <div className="connect">
                <div className="connect-row">
                  <span className="crow-label">📶 Same Wi-Fi</span>
                  <div className="crow-inputs">
                    <code className="crow-val">{connect.lan ? addr(connect.lan) : 'not detected'}</code>
                    <button
                      className="mini"
                      disabled={!connect.lan}
                      onClick={() => copy('lan', addr(connect.lan as string))}
                    >
                      {copied === 'lan' ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="connect-row">
                  <span className="crow-label">🌍 Internet (Tailscale)</span>
                  <div className="crow-inputs">
                    <code className="crow-val">
                      {connect.tailscale ? addr(connect.tailscale) : 'Tailscale off'}
                    </code>
                    <button
                      className="mini"
                      disabled={!connect.tailscale}
                      onClick={() => copy('ts', addr(connect.tailscale as string))}
                    >
                      {copied === 'ts' ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="connect-row">
                  <span className="crow-label">💻 This PC</span>
                  <div className="crow-inputs">
                    <code className="crow-val">localhost</code>
                    <button className="mini" onClick={() => copy('local', 'localhost')}>
                      {copied === 'local' ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">
              <span>👥 Online now</span>
              <span className="count">{online.length}</span>
            </div>
            <div className="card-body">
              {online.length === 0 ? (
                <span className="muted">Nobody online.</span>
              ) : (
                <div className="online-list">
                  {online.map((name) => (
                    <div className="online-item" key={name}>
                      <span className="dot on" /> {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>

        {/* ----- Main: tabbed work area ----- */}
        <main className="main">
          <div className="tabs">
            <button
              className={`tab ${tab === 'console' ? 'active' : ''}`}
              onClick={() => setTab('console')}
            >
              🖥 Console
            </button>
            <button
              className={`tab ${tab === 'players' ? 'active' : ''}`}
              onClick={() => setTab('players')}
            >
              👥 Players <span className="pill">{roster.length}</span>
            </button>
            <button
              className={`tab ${tab === 'rules' ? 'active' : ''}`}
              onClick={() => setTab('rules')}
            >
              ⚙ Game rules
            </button>
            <button
              className={`tab ${tab === 'advanced' ? 'active' : ''}`}
              onClick={() => setTab('advanced')}
            >
              🛠 Advanced
            </button>
          </div>

          {tab === 'console' && (
            <div className="tabpanel console-panel">
              <div className="console-toolbar">
                <input
                  className="search"
                  placeholder="🔍 Filter console…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value as 'all' | Level)}
                >
                  <option value="all">All</option>
                  <option value="info">Info</option>
                  <option value="warn">Warnings</option>
                  <option value="error">Errors</option>
                </select>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={autoscroll}
                    onChange={(e) => setAutoscroll(e.target.checked)}
                  />{' '}
                  Auto-scroll
                </label>
                <button className="mini" onClick={copyConsole} title="Copy visible lines">
                  Copy
                </button>
                <button className="mini" onClick={() => setLines([])} title="Clear console">
                  Clear
                </button>
              </div>

              <div className="console" ref={consoleRef}>
                {visibleLines.length === 0 && (
                  <div className="muted">Console output will appear here…</div>
                )}
                {visibleLines.map((l, i) => (
                  <div key={i} className={`line ${levelOf(l)}`}>
                    {l}
                  </div>
                ))}
              </div>

              <form className="cmdbar" onSubmit={onSubmit}>
                <input
                  placeholder={running ? 'Type a server command…' : 'Start the server to send commands'}
                  value={cmd}
                  disabled={!running}
                  onChange={(e) => setCmd(e.target.value)}
                />
                <button className="primary" disabled={!running} type="submit">
                  Send
                </button>
              </form>

              <div className="quick">
                {QUICK.map((q) => (
                  <button key={q.label} disabled={!running} onClick={() => sendCmd(q.cmd)}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'players' && (
            <div className="tabpanel">
              <div className="rules-actions">
                <button className="mini" onClick={() => void loadRoster()}>
                  ↻ Refresh
                </button>
                <span className="muted">
                  {online.length} online · {roster.length} known
                </span>
              </div>
              {roster.length === 0 ? (
                <p className="muted">No players yet.</p>
              ) : (
                <div className="roster-grid">
                  {roster.map((p) => (
                    <div className={`pcard ${online.includes(p.name) ? 'online' : ''}`} key={p.uuid}>
                      <div className="pcard-name">
                        <span className={`dot ${online.includes(p.name) ? 'on' : ''}`} />
                        {p.name}
                      </div>
                      <div className="pcard-skin">
                        <PlayerSkin uuid={p.uuid} name={p.name} />
                      </div>
                      <div className="pcard-stats">
                        <span title="Playtime">⏱ {fmtPlaytime(p.playTimeTicks)}</span>
                        <span title="Deaths">💀 {p.deaths}</span>
                        <span title="Blocks mined">⛏ {p.blocksMined.toLocaleString()}</span>
                        <span title="Advancements">🏆 {p.advancements}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'rules' && (
            <div className="tabpanel">
              <div className="rules-actions">
                <button
                  className="primary"
                  onClick={resetVanilla}
                  title="Set all game rules back to vanilla defaults (difficulty unchanged)"
                >
                  ↺ Reset to Vanilla
                </button>
                <span className="muted">
                  {running ? 'Applied live and remembered.' : 'Remembered and applied on next start.'}{' '}
                  Difficulty is not changed.
                </span>
              </div>
              <div className="rules">
                {GAMERULES.map((r) => (
                  <div className="rule" key={r}>
                    <span className="rule-name">{r}</span>
                    <div className="seg">
                      <button
                        className={ruleState[r] === true ? 'on' : ''}
                        onClick={() => setRule(r, true)}
                      >
                        On
                      </button>
                      <button
                        className={ruleState[r] === false ? 'on' : ''}
                        onClick={() => setRule(r, false)}
                      >
                        Off
                      </button>
                    </div>
                  </div>
                ))}
                {!running && (
                  <p className="muted hint">
                    Choices are saved and applied automatically when the server starts.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'advanced' && (
            <div className="tabpanel">
              {/* ----- Notifications ----- */}
              <section className="adv-section">
                <div className="adv-section-title">🔔 Notifications</div>
                <div className="adv-row">
                  <div className="adv-field">
                    <div className="field-label">Notify players in-game</div>
                    <span className="muted hint2">
                      Master switch for the automatic in-game chat messages (server
                      ready, difficulty, whitelist, rules, stop countdown).
                    </span>
                  </div>
                  <div className="seg">
                    <button className={notify ? 'on' : ''} onClick={() => toggleNotify(true)}>
                      On
                    </button>
                    <button className={!notify ? 'on' : ''} onClick={() => toggleNotify(false)}>
                      Off
                    </button>
                  </div>
                </div>
                <form className="broadcast-row" onSubmit={sendBroadcast}>
                  <input
                    placeholder={
                      running ? 'Broadcast a message to players…' : 'Start the server to broadcast'
                    }
                    value={broadcast}
                    disabled={!running}
                    onChange={(e) => setBroadcast(e.target.value)}
                  />
                  <button className="primary" type="submit" disabled={!running || !broadcast.trim()}>
                    Send
                  </button>
                </form>
                <span className="muted hint2">Broadcast works only while the server is running.</span>
              </section>

              {/* ----- Server memory (RAM) — moved here from the sidebar ----- */}
              {mem && (
                <section className="adv-section">
                  <div className="adv-section-title">🧠 Server memory (RAM)</div>
                  <div className="diff-grid">
                    {memChoicesMB(mem.totalMB, mem.defaultMB, mem.overrideMB).map((mb) => {
                      const selected = (mem.overrideMB ?? mem.defaultMB) === mb
                      return (
                        <button
                          key={mb}
                          className={selected ? 'on' : ''}
                          onClick={() => changeMem(mb)}
                        >
                          {gbLabel(mb)}
                        </button>
                      )
                    })}
                  </div>
                  {(() => {
                    const selectedMB = mem.overrideMB ?? mem.defaultMB
                    const high = selectedMB > mem.totalMB * 0.8
                    return (
                      <span className={`muted hint2${high ? ' warn' : ''}`}>
                        {high
                          ? `⚠ That's most of this PC's ${gbLabel(mem.totalMB)} — leave some for your system.`
                          : `Default ${gbLabel(mem.defaultMB)} · this PC has ${gbLabel(mem.totalMB)} · applies on next start.`}
                      </span>
                    )
                  })()}
                </section>
              )}

              {/* ----- Server settings (server.properties) ----- */}
              <section className="adv-section">
                <div className="adv-section-title">🖥 Server settings</div>
                <div className="adv-grid">
                  <NumField
                    label="Max players"
                    badge={restartChanged.includes('max-players')}
                    value={props['max-players'] ?? ''}
                    onCommit={(v) => commitNumProp('max-players', v)}
                  />
                  <NumField
                    label="View distance"
                    badge={restartChanged.includes('view-distance')}
                    value={props['view-distance'] ?? ''}
                    onCommit={(v) => commitNumProp('view-distance', v)}
                  />
                  <NumField
                    label="Simulation distance"
                    badge={restartChanged.includes('simulation-distance')}
                    value={props['simulation-distance'] ?? ''}
                    onCommit={(v) => commitNumProp('simulation-distance', v)}
                  />
                  <NumField
                    label="Spawn protection"
                    badge={restartChanged.includes('spawn-protection')}
                    value={props['spawn-protection'] ?? ''}
                    onCommit={(v) => commitNumProp('spawn-protection', v)}
                  />
                  <div className="adv-field">
                    <div className="field-label">
                      PvP{restartChanged.includes('pvp') && <RestartBadge />}
                    </div>
                    <div className="seg">
                      <button
                        className={props['pvp'] === 'true' ? 'on' : ''}
                        onClick={() => setProp('pvp', 'true')}
                      >
                        On
                      </button>
                      <button
                        className={props['pvp'] === 'false' ? 'on' : ''}
                        onClick={() => setProp('pvp', 'false')}
                      >
                        Off
                      </button>
                    </div>
                  </div>
                  <div className="adv-field">
                    <div className="field-label">
                      Allow flight
                      {restartChanged.includes('allow-flight') && <RestartBadge />}
                    </div>
                    <div className="seg">
                      <button
                        className={props['allow-flight'] === 'true' ? 'on' : ''}
                        onClick={() => setProp('allow-flight', 'true')}
                      >
                        On
                      </button>
                      <button
                        className={props['allow-flight'] === 'false' ? 'on' : ''}
                        onClick={() => setProp('allow-flight', 'false')}
                      >
                        Off
                      </button>
                    </div>
                  </div>
                  <TextField
                    label="MOTD"
                    wide
                    badge={restartChanged.includes('motd')}
                    value={props['motd'] ?? ''}
                    onCommit={(v) => setProp('motd', v)}
                  />
                </div>

                <div className="adv-field adv-field-block">
                  <div className="field-label">Default join gamemode</div>
                  <div className="diff-grid quad">
                    {GAMEMODES.map((g) => (
                      <button
                        key={g.id}
                        className={(props['gamemode'] ?? '').trim() === g.id ? 'on' : ''}
                        onClick={() => {
                          setProps((p) => ({ ...p, gamemode: g.id })) // optimistic
                          void window.api.setGamemode(g.id)
                        }}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <span className="muted hint2">
                    Affects NEW joins only — players already on keep their current mode.
                  </span>
                </div>

                <div className="adv-field adv-field-block">
                  <div className="field-label">Whitelist</div>
                  <div className="seg">
                    <button
                      className={props['white-list'] === 'true' ? 'on' : ''}
                      onClick={() => {
                        setProps((p) => ({ ...p, 'white-list': 'true' })) // optimistic
                        void window.api.setWhitelist(true)
                      }}
                    >
                      On
                    </button>
                    <button
                      className={props['white-list'] === 'false' ? 'on' : ''}
                      onClick={() => {
                        setProps((p) => ({ ...p, 'white-list': 'false' })) // optimistic
                        void window.api.setWhitelist(false)
                      }}
                    >
                      Off
                    </button>
                  </div>
                  <span className="muted hint2">
                    Locks the server to known players. To add a third person, run{' '}
                    <code>/whitelist add &lt;name&gt;</code> in the console.
                  </span>
                </div>
              </section>

              {/* ----- Game rules (advanced) ----- */}
              <section className="adv-section">
                <div className="adv-section-title">⚙ Game rules (advanced)</div>
                <div className="adv-grid">
                  {ADV_BOOL_RULES.map((r) => (
                    <div className="adv-field" key={r}>
                      <div className="field-label rule-name">{r}</div>
                      <div className="seg">
                        <button
                          className={advRules[r] === 'true' ? 'on' : ''}
                          onClick={() => setAdvRule(r, 'true')}
                        >
                          On
                        </button>
                        <button
                          className={advRules[r] === 'false' ? 'on' : ''}
                          onClick={() => setAdvRule(r, 'false')}
                        >
                          Off
                        </button>
                      </div>
                    </div>
                  ))}
                  {ADV_NUM_RULES.map((r) => (
                    <NumField
                      key={r}
                      label={r}
                      mono
                      value={advRules[r] ?? ''}
                      onCommit={(v) => commitAdvNumRule(r, v)}
                    />
                  ))}
                </div>
                <span className="muted hint2">
                  {running ? 'Applied live and remembered.' : 'Remembered and applied on next start.'}
                </span>
              </section>

              {/* ----- Live world ----- */}
              <section className="adv-section">
                <div className="adv-section-title">🌍 Live world</div>
                <div className="adv-field adv-field-block">
                  <div className="field-label">Time</div>
                  <div className="quick">
                    {LIVE_TIME.map((q) => (
                      <button key={q.label} disabled={!running} onClick={() => sendCmd(q.cmd)}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="adv-field adv-field-block">
                  <div className="field-label">Weather</div>
                  <div className="quick">
                    {LIVE_WEATHER.map((q) => (
                      <button key={q.label} disabled={!running} onClick={() => sendCmd(q.cmd)}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="muted hint2">Only works while you&apos;re hosting.</span>
              </section>
            </div>
          )}
        </main>
      </div>

      <footer>
        <span className="footer-path">{repoRoot}</span>
      </footer>
    </div>
  )
}
