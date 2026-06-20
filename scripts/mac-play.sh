#!/usr/bin/env bash
# Pull the latest world, claim the lock, play, then save + upload on exit.
# Usage: mac-play.sh [local|online] [force]

MODE="${1:-local}"
FORCE="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/config.sh"
source "$SCRIPT_DIR/mac-lib.sh"

RELEASED=0

echo ""
echo "########################################################"
echo "#   Patit & Mike's Minecraft Server  -  ${MODE} mode"
echo "########################################################"
echo ""

acquire_session "$FORCE"
trap release_session EXIT INT TERM
show_connect "$MODE"
start_server
