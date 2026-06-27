import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { memoryFlags, type RepoPaths, type AppConfig } from './paths'
import { findJava } from './java'
import { acquire, releaseAndPush, readLock, type LockInfo } from './git'
import { readGameRules } from './gamerules'
import { readProperties } from './properties'
import { parse, isPerfNoise, type ServerEvent } from './logwatch'
import { STOP_COUNTDOWN_SECONDS, shouldCountdown, buildNotifyMessage, RESTART_ONLY_KEYS } from '../shared/helpers'

export type ServerState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

export interface Emitter {
  log: (line: string) => void
  state: (s: ServerState) => void
  event: (ev: ServerEvent) => void
}

const PERF_POLL_MS = 10_000

export class ServerController {
  private proc: ChildProcessWithoutNullStreams | null = null
  private state: ServerState = 'idle'
  private releasing = false
  private readyAt: number | null = null
  private perfDesired = false
  private perfTimer: ReturnType<typeof setInterval> | null = null
  // Per-machine RAM override (MB) for -Xmx/-Xms; null = use the pinned config.
  private memMB: number | null = null
  // Names currently online, kept in sync from join/left/list events. Drives
  // getPlayerCount(), which gates the Stop & Save countdown.
  private online = new Set<string>()
  // The Stop & Save countdown ticker; non-null only while a countdown is pending.
  private countdownTimer: ReturnType<typeof setInterval> | null = null
  // Snapshot of RESTART_ONLY_KEYS as read from server.properties at JVM spawn,
  // or null before the first start / after the process exits. Drives the
  // "applies on next restart" badge by comparing against the current file.
  private loadedProps: Record<string, string> | null = null

  constructor(
    private readonly paths: RepoPaths,
    private readonly cfg: AppConfig,
    private readonly emit: Emitter
  ) {}

  getState(): ServerState {
    return this.state
  }

  getReadyAt(): number | null {
    return this.readyAt
  }

  getMemoryMB(): number | null {
    return this.memMB
  }

  /** Number of players currently online (tracked from join/left/list events). */
  getPlayerCount(): number {
    return this.online.size
  }

  /** Snapshot of the RESTART_ONLY_KEYS values the running JVM loaded at spawn;
   *  null before the first start and after the process exits. */
  getLoadedProps(): Record<string, string> | null {
    return this.loadedProps
  }

  /** Broadcast a free-text message via `say`. No-op unless the server is running.
   *  (Trimming/validation is the caller's responsibility.) */
  say(text: string): void {
    if (this.proc && this.state === 'running') {
      this.proc.stdin.write(`say ${text}\n`)
    }
  }

  /** Set the per-machine RAM override (MB) for -Xmx/-Xms. Takes effect on the
   *  next start — a running JVM's heap size is fixed and cannot change live. */
  setMemoryMB(mb: number | null): void {
    this.memMB = mb && mb > 0 ? mb : null
  }

  /** Turn periodic `tick query` performance polling on/off. */
  setPerfPolling(on: boolean): void {
    this.perfDesired = on
    if (on && this.state === 'running' && this.readyAt) this.startPerfTimer()
    else this.stopPerfTimer()
  }

  private startPerfTimer(): void {
    if (this.perfTimer) return
    this.perfTimer = setInterval(() => {
      if (this.proc && this.state === 'running') this.proc.stdin.write('tick query\n')
    }, PERF_POLL_MS)
  }

  private stopPerfTimer(): void {
    if (this.perfTimer) {
      clearInterval(this.perfTimer)
      this.perfTimer = null
    }
  }

  private onReady(): void {
    this.readyAt = Date.now()
    // Seed presence once, and begin perf polling if the user wants it.
    if (this.proc) this.proc.stdin.write('list\n')
    // Re-apply the remembered game-rule selections so the server always starts
    // with the settings chosen in the dashboard. Remember-only: rules never set
    // in the dashboard are absent here and keep whatever the world already has.
    if (this.proc) {
      for (const [rule, value] of Object.entries(readGameRules(this.paths))) {
        this.proc.stdin.write(`gamerule ${rule} ${value}\n`)
      }
    }
    if (this.perfDesired) this.startPerfTimer()
  }

  isBusy(): boolean {
    return this.state === 'starting' || this.state === 'running' || this.state === 'stopping'
  }

  currentLock(): LockInfo {
    return readLock(this.paths)
  }

  private setState(s: ServerState): void {
    this.state = s
    this.emit.state(s)
  }

  async start(): Promise<void> {
    if (this.isBusy()) return
    this.readyAt = null
    this.online.clear()
    this.setState('starting')

    const res = await acquire(this.paths, this.cfg, this.emit.log)
    if (!res.ok) {
      this.emit.log(res.reason ?? 'Could not start.')
      this.setState('error')
      return
    }

    const java = findJava(this.cfg.javaMin)
    if (!java) {
      this.emit.log(`Java ${this.cfg.javaMin}+ was not found. Run setup first.`)
      this.setState('error')
      return
    }
    if (!existsSync(this.paths.jarFile)) {
      this.emit.log('server.jar is missing. Run setup first.')
      this.setState('error')
      return
    }

    const { xms, xmx } = memoryFlags(this.cfg, this.memMB)
    this.emit.log(`Starting the Minecraft server... (memory: ${xmx})`)
    this.releasing = false
    // Snapshot the restart-only properties the JVM is about to load, so the UI
    // can later flag which edited fields won't take effect until a restart.
    const allProps = readProperties(this.paths)
    this.loadedProps = {}
    for (const key of RESTART_ONLY_KEYS) {
      if (allProps[key] !== undefined) this.loadedProps[key] = allProps[key]
    }
    const proc = spawn(
      java,
      [`-Xms${xms}`, `-Xmx${xmx}`, '-jar', 'server.jar', 'nogui'],
      { cwd: this.paths.serverDir, windowsHide: true }
    )
    this.proc = proc
    this.setState('running')

    proc.stdout.on('data', (d: Buffer) => this.pushLines(d))
    proc.stderr.on('data', (d: Buffer) => this.pushLines(d))
    proc.on('error', (e) => {
      // Kill any pending countdown so a stray timer can't fire after the crash.
      this.clearCountdown()
      this.emit.log(`Process error: ${String(e)}`)
      this.setState('error')
    })
    proc.on('close', () => {
      void this.onExit()
    })
  }

  private pushLines(buf: Buffer): void {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (!line.length) continue
      if (!isPerfNoise(line)) this.emit.log(line)
      const ev = parse(line)
      if (ev) {
        // Keep the online roster current so getPlayerCount() is accurate.
        if (ev.type === 'joined') this.online.add(ev.name)
        else if (ev.type === 'left') this.online.delete(ev.name)
        else if (ev.type === 'list') this.online = new Set(ev.names)
        this.emit.event(ev)
        if (ev.type === 'ready') this.onReady()
      }
    }
  }

  send(cmd: string): void {
    if (this.proc && this.state === 'running') {
      this.proc.stdin.write(cmd + '\n')
    }
  }

  /**
   * Stop & save. By default, when at least one player is online, this runs an
   * enforced 10s countdown (so players can wrap up) before the real stop; with
   * nobody online — or with `countdown: false` — it stops immediately.
   *
   * During the countdown getState() stays 'running' so the user can cancel and
   * keep using the console; we only flip to 'stopping' once the timer elapses.
   */
  stop(opts?: { notify?: boolean; countdown?: boolean }): void {
    // Nothing to do if not running (this also rules out an already-'stopping'
    // real stop) or if a countdown is already in progress.
    if (!this.proc || this.state !== 'running') return
    if (this.countdownTimer) return

    const countdown = opts?.countdown !== false
    const count = this.getPlayerCount()

    if (countdown && shouldCountdown(count)) {
      // Optionally announce the impending shutdown once, up front.
      if (opts?.notify) this.send(buildNotifyMessage('stop'))
      // Emit the full countdown immediately at N, then tick down once a second.
      // When it reaches 0 we clear the timer and perform the real stop.
      this.emit.event({ type: 'countdown', secondsLeft: STOP_COUNTDOWN_SECONDS })
      let remaining = STOP_COUNTDOWN_SECONDS
      this.countdownTimer = setInterval(() => {
        remaining -= 1
        if (remaining > 0) {
          this.emit.event({ type: 'countdown', secondsLeft: remaining })
        } else {
          this.clearCountdown()
          this.realStop()
        }
      }, 1000)
      return
    }

    // No countdown wanted (or nobody online): stop right away.
    this.realStop()
  }

  /** Cancel a pending Stop & Save countdown, if one is active. State stays
   *  'running'. No-op when there is no countdown in progress. */
  cancelStop(): void {
    if (!this.countdownTimer) return
    this.clearCountdown()
    this.emit.event({ type: 'countdownCancelled' })
  }

  /** Clear the countdown ticker, if any. */
  private clearCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
  }

  /** Perform the actual shutdown: flip to 'stopping' and send `stop` to the JVM. */
  private realStop(): void {
    if (!this.proc || this.state !== 'running') return
    this.setState('stopping')
    this.emit.log('> stop')
    this.proc.stdin.write('stop\n')
  }

  private async onExit(): Promise<void> {
    if (this.releasing) return
    this.releasing = true
    this.proc = null
    this.readyAt = null
    this.online.clear()
    this.loadedProps = null
    // Drop any pending countdown — the process is gone, the timer must not fire.
    this.clearCountdown()
    this.stopPerfTimer()
    this.setState('stopping')
    try {
      await releaseAndPush(this.paths, this.cfg, this.emit.log)
    } catch (e) {
      this.emit.log(`Error during save/upload: ${String(e)}`)
    }
    this.setState('stopped')
  }
}
