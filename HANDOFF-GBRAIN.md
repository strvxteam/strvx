# GBrain Replatform — Session Handoff

Branch: `kg-into-sit` in `~/strvx-kg-into-sit` worktree.
Status as of 2026-05-13 17:55 PT: **SIT runs end-to-end on top of upstream gbrain — including gbrain hybrid search via HTTP MCP.**

## What's working right now

```
Supabase CRM (onbocejypbakvnkslwju)
        │
        ▼
apps/brain-sync/ (Postgres → markdown adapter)
        │
        ▼
brain/ (markdown source of truth, MECE: people/companies/deals/projects/meetings/finances)
        │
        ├──> gbrain import (PGLite index at brain/.gbrain/)
        │
        └──> apps/internal/src/lib/kg/brain-reader.ts (fs-backed reader)
                │
                ▼
        SIT UI surfaces:
          /kg, /kg/graph, /kg/browse, /kg/entity/[id], /kg/notes
          /api/mcp (JSON-RPC for the internal agent)
          KgRelatedPanel embedded on /clients/[id], /contacts/[id]
```

**Page counts in brain/:** 19 people, 27 companies, 15 deals, 9 projects, 32 meetings, 6 finances.
**Indexed in gbrain PGLite:** 108 pages, 209 chunks (run `gbrain doctor` to verify).

## New in the second push (after the initial handoff)

- **scripts/refresh-brain.sh** — one-shot script: render brain/ from Supabase, re-import into gbrain. Optional `--embed` flag. Strips `DATABASE_URL` from gbrain's env automatically. Cron-ready.
- **Slug cleanup** — deal/project slugs no longer double up the company prefix. `deals/acme-acme-q4-platform` is now `deals/acme-q4-platform`.
- **gbrain HTTP MCP server running detached on :3131** — `nohup gbrain serve --http --port 3131`. Logs at `/tmp/gbrain-mcp.log`. PID in `lsof -ti :3131`.
- **Bearer token** for the SIT MCP client minted via `gbrain auth create sit-reader --takes-holders world`. Stored in `apps/internal/.env.local` as `GBRAIN_MCP_TOKEN` (and `GBRAIN_MCP_URL=http://localhost:3131/mcp`).
- **`apps/internal/src/lib/kg/gbrain-mcp.ts`** — thin SSE-aware client for gbrain's `/mcp` endpoint.
- **`searchBrain` now prefers gbrain hybrid (RRF) search**, falls back to substring scoring when gbrain is unreachable or returns nothing. Multi-word queries like "Q4 platform" now resolve correctly through SIT's /api/mcp.
- **gbrain CLI bug worked around:** `gbrain auth create <name>` fails with "Usage:" unless `--takes-holders` is also passed. The find() filter assumes the takes-holders value exists. Always pass `--takes-holders world` explicitly. Worth a PR upstream.

## How to refresh the brain from Supabase

```bash
# 1. Re-render markdown from production CRM (do NOT export DATABASE_URL globally
#    — gbrain treats it as a remote-postgres signal):
DATABASE_URL=$(grep '^DATABASE_URL=' apps/internal/.env.local | cut -d= -f2-) \
  pnpm --filter @strvx/brain-sync sync --force

# 2. Re-index into gbrain's PGLite (--no-embed if you don't want to spend on
#    OpenAI tokens; embeddings are needed for semantic search but not for SIT's
#    current fs-backed reader path):
OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' apps/internal/.env.local | cut -d= -f2-) \
  GBRAIN_HOME=$(pwd)/brain \
  gbrain import brain/ --no-embed
```

The SIT app reads brain/ directly via `brain-reader.ts`; it does NOT call
gbrain. The PGLite index exists for when we wire gbrain's native MCP / hybrid
search (next-session work).

## How to run SIT

```bash
cd apps/internal && PORT=3010 pnpm dev
# → http://localhost:3010/kg
```

The dev server is currently running detached as pid `lsof -ti :3010`. Logs at
`/tmp/sit-dev.log`.

## Critical gotcha — DATABASE_URL leakage

`apps/internal/.env.local` has a `DATABASE_URL` pointing at Supabase. If that
var is in gbrain's environment when you run `gbrain` commands, gbrain treats
it as a remote-postgres signal and tries to connect there instead of using
the local PGLite at `brain/.gbrain/brain.pglite/`. This produces
`getaddrinfo ENOTFOUND` errors and "relation 'pages' does not exist" warnings.

**Always run gbrain with DATABASE_URL stripped** — see the `gbrain import`
example above. The brain-sync app SHOULD have DATABASE_URL set (that's how it
reads from Supabase) but gbrain should not.

## What's installed and where

| Path | What it is |
|---|---|
| `.vendor/gbrain/` | Real upstream gbrain v0.33.1.1 (git clone) |
| `brain/` | The strvx brain — markdown source of truth |
| `brain/.gbrain/` | PGLite index, .gitignored, rebuildable from brain/ |
| `brain/RESOLVER.md` + `brain/schema.md` | Decision tree + page schema |
| `brain/*/[_README.md]` | Per-directory resolver READMEs (underscored so gbrain doesn't type-infer them as pages) |
| `apps/brain-sync/` | Postgres → markdown adapter (Node + postgres-js) |
| `apps/internal/src/lib/kg/brain-reader.ts` | SIT's fs-backed brain reader |
| `apps/internal/src/lib/kg/queries.ts` | Adapted to call brain-reader, same exported types |
| `apps/internal/src/lib/kg/mcp-tools.ts` | 4 tools (kg_search, kg_get_node, kg_get_entity_context, kg_list_by_type), now reading from brain |
| `apps/internal/src/lib/kg/client.ts` | Stubbed to a no-op `{actor}` shim |
| `.snapshots/pre-gbrain-20260513-165510/` | Pre-replatform Neo4j + pgvector dump (232 nodes, ~172 edges) |
| `.gitignore` | Now excludes `brain/.gbrain/`, `.snapshots/`, `.vendor/` |

## Still TODO (when you come back)

### Pending decisions (blockers — need your call)

1. **Retire the homegrown stack** (Task #35 in the task list).
   - Delete `apps/gbrain-ingestor`, `apps/kg-ingestor`, `packages/kg`.
   - Tear down `kgx-neo4j` + `kgx-pg` containers.
   - Drop `kg_cdc_publication` and Neo4j-specific env vars from `.env.local`.
   - This is destructive — explicit go-ahead needed.

### Mechanical follow-ups (can be done without decisions)

1. **Refresh cadence** (Task #32). Today the brain is rebuilt by running
   `pnpm --filter @strvx/brain-sync sync` manually. Options:
   - A cron job inside the repo that runs hourly.
   - A Supabase database webhook that POSTs to a SIT endpoint, triggering an
     incremental refresh of the touched row.
   - Pg LISTEN/NOTIFY consumed by a long-running worker.
2. **Wire gbrain's HTTP MCP server.** Today SIT reads brain/ directly via
   `brain-reader.ts`. The user's internal agent will eventually want
   semantic + hybrid search, which lives in gbrain's PGLite index. Plan:
   `gbrain serve --http` on a known port, OAuth-register a SIT client, and
   point the agent at `http://localhost:<port>/mcp`. SIT itself can also
   migrate `brain-reader.ts` calls to MCP for semantic search, but the
   fs path stays fine for directory listings.
3. **"Dream cycle"** (Task #36). GBrain ships a nightly enrichment cron
   that scans conversations / emails / transcripts and updates entity
   pages. For strvx, point it at the email_threads + meeting notes data
   so the deal/contact pages stay current. Specifics in
   `.vendor/gbrain/skills/_brain-filing-rules.md` and `gbrain dream`.

### Quality-of-life cleanups (low-priority)

- Some deal slugs are ugly: `deals/acme-111111-acme-q4-platform` (duplicates
  "acme" because the company slug already had it as a disambiguator). Cleaner
  algorithm would be: strip the company name from the deal name before
  composing the slug.
- Some bookings have placeholder companies like
  `companies/alan-rodriguez-via-booking` because `bookings.client_company` is
  free-text and not always joined to a real `companies` row. We could
  consolidate these or hide them in the company browse.
- The brain-reader scans every page on every label-counts / list call. Once
  the brain gets above ~1000 pages, this should be cached or shifted to
  gbrain's PGLite via MCP.

## Verifying it works (smoke test)

```bash
# 1. SIT pages
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/kg               # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/kg/graph         # 200
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3010/kg/browse?label=Person"   # 200
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3010/kg/entity/people%2Fjane-doe"   # 200

# 2. MCP tools/list
curl -s -X POST http://localhost:3010/api/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print([t['name'] for t in r['result']['tools']])"
# → ['kg_search', 'kg_get_node', 'kg_get_entity_context', 'kg_list_by_type']

# 3. gbrain CLI sanity (note the env strip)
GBRAIN_HOME=$(pwd)/brain gbrain doctor | tail -5
GBRAIN_HOME=$(pwd)/brain gbrain search "Acme" | head -5
```

## Decisions you made along the way

- GBrain is the upstream open-source Garry Tan project at
  `github.com/garrytan/gbrain` (v0.33.1.1).
- Brain lives inside this monorepo at `brain/`. PGLite index goes alongside
  at `brain/.gbrain/` and is `.gitignored` (rebuildable).
- Pre-GBrain Neo4j + pgvector data was snapshotted to `.snapshots/` before
  any destruction.
- SIT keeps its `/kg/*` UI surfaces, reshaped over the brain via a thin
  fs-backed reader (no Neo4j calls anymore).
- Steady-forward-push pace: I worked through Phase 0 → 1 → 2 without
  stopping. Phase 3 (destruction) is paused awaiting explicit approval.
- Search mode: `balanced` (12K budget, no expansion, 25 chunks — Sonnet sweet
  spot). Configured via `gbrain config set search.mode balanced`.

## What I deliberately did NOT do

- **No git commits.** Working tree has everything; you decide when to commit.
- **No git push.** No branch operations.
- **No deletion of homegrown packages/apps/containers.** They're still
  intact under `packages/kg`, `apps/gbrain-ingestor`, `apps/kg-ingestor`,
  and the `kgx-neo4j` / `kgx-pg` Docker containers — both unused but
  preserved as a rollback path.
- **No re-embedding into gbrain.** Imports ran with `--no-embed` to avoid
  OpenAI token spend. Run `gbrain embed --stale` (with OPENAI_API_KEY) when
  you want semantic search active.
- **No personal vault ingestion.** You said strvx-only — `brain/` contains
  only strvx CRM data.
