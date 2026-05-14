# strvx monorepo

Internal toolchain + KG for strvx. The `kg-into-sit` branch replatforms the
knowledge graph on top of [Garry Tan's gbrain](https://github.com/garrytan/gbrain).

## Quick map

```
apps/
├── internal/           ← SIT (Next.js) — the team's web UI
├── brain-sync/         ← Postgres → markdown adapter (NEW)
├── kg-ingestor/        ← legacy homegrown CDC ingester (retained as rollback)
├── gbrain-ingestor/    ← legacy homegrown vault ingester (retained as rollback)
└── landing/

packages/
├── db/                 ← Drizzle schemas + Supabase client
├── kg/                 ← legacy @strvx/kg SDK (retained as rollback)
└── ui/

brain/                  ← markdown source of truth (NEW)
├── RESOLVER.md           ← decision tree for filing
├── schema.md             ← page conventions
├── people/, companies/, deals/, projects/, meetings/, finances/, inbox/
├── .gbrain/              ← PGLite index (gitignored, rebuildable)
└── .sources/transcripts/ ← booking notes + email bodies for dream cycle

scripts/
├── refresh-brain.sh    ← render Supabase → brain/ → gbrain import
├── smoke-test.sh       ← 13-check end-to-end smoke
└── launchd/            ← com.strvx.gbrain-mcp.plist + install.sh

.vendor/gbrain/         ← upstream gbrain clone (gitignored)
.snapshots/             ← Pre-replatform Neo4j + pgvector dump
HANDOFF-GBRAIN.md       ← session-by-session status doc
```

## Running locally

```bash
# 0. One-time setup
pnpm install
curl -fsSL https://bun.sh/install | bash    # gbrain runs on bun, not node
cd .vendor/gbrain && bun install && bun link && cd ../..

# 1. Refresh the brain from Supabase
./scripts/refresh-brain.sh --force --embed

# 2. Start gbrain HTTP MCP (or use scripts/launchd/install.sh for launchd)
GBRAIN_HOME=$(pwd)/brain nohup gbrain serve --http --port 3131 \
  > /tmp/gbrain-mcp.log 2>&1 < /dev/null &

# 3. Start SIT
cd apps/internal && PORT=3010 pnpm dev

# 4. Smoke test
./scripts/smoke-test.sh
```

## Pages

- http://localhost:3010/kg — overview
- http://localhost:3010/kg/graph — force-directed viz
- http://localhost:3010/kg/browse?label=Person — directory listing
- http://localhost:3010/kg/entity/people%2Fjane-doe — single entity
- http://localhost:3010/api/kg/health — observability JSON
- http://localhost:3010/api/mcp — JSON-RPC MCP for the internal agent

## Important gotchas

- **DATABASE_URL leakage breaks gbrain.** `.env.local` carries the Supabase URL
  for brain-sync. If you `source` it into a shell and then run `gbrain`, gbrain
  tries to connect to the remote Postgres and fails with `relation 'pages'
  does not exist`. The refresh + smoke scripts read the URL into one local var,
  never export it globally. Replicate that pattern when adding new tooling.
- **Re-import doesn't purge stale slugs.** After a structural slug change, wipe
  `brain/.gbrain/brain.pglite` and re-init + re-import + re-embed. Otherwise
  gbrain MCP returns slugs that no longer exist on disk.
- **The homegrown stack is retained for rollback.** `packages/kg`,
  `apps/gbrain-ingestor`, `apps/kg-ingestor`, the `kgx-neo4j` + `kgx-pg` Docker
  containers, and the `kg_cdc_publication` on Supabase are all preserved.
  See `HANDOFF-GBRAIN.md`.

## Test + typecheck

```bash
pnpm --filter tacoma typecheck       # SIT
pnpm --filter @strvx/brain-sync test # brain-sync unit tests
./scripts/smoke-test.sh              # full stack
```

## Background

GBrain is an open-source personal knowledge graph by Garry Tan
(github.com/garrytan/gbrain). It stores knowledge as markdown files,
extracts entities + typed wikilinks with zero LLM calls, and exposes hybrid
search via OAuth-protected MCP. We use it as the substrate; `apps/brain-sync`
emits markdown from our Supabase CRM, `apps/internal` reads via filesystem +
gbrain MCP.
