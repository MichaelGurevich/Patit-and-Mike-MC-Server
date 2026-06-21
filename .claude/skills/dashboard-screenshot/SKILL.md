---
name: dashboard-screenshot
description: Render and screenshot the MC Server Dashboard UI in BOTH light and dark mode and show the images inline. Use whenever the user asks for a screenshot, preview, mockup, or "what does it look like" of the dashboard — for any view, tab, or state they name (Console, Players, Game rules, first-run, a specific server state, etc.). Always produces both themes of exactly the view(s) requested.
---

# Dashboard screenshot

Produce faithful screenshots of the dashboard UI **without launching Electron** (the real app needs its IPC backend — git repo, running server, Tailscale — which isn't available in a cloud/remote box). Instead, render the **real `styles.css`** against static markup that mirrors the current `App.tsx`, fill it with realistic mock data, and screenshot it headless in **both light and dark** at the app's real window size.

## Hard rules (what the user wants every time)

1. **Always both themes** — light AND dark, every time, no exceptions.
2. **Render exactly the view(s) the user requested.** If they say "the Players tab," show the Players tab. If they name several, do each. If they don't name one, default to the **Console** tab (the primary view) in the **running** state.
3. **End result = the exact pages requested**, shown inline as images, then temp files cleaned up.

## Process

### 1. Read the current source (so the preview stays in sync)
Read these every run — never rely on memory of past markup, the design changes:
- `dashboard/src/renderer/src/App.tsx` — source of truth for structure/classNames of the requested view.
- `dashboard/src/renderer/src/styles.css` — the real stylesheet the preview links to.

Also note the window size from `dashboard/src/main/index.ts` (`BrowserWindow` `width`/`height`, currently **1000×740**) and use it for `--window-size`.

### 2. Build the preview HTML
Write `dashboard/src/renderer/src/_preview.html` (same folder as `styles.css` so the relative `<link>` resolves). Mirror the JSX of the requested view into plain HTML using the **same class names**, and fill with realistic mock data, e.g.:
- Running server, uptime chip `⏱ 1h 24m`, perf chip `18.7 ms · 20 TPS`.
- 2 players online (e.g. `Patit`, `Mike`); a known roster of ~4 for the Players tab.
- A sample console log with at least one `info`, one `warn` (`.line warn`), and one `error` (`.line error`) line. Escape `<` `>` as `&lt;` `&gt;`.
- Mock connect addresses (LAN `192.168.1.42`, Tailscale `100.84.12.7`, `localhost`).

Template (`<html lang="en" data-theme="light">`, `<link rel="stylesheet" href="styles.css" />`, then `<div class="app">…</div>` matching App.tsx for the requested view).

### 3. Screenshot both themes (headless Chrome)
Chrome lives at `C:\Program Files\Google\Chrome\Application\chrome.exe` (fallback Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`). Use `Start-Process … -Wait` — the proven flags are required (plain `chrome --screenshot` silently writes nothing):

```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$dir = "C:\Coding\Python\Patit-and-Mike-MC-Server\dashboard\src\renderer\src"
$url = "file:///" + ($dir -replace '\\','/') + "/_preview.html"
function Shot($out) {
  Start-Process -FilePath $chrome -ArgumentList @(
    "--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",
    "--force-device-scale-factor=1","--window-size=1000,740",
    "--virtual-time-budget=4000","--run-all-compositor-stages-before-draw",
    "--screenshot=$out", $url
  ) -NoNewWindow -Wait -PassThru | Out-Null
}
Shot "$dir\_preview_light.png"
```

Then flip the theme and shoot again: edit `_preview.html` `data-theme="light"` → `data-theme="dark"` (Edit tool) and run `Shot "$dir\_preview_dark.png"`. If the user asked for multiple views, repeat the build+shoot per view, naming files `_preview_<view>_<theme>.png`.

### 4. Show and clean up
- `Read` each PNG so it renders inline for the user (light first, then dark).
- Delete all temp files: `_preview.html` and every `_preview*.png`.

### 5. Caveat to state once
Briefly tell the user these are a **faithful design preview rendered from the real `styles.css`** at the app's real window size — only the data is mock; it's not the live Electron app (which needs its backend).

## Notes
- Keep temp filenames prefixed `_preview` so cleanup is a single glob and nothing is committed.
- The theme is driven by `data-theme` on `<html>` (light = iconic cream, dark = neon). Matches how `App.tsx` sets `document.documentElement.dataset.theme`.
