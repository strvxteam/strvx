# KG Month 1 Acceptance

**Status:** Month 1 complete on branch `kg-design`. Final review APPROVED_WITH_FOLLOWUP. All 5 critical and 6 important review items closed. Pending Aura DS provisioning + your push approval.

## What is shippable now

- `@strvx/kg` workspace package (in `packages/kg/`) with the full v1 read-side public surface.
- Postgres KG tables (`agent_credentials`, `kg_credentials`, `kg_embeddings`, `kg_resolver_cache`, `kg_audit_log`) generated as Drizzle migration `0009_kg_foundation.sql` with pgvector extension + HNSW index. `kg_audit_log` is **partitioned by month** (12 partitions pre-seeded 2026-05 through 2027-04) plus a `DEFAULT` partition and a `kg_ensure_audit_partition(date)` management function for extending or backfilling.
- Neo4j Aura DS provisioning runbook at `docs/superpowers/plans/kg-neo4j-provisioning.md`.
- ESLint rule `kg/no-neo4j-outside-kg` wired into `apps/internal/eslint.config.mjs`. Blocks: direct `neo4j-driver` imports (and its subpaths), named imports of `createNeo4jClient` / `Neo4jClient` from `@strvx/kg`. Both classes of writes are caught at lint time.
- Test suite: **30 test files, 160 tests, all passing**. Coverage: lines 98.03%, branches 95.47%, functions 95.45%, statements 98.03% (all above the v1 gate of 90/90/85/90).
- Integration tests run **serially** via `vitest.config.ts` (`fileParallelism: false`, single-fork pool) — parallel execution exhausted Colima resources and tripped wait-strategy timeouts.

## Public API surface (from `@strvx/kg`)

**Types:** `EntityType`, `RelationshipType`, `Provenance`, `Node`, `Edge`, `ObservationNode`, `DecisionNode`, `AgentContext`, `Role`, `SourceType`, `ExtractionMethod`, `TrustParams`.

**Clients:** `createNeo4jClient`, `createPostgresClient`. **The `Neo4jClient` interface now exposes `unsafeWrite` and `unsafeRawSession` instead of `write` / `rawSession` to make accidental write paths loud at the call site. External consumption is blocked by the ESLint rule.**

**Auth:** `assertRole`, `assertWriteScope`, `KgAuthError`, `buildAgentContext` (formerly `callerFromHeaders`, still exported as a deprecated alias). `assertRole` now rejects unknown role strings instead of silently treating them as below-reader.

**Provenance & trust:** `buildProvenance`, `computeTrustScore`, `DEFAULT_HALF_LIFE_DAYS`, `DEFAULT_SOURCE_RELIABILITY`.

**Audit:** `writeAuditEntry`. Every read function (including `getAuditLog`) writes an audit entry on both success and failure paths.

**Cypher (read-only escape):** `runCypher`, `assertReadOnly`, `CypherWriteAttemptError`, `CypherMalformedError`. Validator now forbids `LOAD CSV` (any whitespace) in addition to write clauses, and throws `CypherMalformedError` on unterminated comments / string literals instead of silently dropping the rest of the query.

**Embedding:** `createOpenAIEmbeddingProvider`, `createMockEmbeddingProvider`, `EmbeddingProvider`. OpenAI provider picks dimensions from a known-model map (1536 for `text-embedding-3-small` / `ada-002`, 3072 for `text-embedding-3-large`); throws on unknown models unless caller passes explicit `dimensions`.

**Reads:** `getNode`, `getEdge`, `getProvenance`, `findEntities`, `findSimilar`, `getEntityContext`, `traverse`, `getAuditLog`. **All read functions now respect `minTrust` (default 0.3)** — low-trust nodes/edges are hidden from default queries but remain retrievable via explicit `getNode(id)` / `runCypher`. `traverse` now supports `limit` (default 100, max 1000) enforced in Cypher.

## Review issues resolved (post final-review)

**Critical (all closed):**

- **#1 Write boundary leak** — `Neo4jClient.write` / `rawSession` renamed to `unsafeWrite` / `unsafeRawSession`. ESLint rule extended to block `createNeo4jClient` / `Neo4jClient` named imports from `@strvx/kg` outside `packages/kg`. (Commit `4022734`.)
- **#2 Untested RO Neo4j user** — Added `createReadOnlyUser` test helper that provisions a real `reader`-role user in Neo4j enterprise. New `tests/integration/ro-user-enforcement.test.ts` verifies the DB rejects writes from the RO user even when the validator is bypassed. (Commit `0a9d485`.)
- **#3 / #4 Trust-floor enforcement gaps** — `findSimilar` and `traverse` now accept `minTrust` (default 0.3); `getEntityContext` filters both edges *and* neighbor nodes by trust. (Commit `b5ad21c`.)
- **#5 `postgres` in devDependencies** — Moved to `dependencies`. (Commit `b5ad21c`.)

**Important (all closed):**

- **F3 Block-comment EOF bug** — Validator throws `CypherMalformedError` on unterminated comments / strings. (Commit `da32a4f`.)
- **F4 `kg_audit_log` not partitioned** — Migration now declares `PARTITION BY RANGE (occurred_at)` with composite PK `(id, occurred_at)`. 12 monthly partitions seeded + default partition + `kg_ensure_audit_partition()` SQL function. (Commit `5716ede`.)
- **F5 `getAuditLog` doesn't audit itself** — Now wrapped in the standard audit envelope; the misleading unit test was replaced with a real unknown-role rejection test. (Commit `dce7972`.)
- **F6 `LOAD CSV` + `neo4j-driver` subpath bypass** — Both addressed in the validator and ESLint rule. (Commits `4022734`, `da32a4f`.)
- **F9 OpenAI hardcoded 1536** — Dimensions now resolved from a known-model map, with optional override. Throws on unknown models without explicit override. (Commit `0080712`.)
- **F10 Cleanups** — Unused `JSONValue` import removed; `toDate` `console.warn`s on unrecognized shape; `callerFromHeaders` renamed to `buildAgentContext` (back-compat alias kept). (Commits `0080712`, `dc5eb42`.)

**Test infrastructure:**

- **F7 Full integration suite green** — Vitest configured to run files serially via `fileParallelism: false` + single-fork pool. Confirmed 30/30 files, 160/160 tests pass. (Commit `0b87a20`.)
- **F8 Coverage gate met post-review** — 98.03% lines, 95.47% branches, 95.45% functions, 98.03% statements.

## Minor items intentionally deferred

- **`since` default to 1970 in `getAuditLog`** — "All time" is a reasonable explicit default; callers paginate via `limit`. Will revisit if observed query cost becomes a problem.
- **`getEntityContext` post-query limit in JS** — Cypher-side enforcement is a future optimization; current behavior is correct for v1's data size.
- **Structured search has no text index** — Documented in roadmap; index migration is a v1.5 task once data volumes warrant.
- **Test-container sharing across files** — `singleFork` is good enough for now; globalSetup-based sharing is a v1.5 speed-up.
- **Cypher AST parser** — v1.5 upgrade. Defense-in-depth Neo4j RO user is now verified.

## What the Chief of Staff agent can do now

- Develop and test against the read API via the `@strvx/kg` SDK directly (in-process for the strvx internal app; over an HTTP shim the COS agent implements until `apps/kg-mcp` ships in Month 3).
- Use `runCypher` (read-only enforced *and* DB-level enforced via the RO user; audited) for ad-hoc exploration with the agent's API key.
- Build agent flows that consume `getEntityContext`, `findEntities`, `findSimilar`, `traverse`, `getProvenance`, `getAuditLog`.
- Inspect what the agent reads via `getAuditLog` and the `kg_audit_log` partitions in Postgres.

**Note for COS dev:** `Neo4jClient.unsafeWrite` is the path to seed test data manually if needed *from inside `packages/kg`* (e.g., a local script). External code (including the COS agent) cannot call it — the ESLint rule blocks the import.

## What is NOT yet available (deferred to Month 2-4)

- **Write functions for agent memory** — `recordObservation`, `recordDecision`, `recordPlan`, `linkEntities` ship in Month 2.
- **CDC from Postgres** — Postgres rows do not yet flow into the graph; the graph is empty unless seeded manually.
- **MCP server** (`apps/kg-mcp`) — Month 3.
- **Virtual-edge resolvers** (GitHub, Gmail content fetch on demand) — Month 3.
- **Management UI** under `/knowledge` in `apps/internal` — Month 3.
- **Self-improvement workers** (trust decay, ontology evolution, ER learning, memory consolidation, usage weighting, pattern extraction) — Month 4.

## Manual gates blocking full smoke test

1. **Aura DS provisioning.** Follow `docs/superpowers/plans/kg-neo4j-provisioning.md`:
   - Provision an Aura DS instance via https://console.neo4j.io.
   - Create `strvx_kg_rw` (editor role) and `strvx_kg_ro` (reader role) users.
   - Configure IP allowlist for Vercel egress + developer static IPs.
2. **Env vars.** Populate `NEO4J_URI`, `NEO4J_USER_RW`, `NEO4J_PASSWORD_RW`, `NEO4J_USER_RO`, `NEO4J_PASSWORD_RO`, `OPENAI_API_KEY` in:
   - Vercel project `strvx` Production + Preview
   - Local `.env` for development

3. **Run smoke test from `/Users/nicolasdossantos/strvx`:**

```bash
NEO4J_URI=neo4j+s://... \
NEO4J_USER_RW=strvx_kg_rw \
NEO4J_PASSWORD_RW=... \
node --input-type=module -e "
import neo4j from 'neo4j-driver';
const d = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER_RW, process.env.NEO4J_PASSWORD_RW));
const s = d.session();
const r = await s.run('RETURN 1 AS one');
console.log(r.records[0].get('one'));
await s.close(); await d.close();
"
```

Expected: prints `1`.

Then SDK round-trip (use `unsafeWrite` inside the `@strvx/kg` package scope; for an external smoke test, run this via a script *inside* `packages/kg/` or temporarily disable the lint rule for the smoke script):

```bash
NEO4J_URI=... NEO4J_USER_RW=... NEO4J_PASSWORD_RW=... \
NEO4J_USER_RO=... NEO4J_PASSWORD_RO=... \
DATABASE_URL=... \
node --input-type=module -e "
import { createNeo4jClient, createPostgresClient, getNode } from '@strvx/kg';
const client = createNeo4jClient({
  uri: process.env.NEO4J_URI,
  rw: { user: process.env.NEO4J_USER_RW, password: process.env.NEO4J_PASSWORD_RW },
  ro: { user: process.env.NEO4J_USER_RO, password: process.env.NEO4J_PASSWORD_RO },
});
const sql = createPostgresClient(process.env.DATABASE_URL);
await client.unsafeWrite(async (tx) => {
  await tx.run(\\\"CREATE (p:Person {id: 'smoke:1', type: 'Person', name: 'Smoke Test', prov_source_type: 'system', prov_source_id: 'smoke:1', prov_source_record_id: '1', prov_extraction_method: 'system_inference', prov_extracted_at: datetime(), prov_last_validated_at: datetime(), prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0, prov_created_by: 'smoke'})\\\");
});
const node = await getNode({ client, sql, ctx: { actorKind: 'system', actorId: 'smoke', role: 'reader' } }, 'smoke:1');
console.log(JSON.stringify(node, null, 2));
await client.unsafeWrite(async (tx) => { await tx.run(\\\"MATCH (p {id: 'smoke:1'}) DETACH DELETE p\\\"); });
await sql.end(); await client.close();
"
```

Expected: prints a `Person` node JSON with `provenance.source_type === 'system'`.

## Smoke-test checklist

- [x] `pnpm --filter @strvx/kg test` is green locally — 160/160 tests pass.
- [x] `pnpm --filter @strvx/kg test --coverage` exits 0 with thresholds met (98% lines).
- [x] `pnpm --filter @strvx/kg typecheck` exits 0.
- [x] `pnpm --filter tacoma lint` exits 0 with the `kg/no-neo4j-outside-kg` rule active.
- [ ] Neo4j Aura DS instance provisioned and env vars set. *(your gate)*
- [ ] The Cypher smoke test above prints `1`. *(after Aura)*
- [ ] The SDK round-trip smoke test prints a `Person` node with parsed provenance. *(after Aura)*

## Known infrastructure constraints

- **Colima disk corruption on tight host.** Running the full integration suite requires Docker (we use Colima). When host disk falls below ~10 GiB free during container-image pulls, the Colima VM's containerd metadata.db can corrupt and the cached images need a full Colima reset (`colima delete && colima start --disk 30`). Keep an eye on `df -h /` before long testcontainer runs.
- **Vitest must run serially** for integration files (config already set). Don't override `fileParallelism` without also bumping Colima memory.

## Month 2 prerequisites

Before writing functions (`recordObservation`, `recordDecision`, `recordPlan`, `linkEntities`) ship in Month 2:

1. Aura DS must be provisioned with both RW and RO users.
2. Conflict-detection LLM provider config decision (Anthropic Claude default already in spec).
3. First COS use case selected (drives Month 2 acceptance — what real question are we answering?).

## Roll-up

**Month 1 ships, with the review punch list closed.** Read-side APIs work end-to-end against real Neo4j Enterprise + pgvector containers, the write boundary is enforced at lint time, audit log is partitioned for the long haul, and the defense-in-depth RO Neo4j user is empirically verified. Coverage gate met. Branch `kg-design` is local and not yet pushed — that gate is yours.

Writes, MCP, UI, CDC, self-improvement workers all remain on the Month 2-4 roadmap per `docs/superpowers/plans/2026-05-11-strvx-knowledge-graph.md`.
