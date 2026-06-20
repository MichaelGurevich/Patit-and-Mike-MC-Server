#!/usr/bin/env bash
# One-time setup: installs Java/Tailscale if needed and downloads the server.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/scripts/mac-setup.sh"
echo ""
echo "Press Return to close..."
read -r _
