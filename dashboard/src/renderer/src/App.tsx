import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

type State = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

interface LockInfo {
  status: string
  holder: string
  machine: string
  since: string
  note: string
}

const QUICK: { label: string; cmd: string }[] = [
  { label: '☀ Day', cmd: 'time set day' },
  { label: '🌙 Night', cmd: 'time set night' },
  { label: '🌤 Clear', cmd: 'weather clear' },
  { label: '🌧 Rain', cmd: 'weather rain' },
  { label: '💾 Save', cmd: 'save-all' },
  { label: '👥 Players', cmd: 'list' },
  { label: '🎒 Keep items', cmd: 'gamerule keepInventory true' }
]

const STATE_LABEL: Record<State, string> = {
  idle: 'Idle',
  starting: 'Starting…',
  running: 'Running',
  stopping: 'Saving…',
  stopped: 'Stopped',
  error: 'Error'
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
  const [lines, setLines] = useState<string[]>([])
  const [cmd, setCmd] = useState('')
  const consoleRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const s = await window.api.getStatus()
    setRepoRoot(s.repoRoot)
    setState(s.state as State)
    setLock(s.lock)
  }, [])

  useEffect(() => {
    void refresh()
    const offLog = window.api.onLog((line) => setLines((p) => [...p.slice(-1500), line]))
    const offState = window.api.onState((s) => {
      setState(s as State)
      void refresh()
    })
    const offLock = window.api.onLock((l) => setLock(l))
    return () => {
      offLog()
      offState()
      offLock()
    }
  }, [refresh])

  useEffect(() => {
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const running = state === 'running'
  const busy = state === 'starting' || state === 'stopping'

  const sendCmd = (c: string): void => {
    if (c.trim()) void window.api.send(c.trim())
  }
  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    sendCmd(cmd)
    setCmd('')
  }

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

  return (
    <div className="app">
      <header>
        <div className="brand">🎮 MC Server Dashboard</div>
        <StateBadge state={state} />
      </header>

      <LockBanner lock={lock} state={state} onForce={() => void window.api.forceUnlock()} />

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

      <div className="console" ref={consoleRef}>
        {lines.length === 0 && <div className="muted">Console output will appear here…</div>}
        {lines.map((l, i) => (
          <div key={i} className="line">
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
          <button key={q.cmd} disabled={!running} onClick={() => sendCmd(q.cmd)}>
            {q.label}
          </button>
        ))}
      </div>

      <footer>
        <span className="muted">{repoRoot}</span>
      </footer>
    </div>
  )
}
