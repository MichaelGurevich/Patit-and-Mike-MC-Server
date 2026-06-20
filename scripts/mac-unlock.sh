#!/usr/bin/env bash
# Emergency: force the server lock back to FREE (use only if the other person
# crashed without releasing it, and you've confirmed nobody is actually playing).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/config.sh"
source "$SCRIPT_DIR/mac-lib.sh"

echo ""
echo "Forcing the server lock to FREE..."
if have_upstream; then git -C "$REPO_ROOT" pull --rebase --autostash origin "$GIT_BRANCH"; fi
lock_write free "force-unlocked by $(whoami_tag)"
git -C "$REPO_ROOT" add "$(basename "$LOCK_FILE")"
git -C "$REPO_ROOT" commit -m "lock: force-unlocked by $(whoami_tag)" >/dev/null 2>&1 || true
if have_upstream; then git -C "$REPO_ROOT" push origin "$GIT_BRANCH"; fi
echo "Lock cleared. You can play now."
echo ""
