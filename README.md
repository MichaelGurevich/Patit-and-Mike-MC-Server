# 🎮 Patit & Mike's Minecraft Server

A Minecraft **Java Edition** server whose **world lives on GitHub**. Either of us
can play any time — the scripts pull the latest map, let us play, then save and
upload it again automatically. We take turns hosting; one runs the server, the
other connects.

- **Mike** → Windows (double-click the `*-windows.bat` files)
- **Patit** → Mac (double-click the `*-mac.command` files)

---

## ⭐ The one golden rule

> **Only ONE of us hosts at a time, and always let the server fully STOP so it
> saves & uploads.**

Minecraft's world is a pile of binary files that Git **cannot merge**. If we both
host at once and upload, the world breaks. To prevent that, the scripts use a
**lock** (the file `SESSION-LOCK.txt`): starting a session claims it, stopping
releases it. If the other person is hosting, your script will politely refuse and
tell you.

To stop the server cleanly: in the black server window, **type `stop` and press
Enter**. Wait for it to say *"world uploaded"* before closing.

---

## 🛠 First-time setup (each of us, once)

You need a real Minecraft Java account, and Git installed. The latest Minecraft
(26.x) needs **Java 25** — the setup scripts install it automatically.

### Mike (Windows)
1. Make sure you have this folder (it's already cloned).
2. Double-click **`setup-windows.bat`**.
   - Installs **Java 25** if you don't have it (via winget).
   - Downloads the matching Minecraft server.
   - Installs **Tailscale** (only needed for playing apart).
3. Done.

### Patit (Mac)
1. Clone the repo (one time), e.g. open Terminal and run:
   ```
   git clone https://github.com/MichaelGurevich/Patit-and-Mike-MC-Server.git
   ```
2. Open the folder in Finder, double-click **`setup-mac.command`**.
   - If macOS says *"cannot be opened because it is from an unidentified
     developer"*, right-click the file → **Open** → **Open**. (Only the first time.)
   - Installs Java 25 + Tailscale via Homebrew if you don't have them. If you
     don't have Homebrew, it'll point you to the download pages.
3. Done.

> 💡 **Set your name** so the lock shows who's playing. In Terminal / Git Bash:
> ```
> git config user.name "Patit"      # or "Mike"
> git config user.email "you@example.com"
> ```

---

## ▶️ Playing TOGETHER (same Wi-Fi / same house)

Lowest latency, no Tailscale needed.

1. **One** of us hosts:
   - Mike: double-click **`play-windows.bat`**
   - Patit: double-click **`play-mac.command`**
2. The window prints a **Server Address** (looks like `192.168.x.x`).
3. The **other** person opens Minecraft → **Multiplayer** → **Add Server** →
   paste that address → **Join**.
4. The host plays normally (connect to `localhost` on the hosting machine).
5. When finished, the host types **`stop`** in the server window and waits for
   *"world uploaded"*.

---

## 🌍 Playing APART (different places / different networks)

Uses **Tailscale**, a private VPN that makes your two computers act like they're
on the same network — encrypted, no router setup.

**One-time:** both install Tailscale (the setup script does this) and **log in
with the same Tailscale account** (invite each other to your *tailnet*). Sign in
once at https://login.tailscale.com.

Then:
1. **One** of us hosts:
   - Mike: double-click **`play-online-windows.bat`**
   - Patit: double-click **`play-online-mac.command`**
2. The window prints a **Tailscale Server Address** (looks like `100.x.y.z`).
3. The **other** person makes sure Tailscale is running, then in Minecraft →
   **Multiplayer** → **Add Server** → paste that `100.x.y.z` address → **Join**.

> The first time java accepts connections, **Windows Firewall** (or macOS) may ask
> to allow it — click **Allow** (Private networks).

---

## 🔁 How a session works (what the scripts do for you)

```
START  ─►  pull latest world from GitHub
       ─►  claim the lock (so the other person can't host at the same time)
       ─►  YOU PLAY
STOP   ─►  make a dated .zip backup (kept in /backups, last 10)
       ─►  commit the world
       ─►  release the lock
       ─►  push everything to GitHub
```

So the next person to play automatically gets your latest map.

---

## 💾 Backups

- **Every push is a restore point** — the full world history lives in Git.
- The scripts also keep the **last 10 daily `.zip` snapshots** in `/backups/`.
- **To restore a snapshot:** stop playing, unzip the chosen
  `backups/world-YYYYMMDD.zip` over `server/world/`, then play. (Ask if you want a
  one-click restore script.)

---

## 🆘 Troubleshooting

**"SERVER IS LOCKED"** — the other person is hosting (or crashed mid-session).
- If they're actually playing: wait for them to stop.
- If they crashed / closed without stopping: confirm nobody is playing, then
  double-click **`unlock-windows.bat`** / **`unlock-mac.command`**, then play.

**"upload (push) failed"** — usually no internet. Your world is saved locally and
committed. Reconnect and just run the play script again (it'll push), or run
`git push` in the folder.

**"Could not pull the latest world (possible sync conflict)"** — rare, happens
only if the golden rule got broken (both played at once). Easiest fix: decide
whose version to keep and run, from the folder:
```
git fetch origin
git reset --hard origin/main      # keep GitHub's version (discards local)
```
or push your local version over the remote (keeps yours, ⚠️ overwrites theirs):
```
git push --force origin main
```
Then go back to taking turns. If unsure, copy the folder first so nothing's lost.

**Version mismatch** — both must run the same Minecraft version. It's pinned in
`server/version.txt`. If you edited it, re-run setup.

**Repo getting large** — binary worlds make Git history grow over time. If it ever
becomes a problem, we can squash history (collapse old commits into one). Ask and
I'll add a `compact-history` script.

---

## 📁 What's in here

```
setup-windows.bat / setup-mac.command          one-time setup
play-windows.bat / play-mac.command            host for SAME-network play
play-online-windows.bat / -mac.command         host for OVER-internet play (Tailscale)
unlock-windows.bat / unlock-mac.command        emergency: clear a stuck lock
scripts/                                        the actual logic + config
server/                                         server.properties, eula, world/ (the map)
backups/                                        dated .zip snapshots
SESSION-LOCK.txt                                whose turn it is right now
```

Settings (RAM, port, how many backups) live in `scripts/config.ps1` (Windows) and
`scripts/config.sh` (Mac).
