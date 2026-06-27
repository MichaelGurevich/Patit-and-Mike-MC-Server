# PRD — Advanced Settings tab + in-game player notifications

## Problem statement

When Mike or Patit hosts the shared Minecraft world, the dashboard's main page is cluttered with controls that aren't needed moment-to-moment — like how much memory the server gets — while the settings they'd actually want to tweak (player limits, view distance, PvP, mob behavior, weather, time) either aren't there or are buried in a hidden drawer. On top of that, when the host changes something or shuts the server down, the people currently playing get no warning — the world just changes under them or disconnects. They want a single, tidy place for the deeper server and gameplay knobs, and they want their friends in-game to be told what's happening.

## Solution

Add a fourth "Advanced" tab to the dashboard that becomes the home for set-and-forget controls (RAM allocation), a richer set of server and gameplay settings (player count, view/simulation distance, PvP, spawn protection, MOTD, flight, default join gamemode, whitelist on/off, plus several new game rules), and a "Live world" section for setting time and weather. The main page keeps only the active hosting controls (Start/Stop, Difficulty, Connect info). Whenever the host takes a notable action — server comes up, difficulty changes, whitelist flips, rules get updated, or the server is stopping — players are notified in-game with a plain chat message, gated by a master "Notify players in-game" toggle. Stopping the server now runs a real, enforced 10-second countdown so players get a heads-up before the save-and-shutdown, with a free-text Broadcast box for anything else the host wants to announce.

## User stories

1. As a host, I want a dedicated "Advanced" tab, so that the main page only shows the controls I need while actively hosting and playing.
2. As a host, I want RAM allocation moved into Advanced, so that this set-and-forget setting doesn't clutter the sidebar.
3. As a host, I want Difficulty and the Connect/port info to stay on the sidebar, so that the controls I touch frequently while playing remain one click away.
4. As a host, I want time and weather controls surfaced as a "Live world" section in Advanced, so that I no longer have to dig through a hidden Cheats drawer.
5. As a host, I want to adjust server settings (max players, view distance, simulation distance, PvP, spawn protection, MOTD, allow-flight, default join gamemode), so that I can tune the server without editing files by hand.
6. As a host, I want to add new gameplay rules (randomTickSpeed, doMobLoot, doTileDrops, playersSleepingPercentage, spawnRadius), so that I have finer control over how the world behaves.
7. As a host, I want a whitelist ON/OFF toggle, so that I can lock the server to known players without managing a name list in the UI.
8. As a host, I want settings that can't change live to be clearly badged "applies on next restart," so that I'm never confused about why a change didn't take effect.
9. As a host, I want numeric fields clamped to safe bounds, so that I can't accidentally write a value that prevents the server from booting and strands the other host.
10. As a host, I want a master "Notify players in-game" toggle (default on), so that I control whether my actions broadcast chat messages at all.
11. As a host, I want automatic in-game messages when the server is ready, difficulty changes, the whitelist flips, or rules are updated, so that players know what just happened without me typing anything.
12. As a host, I want a free-text Broadcast box, so that I can send players an arbitrary announcement.
13. As a player, I want a 10-second countdown warning before the server saves and shuts down, so that I can get to safety and not lose progress.
14. As a host, I want the Stop button to show "Stopping in 10s… (Cancel)," so that I can recover from a misclick before the server actually goes down.
15. As a host, I want the countdown skipped when nobody is online, so that I don't wait pointlessly when I'm the only one (or no one) is connected.
16. As a host, I want the Broadcast box and live commands disabled when the server is stopped, so that I'm not trying to message players who aren't there.
17. As a host, I want all my Advanced settings persisted even when the server is stopped, so that they're ready to apply the next time I start.
18. As a host, I want changes I make to follow the same sync rules as Difficulty and Game Rules, so that the Advanced tab behaves consistently with the rest of the dashboard and never breaks the one-host-at-a-time guarantee.
19. As a host changing the default gamemode, I want the UI to tell me it only affects new joins, so that I don't think the feature is broken when current players don't change.
20. As a host who needs to add a third person to the whitelist, I want a console escape hatch (`/whitelist add`), so that the missing name-management UI doesn't block me.

## Implementation decisions

- **Notifications use `say`, not `tellraw`.** Plain `say` broadcasts are enough; `tellraw`'s JSON formatting is overkill for two-friend chat pings. Rejected: `tellraw` as the mechanism.
- **Both automatic presets and a free-text Broadcast box.** Auto per-action preset messages are the core feature; a secondary Broadcast box prefixes free text with `say `. Rejected: presets-only and free-text-only as either-or options.
- **A single master "Notify players in-game" toggle gates auto messages**, stored as one boolean in `settings.json`, default on. Rejected: editable/templated notification text in v1 — fixed text keeps it to one checkbox.
- **Preset notification text is fixed in v1.** No per-message editing. Rejected: configurable/templated message text (scope creep for v1).
- **Complete v1 auto-notify trigger set:** Server ready (`say Server is up — join in!`), Stop & Save (countdown), Difficulty change (`say Difficulty set to <X>`), Whitelist toggle (`say Whitelist enabled/disabled`), and ONE consolidated "rules updated" ping from the Game Rules tab. Explicitly NOT on: RAM, individual gamerule toggles, view/simulation distance, MOTD. Rejected: per-gamerule-toggle notifications (would spam ~10 messages — consolidate to one).
- **New fourth "Advanced" tab**, not a collapsible section or modal. The sidebar is already busy. Rejected: collapsible section / modal placement.
- **RAM and the Cheats drawer (time/weather) move into Advanced; Difficulty and the Connect port stay on the sidebar.** RAM is set-and-forget; the cheats drawer becomes a visible "Live world" section. Difficulty is a live, frequent play control; the read-only port belongs grouped with Connect info. Rejected: consolidating Difficulty into Advanced; moving the read-only port out of Connect.
- **Final Server settings (written to `server.properties` via existing `setProperty`):** max-players, view-distance, simulation-distance, pvp, spawn-protection, motd, allow-flight, gamemode (default join), whitelist on/off. **New gamerules added to existing 10** (in `gamerules.json`): randomTickSpeed, doMobLoot, doTileDrops, playersSleepingPercentage, spawnRadius. **Live world:** set time, set weather.
- **Whitelist toggle only — no name-management UI.** Toggle runs `whitelist on/off` and persists `white-list`/`enforce-whitelist`. Adding a name is punted to console `/whitelist add`. Rejected: full whitelist name-management UI (rabbit hole).
- **Cut settings:** hardcore, online-mode, enable-command-block, resource-pack, RCON/query/management-server. Rejected as dangerous or irrelevant at two-friend scale.
- **Apply semantics: persist everything immediately; live-apply where a command exists; badge the rest "applies on next restart."** `defaultgamemode` applies live but affects NEW joins only (must be stated in UI copy). pvp, view-distance, simulation-distance, max-players, spawn-protection, motd, allow-flight are restart-only. Rejected: excluding restart-only fields from the UI — editing them is the point, so badge them instead.
- **Restart badge via snapshot-at-start diff.** The "applies on next restart" badge activates the moment a restart-only value differs from what the running process loaded at start; it clears on the next start. Live fields never badge.
- **Clamp numeric values on blur, silently, to the nearest bound — never write a raw value.** A malformed `server.properties` value can prevent boot and strand the other host. Bounds: max-players 1–20 (won't raise above 20), view-distance 3–32, simulation-distance 3–32, spawn-protection 0–64, randomTickSpeed 0–256, playersSleepingPercentage 0–100, spawnRadius 0–128. Rejected: writing raw numeric values; raising max-players above 20 (pointless at this scale).
- **Stop & Save runs a real, enforced 10-second countdown** — announce `say Server saving and shutting down in 10s…`, wait, then save + stop + backup + push. Auto-skip when 0 players. The Stop button shows "Stopping in 10s… (Cancel)" for misclick recovery. **10s is a fixed constant, not configurable.** All other actions are fire-and-forget. Rejected: countdown on non-Stop actions; configurable countdown length (nobody tunes it).
- **Concurrency uses the same model as existing Difficulty/Game Rules:** persist locally, sync on next push, only meaningful for the lock holder. NO new hard lock guard; at most an optional soft, non-blocking "you're not the current host" hint. Rejected: a hard "you don't hold the lock" edit guard (not dangerous, and inconsistent with existing behavior).
- **No new data store.** Gamerules → `gamerules.json`; server settings → existing `setProperty` on `server.properties`; notify toggle → `settings.json`.
- **ServerController gains a `say`/broadcast helper and Stop-countdown sequencing** — it currently exposes only `send(rawCmd)` with no native say/tellraw helper.

## Testing decisions

- **Test external behaviour through small pure helpers, not Electron/IPC glue.** Extract four pure, side-effect-free helpers and keep `ServerController`/IPC/Electron wiring thin around them:
  - `clamp(value, min, max)` — bound enforcement.
  - `buildNotifyMessage(action, detail)` — exact `say` string per trigger.
  - `shouldCountdown(playerCount)` — returns false at 0 players.
  - `diffFromLoadedSnapshot(current, loaded)` — drives the restart badge.
- **These four helpers are the modules that should have tests written** (once a runner exists); they encode the load-bearing logic and are written to be testable in isolation.
- **A manual verification checklist is the v1 bar**, run once against a real server:
  - Clamp each numeric field (out-of-range values snap to nearest bound; max-players won't exceed 20).
  - Restart badge activates when a restart-only field differs from the loaded snapshot and clears on next start.
  - Countdown fires and is cancellable with players online; auto-skips at 0 players.
  - Each trigger (ready, difficulty, whitelist, consolidated rules-updated) emits exactly one `say`.
  - Master notify toggle off = complete silence.
  - Broadcast box / send disabled when the server is stopped.
  - Settings persistence round-trips (edit while stopped, restart, value applied).
  - `npm run typecheck` (typecheck:node + typecheck:web) is green.
- **Do NOT add a test runner (e.g. Vitest) as part of this feature.** It's a separate decision with its own CI surface and would scope-creep; the helpers are written testable so adding a runner later is a clean follow-up.

## Open questions and risks

- **Editable port**: whether the read-only port should become editable in Advanced. Left read-only on the Connect card for now; revisit if/when editing port is exposed (it's its own conversation).
- **Whitelist third-person UX**: adding a third player relies on console `/whitelist add` since there's no name UI. Revisit if this proves too clunky in practice.
- **defaultgamemode UI copy**: the "new joins only" behavior must be communicated in UI copy or it will look broken. Unresolved until UI copy is written during build.
- **Consolidated "rules updated" ping default**: whether the Game Rules tab's single consolidated message is on-by-default or opt-in. Minor; revisit during build.
- **Soft "not current host" hint**: whether a non-blocking "you're not the current host" hint is worth adding to the Advanced tab. Optional; revisit during build.
- **Test runner**: whether to add Vitest to the dashboard. Deferred as a separate follow-up, explicitly not part of this feature.

## Out of scope

- `tellraw`/JSON-formatted notifications (using plain `say` only).
- Editable or templated notification text in v1 (fixed presets, single boolean toggle).
- Whitelist name-management UI (add/remove player names) — console `/whitelist add` only.
- Server settings deliberately cut: hardcore, online-mode, enable-command-block, resource-pack, RCON/query/management-server.
- Making the port editable (stays read-only on the Connect card).
- Configurable countdown length and countdowns on any action other than Stop & Save (10s fixed constant, Stop only).
- A hard lock/concurrency guard on Advanced edits (same persist-and-sync model as Difficulty/Game Rules).
- Adding a test runner / automated test suite as part of this feature.
- Per-action auto-notifications beyond the defined trigger set (no RAM, individual gamerule, distance, or MOTD pings).

## Further notes

- This feature must respect the project's "three implementations in sync" rule only where it touches lock/pull/backup/push behavior — but note that Advanced settings, notifications, and the Stop countdown are **dashboard-only** UX and do not exist in the `play-*` scripts. The shared baton-lock workflow itself is unchanged; the Stop countdown wraps the existing save+stop+backup+push sequence rather than altering it.
- Prior art to mirror for the data/apply model: the existing Difficulty (persist to `server.properties` + live `difficulty` command) and Game Rules (persist to `gamerules.json` + live `gamerule` command) flows already implement "persist locally, apply live, sync on next push." The Advanced tab should reuse these patterns rather than inventing new ones.
- `logwatch.ts` already parses a `list`/player-count event — `shouldCountdown(playerCount)` should source its count from that existing roster/`Online Now` data rather than issuing a fresh query.
- Suggested follow-up spike: add Vitest with the four extracted helpers as the seed test suite, since they're being written pure specifically to enable this.
- UI-copy spike worth scheduling alongside build: the `defaultgamemode` "new joins only" caption and the exact fixed wording of each preset `say` message (`buildNotifyMessage` output) — these are user-visible strings that should be reviewed together.
