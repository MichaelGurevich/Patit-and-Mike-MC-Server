# ===========================================================================
#  Shared helper functions for the Mac scripts.
#  Sourced by mac-play.sh / mac-setup.sh / mac-unlock.sh.
#  REPO_ROOT must be set, and config.sh sourced, BEFORE this file.
# ===========================================================================

SERVER_DIR="$REPO_ROOT/server"
BACKUP_DIR="$REPO_ROOT/backups"
LOCK_FILE="$REPO_ROOT/SESSION-LOCK.txt"
MANIFEST_URL="https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"

# --- Git helpers -----------------------------------------------------------
have_upstream() { git -C "$REPO_ROOT" ls-remote --exit-code --heads origin "$GIT_BRANCH" >/dev/null 2>&1; }

whoami_tag() {
  local n
  n="$(git -C "$REPO_ROOT" config user.name 2>/dev/null)"
  [ -z "$n" ] && n="$(whoami)"
  printf '%s' "$n" | tr -d '\r\n'
}

# --- Lock file (simple key=value) ------------------------------------------
lock_get() { # $1 = key
  [ -f "$LOCK_FILE" ] || { printf ''; return; }
  grep -E "^$1=" "$LOCK_FILE" | head -1 | cut -d= -f2-
}

lock_write() { # $1 = status, $2 = note
  cat > "$LOCK_FILE" <<EOF
status=$1
holder=$(whoami_tag)
machine=$(hostname)
since=$(date '+%Y-%m-%d %H:%M:%S')
note=$2
EOF
}

# --- Sync ------------------------------------------------------------------
ensure_clean_or_recover() {
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    echo "Found unsaved local changes (recovering from a previous session)..."
    git -C "$REPO_ROOT" add -A
    git -C "$REPO_ROOT" commit -m "auto-save: recovered local changes ($(whoami_tag))" >/dev/null 2>&1 || true
  fi
}

sync_pull() {
  if have_upstream; then
    echo "Pulling the latest world from GitHub..."
    if ! git -C "$REPO_ROOT" pull --rebase --autostash origin "$GIT_BRANCH"; then
      echo "ERROR: Could not pull the latest world (possible sync conflict). See README -> Troubleshooting." >&2
      exit 1
    fi
  else
    echo "No world on GitHub yet (first run) - skipping pull."
  fi
}

# --- The 'baton' lock: only one person hosts at a time ---------------------
acquire_session() { # $1 = "force" to override a stuck lock
  local force="${1:-}"
  ensure_clean_or_recover
  sync_pull
  local st ho me
  st="$(lock_get status)"; ho="$(lock_get holder)"; me="$(whoami_tag)"
  if [ "$st" = "active" ] && [ "$ho" != "$me" ] && [ "$force" != "force" ]; then
    echo ""
    echo "================ SERVER IS LOCKED ================"
    echo " $ho (on $(lock_get machine)) started a session"
    echo " at $(lock_get since) and hasn't released it yet."
    echo ""
    echo " Only ONE person can host at a time (the world can't be"
    echo " safely merged). Ask them to fully STOP their server so it"
    echo " saves and uploads."
    echo ""
    echo " If they crashed and can't release it, double-click"
    echo " unlock-mac.command, then try again."
    echo "================================================="
    echo ""
    exit 1
  fi
  lock_write active playing
  git -C "$REPO_ROOT" add "$(basename "$LOCK_FILE")"
  git -C "$REPO_ROOT" commit -m "lock: $me started a session" >/dev/null 2>&1 || true
  if have_upstream; then
    if ! git -C "$REPO_ROOT" push origin "$GIT_BRANCH"; then
      echo "Couldn't claim the lock - someone may have just started a session. Try again in a moment." >&2
      exit 1
    fi
  fi
  echo "Lock acquired - you're clear to play."
}

release_session() {
  [ "${RELEASED:-0}" = "1" ] && return
  RELEASED=1
  echo ""
  echo "Saving the world and uploading to GitHub..."
  new_backup
  git -C "$REPO_ROOT" add -A
  git -C "$REPO_ROOT" commit -m "World save: $(whoami_tag) $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1 || true
  lock_write free released
  git -C "$REPO_ROOT" add "$(basename "$LOCK_FILE")"
  git -C "$REPO_ROOT" commit -m "lock: released by $(whoami_tag)" >/dev/null 2>&1 || true
  if have_upstream; then
    git -C "$REPO_ROOT" pull --rebase --autostash origin "$GIT_BRANCH" >/dev/null 2>&1 || true
    if git -C "$REPO_ROOT" push origin "$GIT_BRANCH"; then
      echo "Done - world uploaded. Safe to close this window."
    else
      echo "WARNING: upload (push) failed. World is saved & committed locally;" >&2
      echo "reconnect to the internet and run the script again, or 'git push' manually." >&2
    fi
  else
    git -C "$REPO_ROOT" push -u origin "$GIT_BRANCH" && echo "Done - world uploaded."
  fi
}

# --- Backups (one capped .zip snapshot per day) ----------------------------
new_backup() {
  mkdir -p "$BACKUP_DIR"
  [ -d "$SERVER_DIR/world" ] || return 0
  local name="world-$(date +%Y%m%d).zip"
  echo "Creating backup $name ..."
  ( cd "$SERVER_DIR" && rm -f "$BACKUP_DIR/$name" && zip -r -q "$BACKUP_DIR/$name" world )
  local count
  count="$(ls -1t "$BACKUP_DIR"/world-*.zip 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$count" -gt "$BACKUP_KEEP" ]; then
    ls -1t "$BACKUP_DIR"/world-*.zip | tail -n +$((BACKUP_KEEP + 1)) | xargs rm -f
  fi
}

# --- Connectivity ----------------------------------------------------------
get_lan_ip() {
  local ip
  ip="$(ipconfig getifaddr en0 2>/dev/null)"
  [ -z "$ip" ] && ip="$(ipconfig getifaddr en1 2>/dev/null)"
  [ -z "$ip" ] && ip="127.0.0.1"
  printf '%s' "$ip"
}

ts_bin() {
  if command -v tailscale >/dev/null 2>&1; then command -v tailscale; return; fi
  local app="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
  [ -x "$app" ] && { printf '%s' "$app"; return; }
  printf ''
}

ts_ip() {
  local b; b="$(ts_bin)"; [ -z "$b" ] && return
  "$b" ip -4 2>/dev/null | head -1
}

ensure_tailscale() { # prints the Tailscale IP on stdout; messages go to stderr
  local b ip
  b="$(ts_bin)"
  if [ -z "$b" ]; then
    echo "Tailscale isn't installed. Run setup-mac.command, or get it from" >&2
    echo "https://tailscale.com/download/mac" >&2
    return
  fi
  ip="$(ts_ip)"
  if [ -z "$ip" ]; then
    echo "Starting Tailscale (a browser may open so you can log in)..." >&2
    "$b" up
    ip="$(ts_ip)"
  fi
  printf '%s' "$ip"
}

show_connect() { # $1 = local | online
  local mode="$1" lan tip
  lan="$(get_lan_ip)"
  echo ""
  echo "=================================================="
  if [ "$mode" = "online" ]; then
    tip="$(ensure_tailscale)"
    echo "  PLAY APART - over the internet via Tailscale"
    if [ -n "$tip" ]; then
      echo "  The other person types this as the Server Address:"
      echo "      $tip"
      echo "  (they must also have Tailscale running & logged into"
      echo "   the SAME Tailscale account/tailnet as you)"
    else
      echo "  Tailscale not ready - see the messages above."
    fi
  else
    echo "  PLAY TOGETHER - same Wi-Fi / network"
    echo "  The other person types this as the Server Address:"
    echo "      $lan"
  fi
  echo "  You, on THIS Mac, connect to:  localhost"
  echo "  (Port is 25565 - the default, no need to type it.)"
  echo "=================================================="
  echo ""
}

# --- Java (find a new-enough one even if an older java is first on PATH) ----
java_major() { # $1 = java binary
  "$1" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/'
}

find_java() { # prints path to a Java >= JAVA_MIN, or the best it can find
  if command -v java >/dev/null 2>&1; then
    if [ "$(java_major java 2>/dev/null || echo 0)" -ge "$JAVA_MIN" ] 2>/dev/null; then
      command -v java; return
    fi
  fi
  if [ -x /usr/libexec/java_home ]; then
    local home; home="$(/usr/libexec/java_home -v "$JAVA_MIN" 2>/dev/null)"
    [ -n "$home" ] && [ -x "$home/bin/java" ] && { printf '%s' "$home/bin/java"; return; }
  fi
  local c
  for c in /Library/Java/JavaVirtualMachines/*/Contents/Home/bin/java; do
    [ -x "$c" ] || continue
    if [ "$(java_major "$c" 2>/dev/null || echo 0)" -ge "$JAVA_MIN" ] 2>/dev/null; then
      printf '%s' "$c"; return
    fi
  done
  command -v java 2>/dev/null || true
}

start_server() {
  local java; java="$(find_java)"
  if [ -z "$java" ] || [ "$(java_major "$java" 2>/dev/null || echo 0)" -lt "$JAVA_MIN" ] 2>/dev/null; then
    echo "Java $JAVA_MIN or newer is required by the latest Minecraft. Run setup-mac.command to install it." >&2
    exit 1
  fi
  [ -f "$SERVER_DIR/server.jar" ] || { echo "server.jar is missing. Run setup-mac.command first." >&2; exit 1; }
  echo "Starting the Minecraft server (Java $(java_major "$java"))."
  echo "When you're done, type:  stop   (then Enter) in this window so it saves & uploads."
  ( cd "$SERVER_DIR" && "$java" -Xms"$JAVA_XMS" -Xmx"$JAVA_XMX" -jar server.jar nogui )
}
