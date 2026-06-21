import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { RepoPaths, AppConfig } from './paths'
import { findJava } from './java'
import { acquire, releaseAndPush, readLock, type LockInfo } from './git'

export type ServerState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

export interface Emitter {
  log: (line: string) => void
  state: (s: ServerState) => void
}

export class ServerController {
  private proc: ChildProcessWithoutNullStreams | null = null
  private state: ServerState = 'idle'
  private releasing = false

  constructor(
    private readonly paths: RepoPaths,
    private readonly cfg: AppConfig,
    private readonly emit: Emitter
  ) {}

  getState(): ServerState {
    return this.state
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

    this.emit.log('Starting the Minecraft server...')
    this.releasing = false
    const proc = spawn(
      java,
      [`-Xms${this.cfg.xms}`, `-Xmx${this.cfg.xmx}`, '-jar', 'server.jar', 'nogui'],
      { cwd: this.paths.serverDir, windowsHide: true }
    )
    this.proc = proc
    this.setState('running')

    proc.stdout.on('data', (d: Buffer) => this.pushLines(d))
    proc.stderr.on('data', (d: Buffer) => this.pushLines(d))
    proc.on('error', (e) => {
      this.emit.log(`Process error: ${String(e)}`)
      this.setState('error')
    })
    proc.on('close', () => {
      void this.onExit()
    })
  }

  private pushLines(buf: Buffer): void {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (line.length) this.emit.log(line)
    }
  }

  send(cmd: string): void {
    if (this.proc && this.state === 'running') {
      this.proc.stdin.write(cmd + '\n')
    }
  }

  stop(): void {
    if (this.proc && this.state === 'running') {
      this.setState('stopping')
      this.emit.log('> stop')
      this.proc.stdin.write('stop\n')
    }
  }

  private async onExit(): Promise<void> {
    if (this.releasing) return
    this.releasing = true
    this.proc = null
    this.setState('stopping')
    try {
      await releaseAndPush(this.paths, this.cfg, this.emit.log)
    } catch (e) {
      this.emit.log(`Error during save/upload: ${String(e)}`)
    }
    this.setState('stopped')
  }
}
