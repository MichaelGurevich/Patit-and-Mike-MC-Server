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

function LockBanner({
  lock,
  state,
  onForce
}: {
  lock: LockInfo | null
  state: State
  onForce: () => void
}): JSX.Element | null {
  if (state === 'running' || state === 'starting') {
    return <div className="banner ok">You hold the session — happy building! 🛠️</div>
  }
  if (lock && lock.status === 'active') {
    return (
      <div className="banner warn">
        <span>
          🔒 <strong>{lock.holder}</strong> (on {lock.machine}) has been hosting since {lock.since}.
          Only one person can host at a time.
        </span>
        <button onClick={onForce}>Force-unlock</button>
      </div>
    )
  }
  return <div className="banner free">✅ Lock is free — ready when you are.</div>
}

export default function App(): JSX.Element {
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

  const consoleRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    void refresh()
    void loadRoster()
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
  }, [refresh, loadRoster])

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
      <header>
        <div className="brand">🎮 MC Server Dashboard</div>
        <div className="head-right">
          {uptime && <span className="chip">⏱ {uptime}</span>}
          {perfOn && perf && (
            <span className={`chip ${perf.tps >= 19.5 ? 'good' : perf.mspt > 50 ? 'bad' : 'warnchip'}`}>
              {perf.mspt.toFixed(1)} ms · {perf.tps} TPS
            </span>
          )}
          <button className={`mini ${perfOn ? 'on' : ''}`} title="Toggle performance polling" onClick={togglePerf}>
            📊
          </button>
          <StateBadge state={state} />
        </div>
      </header>

      <LockBanner lock={lock} state={state} onForce={forceUnlock} />

      <div className="controls">
        {!running && !busy && (
          <button
            className="primary big"
            onClick={() => {
              setLines([])
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
            {state === 'starting' ? 'Starting…' : 'Saving &amp; uploading…'}
          </button>
        )}
      </div>

      <div className="console-toolbar">
        <input
          className="search"
          placeholder="🔍 Filter console…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as 'all' | Level)}>
          <option value="all">All</option>
          <option value="info">Info</option>
          <option value="warn">Warnings</option>
          <option value="error">Errors</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} /> Auto-scroll
        </label>
        <button className="mini" onClick={copyConsole} title="Copy visible lines">
          Copy
        </button>
        <button className="mini" onClick={() => setLines([])} title="Clear console">
          Clear
        </button>
      </div>

      <div className="console" ref={consoleRef}>
        {visibleLines.length === 0 && <div className="muted">Console output will appear here…</div>}
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

      <details className="panel" open>
        <summary>
          👥 Players{' '}
          <span className="count">
            {online.length} online · {roster.length} known
          </span>
        </summary>
        <div className="panel-body">
          <button className="mini" onClick={() => void loadRoster()}>
            Refresh
          </button>
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
      </details>

      <details className="panel">
        <summary>⚙ Game rules</summary>
        <div className="panel-body rules">
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
          <p className="muted hint">Changes apply live while the server is running.</p>
        </div>
      </details>

      <footer>
        <span className="muted">{repoRoot}</span>
      </footer>
    </div>
  )
}
