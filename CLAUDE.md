# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

A **Minecraft Java Edition** server whose **world lives in Git**. Two people —
**Mike** (Windows) and **Patit** (Mac) — take turns hosting. The scripts pull the
latest world from GitHub, let one person host, then back up, commit, and push the
world again on stop, so the next person always gets the latest map.

The world is stored as **binary region files that Git cannot merge**. The entire
design exists to guarantee **only one person hosts at a time** (a "baton lock"),
because a concurrent-host merge would corrupt the world.

There is no Python here despite the parent folder name (`Coding\Python\...`); this
is shell/PowerShell + an Electron/TypeScript app.

## Repository layout

```
play-windows.bat / play-mac.command            host for SAME-network play
play-online-windows.bat / -mac.command         host OVER the internet (Tailscale)
dashboard-windows.bat / dashboard-mac.command  launch the Electron dashboard
setup-windows.bat / setup-mac.command          one-time setup (Java, server.jar, Tailscale)
unlock-windows.bat / unlock-mac.command        emergency: clear a stuck lock
scripts/                                        the actual logic + shared config
server/                                         server.properties, eula, world/ (the map)
backups/                                        dated .zip snapshots (last 10)
dashboard/                                      Electron + React control panel (alt. to scripts)
SESSION-LOCK.txt                                whose turn it is right now (the baton)
README.md                                       end-user (non-technical) instructions
```

The `*.bat` / `*.command` files in the root are thin double-click launchers. The
real logic is in `scripts/` and `dashboard/src/`.

## The two ways to host (keep them in sync)

There are **two independent implementations of the same baton-lock workflow**.
A change to the hosting/sync/lock/backup logic usually needs to land in **all
three** places to keep behavior identical:

1. **Windows scripts** — `scripts/win-lib.ps1` (+ `scripts/config.ps1`)
2. **Mac scripts** — `scripts/mac-lib.sh` (+ `scripts/config.sh`)
3. **Dashboard** — `dashboard/src/main/git.ts` (+ `paths.ts` `DEFAULT_CONFIG`)

`dashboard/src/main/git.ts` is explicitly documented as "mirrors the shell
scripts." When you touch lock/pull/backup/push behavior, verify parity across
PowerShell, Bash, and TypeScript.

## The session workflow (identical across all three)

```
START  ─►  commit any stray local changes (recover from a prior crash)
       ─►  pull latest world from GitHub (rebase --autostash)
       ─►  check the baton lock; refuse if someone else holds it (unless forced)
       ─►  write lock = active, commit + push the lock
       ─►  HOST / PLAY
STOP   ─►  make a dated .zip backup in /backups (keep last BACKUP_KEEP=10)
       ─►  commit the world
       ─►  write lock = free, commit
       ─►  pull --rebase then push everything
```

`SESSION-LOCK.txt` is a simple LF-terminated `key=value` file:
`status` (`active`/`free`), `holder`, `machine`, `since`, `note`. It is committed
and pushed so the lock is visible to the other machine. `**/session.lock`
(Minecraft's own per-machine lock) is gitignored — do not confuse the two.

## Config & conventions

- **Pinned versions/settings live in config, not inline.** Windows:
  `scripts/config.ps1`. Mac: `scripts/config.sh`. Dashboard:
  `DEFAULT_CONFIG` in `dashboard/src/main/paths.ts`. Keep all three aligned.
  Current values: Xms 2G / Xmx 4G, port 25565, branch `main`, keep 10 backups,
  **Java minimum 25**.
- **Minecraft version** is pinned in `server/version.txt` (currently `26.2`).
  Both hosts must run the same version; setup downloads the matching `server.jar`.
- **Java discovery**: scripts/dashboard search PATH then common JDK install
  locations and pick the newest Java `>= JAVA_MIN`, because an older `java` may be
  first on PATH. Don't assume `java` on PATH is correct.
- **Tailscale** provides the "play apart" VPN; IP detection lives in the same lib
  files (`Get-TailscaleIP` / `ts_ip`).

### Line endings matter (see `.gitattributes`)

- `*.sh` / `*.command` → **LF** (must run on macOS even when committed from Windows)
- `*.ps1` / `*.bat` → **CRLF**
- `SESSION-LOCK.txt`, `server/version.txt` → **LF** (read by both OSes)
- World data (`*.mca`, `*.dat`, `*.nbt`, `*.jar`, `*.zip`, ...) → **binary**, never
  merged or line-ending-converted

When writing the lock file in code, write **LF, no BOM** (the scripts go out of
their way to do this for cross-OS compatibility).

### What is tracked vs ignored (see `.gitignore`)

- **Tracked on purpose** (this is how the world syncs): `server/world/`,
  `server/server.properties`, `eula.txt`, `ops.json`, `whitelist.json`,
  `server/version.txt`, `backups/`.
- **Ignored** (per-machine runtime): `server/server.jar`, `server/libraries/`,
  `server/versions/`, `server/logs/`, crash reports, `**/session.lock`,
  `dashboard/node_modules`, `dashboard/out`, `dashboard/release`, `.idea/`.

### PowerShell gotchas (already handled — preserve them)

- `$ErrorActionPreference = "Continue"` is intentional: native `git` prints normal
  progress to stderr, which under `Stop` raises terminating errors when streams are
  redirected. Critical calls are guarded with explicit `$LASTEXITCODE` checks +
  `throw`. Don't switch to `Stop`.
- `java -version` prints to stderr; `Get-JavaMajor` captures all streams to a temp
  file to read the version. Don't "simplify" this.
- Always call `git.exe` explicitly to avoid recursing into a `git` function.

## The dashboard (Electron + React + TypeScript)

A **local, single-user** desktop app — an alternative to the `play-*` scripts. Not
network-exposed. It reuses the exact same baton-lock rules.

```
dashboard/src/main/      Electron main process (backend)
  index.ts               window + IPC wiring; quitting while running stops & saves first
  server.ts              ServerController: spawn java, stream console, state machine
  git.ts                 lock / pull / backup (zip via archiver) / push — mirrors shell scripts
  java.ts                find Java >= javaMin across Win/Mac
  paths.ts               locate repo root, AppConfig + DEFAULT_CONFIG, settings.json
  logwatch.ts            parse vanilla stdout lines into typed ServerEvents
  players.ts, net.ts, properties.ts, capabilities.ts   roster, connect info, server.properties
src/preload/index.ts     contextBridge — safe UI↔main boundary
src/renderer/            React UI (App.tsx, styles.css)
```

- Repo root is auto-detected by walking up looking for `SESSION-LOCK.txt` (or a
  `server/` + `.git` pair); falls back to a saved `repoRoot` in the app's
  `settings.json`, or a folder-picker prompt.
- `logwatch.ts` parses the **vanilla 26.x log format**
  `[HH:MM:SS] [Server thread/INFO]: message`. If Minecraft's log format changes,
  these regexes are what break.
- Difficulty changes are both **persisted** (written to `server.properties` via
  `setProperty`) **and applied live** (`difficulty <x>` command) — see
  `setDifficulty` in `index.ts`.

### Dashboard commands (run from `dashboard/`)

```
npm install          # first time
npm run dev          # hot-reload dev mode
npm run build        # electron-vite build -> out/
npm run typecheck    # typecheck:node + typecheck:web (run before committing TS changes)
npm run pack:win     # portable app -> release/MCServerDashboard-win32-x64/ (recommended)
npm run pack:mac     # portable .app (each person builds on their own OS)
npm run package:win  # full NSIS installer (needs Developer Mode / admin for symlinks)
```

There is no test runner configured; `npm run typecheck` is the available check.

## Working in this repo — guidance for assistants

- **Never break the one-host-at-a-time guarantee.** Any change to lock, pull,
  backup, or push logic must keep the baton semantics and land in PowerShell,
  Bash, and TypeScript together.
- **Don't manually edit `SESSION-LOCK.txt`** to "fix" state in normal flow — use
  the unlock scripts / dashboard force-unlock, which commit and push correctly.
- **World commits are large binary churn.** Avoid adding workflows that commit the
  world more often than necessary. Don't rewrite Git history without the user
  explicitly asking (the README mentions a future optional `compact-history`).
- **This runs on both Windows and macOS.** Respect `.gitattributes` line endings;
  don't introduce OS-specific assumptions into shared files.
- The user typically interacts via double-click `.bat`/`.command` launchers — keep
  those thin and keep real logic in `scripts/` and `dashboard/src/`.
- Primary OS for development here is **Windows** (use PowerShell; the Bash tool is
  available for POSIX scripts).
```
