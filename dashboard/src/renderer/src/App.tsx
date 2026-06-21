import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

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

type Cmd = { label: string; cmd: string | string[] }

const QUICK: Cmd[] = [
  { label: '☀ Day', cmd: 'time set day' },
  { label: '🌅 Noon', cmd: 'time set noon' },
  { label: '🌙 Night', cmd: 'time set night' },
  { label: '🌌 Midnight', cmd: 'time set midnight' },
  { label: '🌤 Clear', cmd: 'weather clear' },
  { label: '🌧 Rain', cmd: 'weather rain' },
  { label: '⛈ Thunder', cmd: 'weather thunder' },
  { label: '💾 Save', cmd: 'save-all flush' },
  { label: '👥 Who’s on', cmd: 'list' },
  { label: '🛏 Cozy night', cmd: ['time set night', 'weather clear', 'difficulty peaceful'] }
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

type Theme = 'light' | 'dark'
type Tab = 'console' | 'players' | 'rules'

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
  const [connect, setConnect] = useState<{ lan: string | null; tailscale: string | null; port: string }>({
    lan: null,
    tailscale: null,
    port: '25565'
  })
  const [copied, setCopied] = useState('')

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

  const loadProps = useCallback(async () => {
    try {
      const p = await window.api.getProps()
      setDifficulty((p.difficulty ?? '').trim())
    } catch {
      /* ignore */
    }
  }, [])

  const changeDifficulty = (id: string): void => {
    setDifficulty(id)
    void window.api.setDifficulty(id)
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
    void loadConnect()
    const offLog = window.api.onLog((line) => setLines((p) => [...p.slice(-1500), line]))
    const offState = window.api.onState((s) => {
      setState(s as State)
      void refresh()
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
          void loadConnect()
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
  }, [refresh, loadRoster, loadProps, loadConnect])

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

  const setRule = (rule: string, val: boolean): void => {
    sendCmd(`gamerule ${rule} ${val}`)
    setRuleState((p) => ({ ...p, [rule]: val }))
  }

  const resetVanilla = (): void => {
    if (!window.confirm('Reset all game rules to vanilla defaults?\n\nDifficulty is NOT changed.')) return
    const next: Record<string, boolean> = {}
    for (const [rule, def] of Object.entries(VANILLA_DEFAULTS)) {
      sendCmd(`gamerule ${rule} ${def}`)
      if (def === 'true' || def === 'false') next[rule] = def === 'true'
    }
    setRuleState((p) => ({ ...p, ...next }))
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
              {running && (
                <button className="danger big" onClick={() => void window.api.stop()}>
                  ■ Stop &amp; Save
                </button>
              )}
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
              <table className="roster">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Playtime</th>
                    <th>Deaths</th>
                    <th>Mined</th>
                    <th>Adv.</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No players yet.
                      </td>
                    </tr>
                  )}
                  {roster.map((p) => (
                    <tr key={p.uuid}>
                      <td>
                        <span className={`dot ${online.includes(p.name) ? 'on' : ''}`} /> {p.name}
                      </td>
                      <td>{fmtPlaytime(p.playTimeTicks)}</td>
                      <td>{p.deaths}</td>
                      <td>{p.blocksMined.toLocaleString()}</td>
                      <td>{p.advancements}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'rules' && (
            <div className="tabpanel">
              <div className="rules-actions">
                <button
                  className="primary"
                  disabled={!running}
                  onClick={resetVanilla}
                  title="Set all game rules back to vanilla defaults (difficulty unchanged)"
                >
                  ↺ Reset to Vanilla
                </button>
                <span className="muted">
                  Restores all standard game rules to their defaults. Difficulty is not changed.
                </span>
              </div>
              <div className="rules">
                {GAMERULES.map((r) => (
                  <div className="rule" key={r}>
                    <span className="rule-name">{r}</span>
                    <div className="seg">
                      <button
                        className={ruleState[r] === true ? 'on' : ''}
                        disabled={!running}
                        onClick={() => setRule(r, true)}
                      >
                        On
                      </button>
                      <button
                        className={ruleState[r] === false ? 'on' : ''}
                        disabled={!running}
                        onClick={() => setRule(r, false)}
                      >
                        Off
                      </button>
                    </div>
                  </div>
                ))}
                {!running && (
                  <p className="muted hint">Start the server to change game rules live.</p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <footer>{repoRoot}</footer>
    </div>
  )
}
