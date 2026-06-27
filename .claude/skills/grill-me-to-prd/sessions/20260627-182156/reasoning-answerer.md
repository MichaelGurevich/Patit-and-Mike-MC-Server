# Answerer reasoning

## Assumptions made
- Notifications use `say` (`[Server] <msg>`) via existing `send(cmd)`; thin `say` wrapper cleaner but not required.
- Single boolean master "Notify players in-game" toggle (default on) in settings.json gates ALL auto messages; stays editable when stopped.
- Advanced Settings = new FOURTH TAB ("Advanced").
- Free-text broadcast box + notification toggle live in Advanced.
- RAM and Cheats (time/weather) relocate into Advanced; Cheats becomes a "Live world" section.
- Difficulty and Connect card (incl. read-only port) stay on the main page/sidebar.
- Advanced sections: Server (server.properties), Gameplay (gamerules), Live world (time/weather), plus RAM + notification controls.
- New Server settings: max-players, view-distance, simulation-distance, pvp, spawn-protection, motd, allow-flight, gamemode (default join), + whitelist on/off toggle.
- New Gameplay gamerules: randomTickSpeed, doMobLoot, doTileDrops, playersSleepingPercentage, spawnRadius.
- Apply: gamemode live via `defaultgamemode`; pvp/view-distance/sim-distance/max-players/spawn-protection/motd/allow-flight restart-only; all written immediately, badged where not live.
- Whitelist = plain on/off toggle (`whitelist on/off` + persist white-list/enforce-whitelist), not name-management.
- v1 auto-notify triggers: Server ready, Stop & Save (countdown), Difficulty change, Whitelist toggle. Game Rules tab may fire ONE optional consolidated "rules updated" message.
- NOT triggering: RAM, individual gamerule toggles, view/sim-distance, MOTD.
- Preset text FIXED in v1, not editable.
- Stop & Save is ONLY action with real enforced cancellable 10s delay (fixed constant); auto-skip at 0 players; "Stopping in 10s… (Cancel)". All else fire-and-forget.
- Numeric fields clamp-on-blur silently to nearest bound, never raw: max-players 1–20, view-distance 3–32, simulation-distance 3–32, spawn-protection 0–64, randomTickSpeed 0–256, playersSleepingPercentage 0–100, spawnRadius 0–128.
- "Applies on next restart" badge activates when restart-only value differs from process-loaded snapshot; clears on next start. Live fields never badge.
- Server stopped: Broadcast box + send disabled (tooltip "Server is not running"); settings edits persist for next start.
- Baton-lock: Advanced edits follow same model as Difficulty/Game Rules — persist locally, sync on push, only meaningful for lock holder. No new conflict surface, no hard lock guard (optional soft hint).
- v1 testing bar: extract four pure helpers — `clamp(value,min,max)`, `buildNotifyMessage(action,detail)`, `shouldCountdown(playerCount)`, `diffFromLoadedSnapshot(current,loaded)` — kept separate from thin ServerController/IPC/Electron glue; manual verification checklist once against a real server; `npm run typecheck` must pass. No test runner added as part of this feature.

## Tradeoffs rejected
- `tellraw` over `say`; free-text only / presets only; collapsible section vs tab; consolidating Difficulty; moving read-only port; exposing hardcore/online-mode/command-block/RCON/query/resource-pack; excluding restart-only fields; full whitelist name UI; editable text v1; per-gamerule notifications; countdown on non-Stop / configurable length.
- Writing numeric values raw without clamping — a malformed value can stop the server booting and strand the other host.
- Raising max-players above 20 — pointless at two-friend scale; clamp protects against typos.
- A hard "you don't hold the lock" edit guard — editing while not hosting isn't dangerous and would be inconsistent with existing behavior.
- Adding a test runner (Vitest) as part of this feature — separate decision with its own setup/CI surface; would scope-creep. Helpers written testable so a runner can be added cleanly later as its own task.

## Open questions I flagged
- Whether port should become editable in Advanced — revisit if exposed.
- Whitelist UX when a third person needs adding — punted to console `/whitelist add`; revisit if clunky.
- `defaultgamemode` "new joins only" must be communicated in UI copy — revisit during UI copy.
- Whether the Game Rules tab's consolidated "rules updated" message is on-by-default or opt-in — minor, revisit during build.
- Whether a soft non-blocking "you're not the current host" hint is worth adding — optional, revisit during build.
- Adding a test runner (Vitest) — deferred as a separate follow-up, not part of this feature; revisit if/when automated tests are wanted.
