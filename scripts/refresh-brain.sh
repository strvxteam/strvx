#!/usr/bin/env bash
# refresh-brain.sh — Re-render brain/ from Supabase, then re-index into gbrain.
#
# Pulls credentials from apps/internal/.env.local. Run from anywhere in the
# repo; the script walks up to find the repo root via pnpm-workspace.yaml.
#
# Critical: DATABASE_URL is exposed to brain-sync ONLY. It's deliberately
# stripped before any gbrain call so gbrain doesn't try to reach the remote
# Postgres (it would fail DNS, then look like "relation 'pages' does not
# exist"). See HANDOFF-GBRAIN.md for the longer version.
#
# Usage:
#   scripts/refresh-brain.sh              # render + import (no embeddings)
#   scripts/refresh-brain.sh --embed      # render + import + embed (spends OpenAI tokens)
#   scripts/refresh-brain.sh --force      # wipe generated .md files first

set -euo pipefail

# Walk to repo root.
ROOT=$(pwd)
while [ "$ROOT" != "/" ] && [ ! -f "$ROOT/pnpm-workspace.yaml" ]; do
  ROOT=$(dirname "$ROOT")
done
if [ ! -f "$ROOT/pnpm-workspace.yaml" ]; then
  echo "refresh-brain: could not locate pnpm-workspace.yaml (run from inside the repo)" >&2
  exit 1
fi
cd "$ROOT"

ENV_FILE="$ROOT/apps/internal/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "refresh-brain: missing $ENV_FILE" >&2
  exit 1
fi

# Read keys explicitly — never `source` the file globally because that would
# export DATABASE_URL into the gbrain calls below.
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
OPENAI_API_KEY=$(grep -E '^OPENAI_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)
if [ -z "$DATABASE_URL" ]; then
  echo "refresh-brain: DATABASE_URL not in $ENV_FILE" >&2
  exit 1
fi

FORCE_FLAG=""
EMBED=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE_FLAG="--force" ;;
    --embed) EMBED=1 ;;
    *) echo "refresh-brain: unknown arg $arg" >&2; exit 1 ;;
  esac
done

echo "==> rendering brain/ from Supabase…"
DATABASE_URL="$DATABASE_URL" \
  pnpm --filter @strvx/brain-sync sync $FORCE_FLAG

echo "==> importing into gbrain (PGLite index)…"
# DATABASE_URL deliberately NOT exported here.
OPENAI_API_KEY="$OPENAI_API_KEY" \
  GBRAIN_HOME="$ROOT/brain" \
  gbrain import brain/ --no-embed

if [ "$EMBED" = "1" ]; then
  echo "==> generating embeddings (this spends OpenAI tokens)…"
  OPENAI_API_KEY="$OPENAI_API_KEY" \
    GBRAIN_HOME="$ROOT/brain" \
    gbrain embed --stale
fi

echo "==> done. brain/ + index refreshed."
