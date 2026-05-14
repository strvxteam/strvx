#!/usr/bin/env bash
# install.sh — install com.strvx.gbrain-mcp.plist as a user-level launchd agent.
#
# Reads OPENAI_API_KEY from apps/internal/.env.local and bakes it into the
# installed plist. Idempotent: re-run after .env.local changes to rotate.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PLIST_SRC="$ROOT/scripts/launchd/com.strvx.gbrain-mcp.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.strvx.gbrain-mcp.plist"
ENV_FILE="$ROOT/apps/internal/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "install: missing $ENV_FILE" >&2; exit 1
fi
KEY=$(grep -E '^OPENAI_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)
if [ -z "$KEY" ]; then
  echo "install: OPENAI_API_KEY not in $ENV_FILE" >&2; exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
# Bake the key in. sed-on-stdin avoids leaking it to /tmp.
sed "s|REPLACE_WITH_KEY_FROM_ENV_LOCAL|$KEY|" "$PLIST_SRC" > "$PLIST_DST"
chmod 600 "$PLIST_DST"

# Tear down + reload so a stale process from a previous install gets replaced.
launchctl bootout "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl kickstart -k "gui/$(id -u)/com.strvx.gbrain-mcp"

sleep 3
if lsof -ti :3131 >/dev/null 2>&1; then
  echo "ok — gbrain MCP listening on :3131 (pid $(lsof -ti :3131 | head -1))"
  echo "logs: /tmp/strvx-gbrain.{out,err}.log"
else
  echo "warn — :3131 not bound yet; check /tmp/strvx-gbrain.err.log"
  exit 1
fi
