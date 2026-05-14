#!/usr/bin/env bash
# install-refresh.sh — install com.strvx.refresh-brain.plist as a user-level
# launchd agent that re-renders the brain from Supabase every hour.
#
# Idempotent: re-run to update the plist after edits.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PLIST_SRC="$ROOT/scripts/launchd/com.strvx.refresh-brain.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.strvx.refresh-brain.plist"

if [ ! -f "$PLIST_SRC" ]; then
  echo "install-refresh: missing $PLIST_SRC" >&2; exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"
chmod 644 "$PLIST_DST"

# Tear down + reload so a stale process from a previous install gets replaced.
launchctl bootout "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

if launchctl print "gui/$(id -u)/com.strvx.refresh-brain" >/dev/null 2>&1; then
  echo "ok — com.strvx.refresh-brain registered (runs every 3600s)"
  echo "logs: /tmp/strvx-refresh-brain.{out,err}.log"
  echo "next-run-on-demand: launchctl kickstart -k gui/$(id -u)/com.strvx.refresh-brain"
else
  echo "warn — com.strvx.refresh-brain did not register" >&2
  exit 1
fi
