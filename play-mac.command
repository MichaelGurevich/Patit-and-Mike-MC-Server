#!/usr/bin/env bash
# Play TOGETHER (same Wi-Fi / network). Pulls the latest world, then hosts.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/scripts/mac-play.sh" local
echo ""
echo "Press Return to close..."
read -r _
