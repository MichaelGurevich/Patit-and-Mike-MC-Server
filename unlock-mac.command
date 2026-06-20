#!/usr/bin/env bash
# EMERGENCY ONLY: clears a stuck lock if the other person crashed without releasing.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/scripts/mac-unlock.sh"
echo ""
echo "Press Return to close..."
read -r _
