#!/usr/bin/env bash
# Play APART (over the internet via Tailscale). Pulls the latest world, then hosts.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/scripts/mac-play.sh" online
echo ""
echo "Press Return to close..."
read -r _
