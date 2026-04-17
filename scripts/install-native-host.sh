#!/usr/bin/env bash
# Install (or update) the Word Looker native messaging host for Chrome on macOS.
# Usage: ./scripts/install-native-host.sh <extension-id>
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <extension-id>" >&2
  echo "    extension id is visible on chrome://extensions (after Load unpacked)" >&2
  exit 2
fi

EXT_ID="$1"
HOST_NAME="com.wordlooker.host"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER="$SCRIPT_DIR/native-host-wrapper.sh"
NODE_HOST="$SCRIPT_DIR/native-host.mjs"

case "$(uname -s)" in
  Darwin)
    TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  Linux)
    TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    ;;
  *)
    echo "unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

mkdir -p "$TARGET_DIR"
chmod +x "$WRAPPER" "$NODE_HOST"

MANIFEST="$TARGET_DIR/$HOST_NAME.json"
cat > "$MANIFEST" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Word Looker self-update helper",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "installed native host manifest:"
echo "  $MANIFEST"
echo "  -> $WRAPPER"
echo
echo "you can now use the 'Install update' button in the extension popup."
