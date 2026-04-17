#!/usr/bin/env bash
# Wrapper so Chrome launches the Node native-host script with a fixed PATH
# that includes common Node install locations (Homebrew, nvm, etc).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  # Try common nvm layout as a fallback
  for dir in "$HOME"/.nvm/versions/node/*/bin; do
    if [ -x "$dir/node" ]; then
      export PATH="$dir:$PATH"
      break
    fi
  done
fi

exec node "$SCRIPT_DIR/native-host.mjs" "$@"
