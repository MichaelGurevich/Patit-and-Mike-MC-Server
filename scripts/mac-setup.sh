#!/usr/bin/env bash
# One-time setup for Mac: install Java/Tailscale if needed, download the server.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/config.sh"
source "$SCRIPT_DIR/mac-lib.sh"

echo ""
echo "=== Setup: Patit & Mike's Minecraft Server (Mac) ==="
echo ""

mkdir -p "$SERVER_DIR"

# --- Java (need >= JAVA_MIN, currently 25 for the latest Minecraft) ---------
JAVA_BIN="$(find_java)"
if [ -z "$JAVA_BIN" ] || [ "$(java_major "$JAVA_BIN" 2>/dev/null || echo 0)" -lt "$JAVA_MIN" ] 2>/dev/null; then
  echo "Java $JAVA_MIN is required and wasn't found."
  if command -v brew >/dev/null 2>&1; then
    echo "Installing Temurin $JAVA_MIN via Homebrew..."
    brew install --cask "temurin@$JAVA_MIN" || brew install --cask temurin
  else
    echo "Please install Java $JAVA_MIN from https://adoptium.net then run setup again."
    echo "(Or install Homebrew first: https://brew.sh)"
    exit 1
  fi
else
  echo "Java $(java_major "$JAVA_BIN") found - good."
fi

# --- Pull any version another machine already pinned -----------------------
if have_upstream; then
  git -C "$REPO_ROOT" pull --rebase --autostash origin "$GIT_BRANCH" >/dev/null 2>&1 || true
fi

resolve_version() {
  local verfile="$SERVER_DIR/version.txt" v
  if [ -n "$MC_VERSION_OVERRIDE" ]; then printf '%s' "$MC_VERSION_OVERRIDE"; return; fi
  if [ -f "$verfile" ]; then tr -d ' \t\r\n' < "$verfile"; return; fi
  echo "Looking up the latest Minecraft version..." >&2
  v="$(curl -s "$MANIFEST_URL" | grep -o '"latest"[^}]*}' \
        | grep -o '"release"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed -E 's/.*"([^"]+)"$/\1/')"
  [ -z "$v" ] && { echo "Could not resolve the latest version." >&2; exit 1; }
  printf '%s' "$v" > "$verfile"
  printf '%s' "$v"
}

download_server() {
  local v="$1" entry entryurl serverurl jar="$SERVER_DIR/server.jar"
  entry="$(curl -s "$MANIFEST_URL" | grep -o "{[^{}]*\"id\":[[:space:]]*\"$v\"[^{}]*}")"
  entryurl="$(printf '%s' "$entry" | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
              | sed -E 's/.*"(https[^"]+)".*/\1/')"
  [ -z "$entryurl" ] && { echo "Version $v not found in Mojang's manifest." >&2; exit 1; }
  serverurl="$(curl -s "$entryurl" | grep -o '"server"[[:space:]]*:[[:space:]]*{[^}]*}' \
               | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
               | sed -E 's/.*"(https[^"]+)".*/\1/')"
  [ -z "$serverurl" ] && { echo "No server jar available for $v." >&2; exit 1; }
  echo "Downloading Minecraft $v server.jar ..." >&2
  curl -L -o "$jar" "$serverurl"
}

setup_tailscale() {
  if [ -n "$(ts_bin)" ]; then echo "Tailscale is already installed."; return; fi
  echo "Installing Tailscale (used only for playing apart)..."
  if command -v brew >/dev/null 2>&1; then
    brew install --cask tailscale || echo "Please install Tailscale from https://tailscale.com/download/mac"
  else
    echo "Please install Tailscale from the Mac App Store or https://tailscale.com/download/mac"
  fi
}

V="$(resolve_version)"
download_server "$V"
setup_tailscale

# Share the pinned version so the other machine uses the exact same one.
git -C "$REPO_ROOT" add "server/version.txt" 2>/dev/null || true
git -C "$REPO_ROOT" commit -m "Pin Minecraft version $V" >/dev/null 2>&1 || true
if have_upstream; then git -C "$REPO_ROOT" push origin "$GIT_BRANCH" >/dev/null 2>&1 || true; fi

echo ""
echo "Setup complete! Minecraft $V is ready."
echo "  Play together (same Wi-Fi): double-click play-mac.command"
echo "  Play apart (internet):      double-click play-online-mac.command"
echo ""
