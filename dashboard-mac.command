#!/usr/bin/env bash
# Launch the MC Server Dashboard (installs + builds the first time).
cd "$(dirname "${BASH_SOURCE[0]}")/dashboard" || exit 1
if [ ! -d node_modules ]; then
  echo "Installing dependencies for the first time, please wait..."
  npm install
fi
npm run build
npx electron .
