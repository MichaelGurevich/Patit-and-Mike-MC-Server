# 🎮 MC Server Dashboard

A small **local** desktop app (Electron + React) for whoever is hosting the
Minecraft server. It replaces typing in the black cmd console with a nicer window:
one-click **Start & Play**, a live console, quick commands, and a **Stop & Save**
button that saves → backs up → pushes → releases the lock for you.

It's single-user and local — it only ever controls *your* session on *your*
machine. It is **not** exposed to the network.

## What it does
- **Start & Play** → pulls the latest world from GitHub, claims the baton lock,
  finds Java 25+, and launches the server.
- **Live console** → streams the server output; type any command (or use the
  quick buttons: day/night, weather, save, list players, keep-inventory).
- **Stop & Save** → sends `stop`, waits for shutdown, makes a dated backup,
  commits, pushes to GitHub, and releases the lock — so the other person gets
  your latest map next time.
- **Lock banner** → shows if the other person is currently hosting, with a
  force-unlock if they crashed.

It reuses the exact same Git "baton lock" rules as the `play-*` scripts, so the
**one-host-at-a-time** guarantee still holds across both your machines.

## Run it
**Easiest:** double-click `dashboard-windows.bat` (Windows) or
`dashboard-mac.command` (Mac) in the repo root. The first run installs and builds
automatically.

**Dev mode** (hot reload, for tinkering):
```
cd dashboard
npm install      # first time only
npm run dev
```

## Make it a real double-click app (installer)
Build a native installer you can pin to your taskbar/dock:
```
cd dashboard
npm run package:win    # Windows -> dashboard/release/*.exe
npm run package:mac    # Mac     -> dashboard/release/*.dmg
```
Each person builds on their own OS. If you launch the installed app from outside
the repo, it'll ask you to point it at the server folder once (remembered after).

## Notes
- Use **either** the dashboard **or** the `play-*` scripts to host — not both at
  once on the same machine.
- It auto-detects the server folder by looking for `SESSION-LOCK.txt`. Override by
  choosing the folder when prompted.
- Settings (RAM, branch, Java minimum, backup count) live in
  `src/main/paths.ts` → `DEFAULT_CONFIG`.

## Structure
```
src/main/      Electron main process (the backend)
  index.ts     window + IPC wiring, quit-safely-saves
  server.ts    start/stop the java process, stream console
  git.ts       lock, pull, backup (zip), push  (mirrors the shell scripts)
  java.ts      find Java >= 25 across Win/Mac
  paths.ts     locate the repo, config, settings
src/preload/   safe bridge between UI and main (contextBridge)
src/renderer/  the React UI
```
