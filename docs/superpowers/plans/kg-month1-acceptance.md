# KG Month 1 Acceptance

## What is shippable now

- `@strvx/kg` workspace package (in `packages/kg/`) with the full v1 read-side public surface.
- Postgres KG tables (`agent_credentials`, `kg_credentials`, `kg_embeddings`, `kg_resolver_cache`, `kg_audit_log`) generated as Drizzle migration `0009_kg_foundation.sql` with pgvector extension + HNSW index.
- Neo4j Aura DS provisioning runbook at `docs/superpowers/plans/kg-neo4j-provisioning.md`.
- ESLint rule `kg/no-neo4j-outside-kg` wired into `apps/internal/eslint.config.mjs` — direct `neo4j-driver` imports outside `packages/kg/` fail lint.
- Test suite: 126 unit tests + 10 integration test files (testcontainers Neo4j + pgvector).
- Coverage on `packages/kg/`: lines 99.46%, functions 95.23%, branches 94.2%, statements 99.46% (all above the v1 gate of 90/90/85/90).

## Public API surface (from `@strvx/kg`)

Types: `EntityType`, `RelationshipType`, `Provenance`, `Node`, `Edge`, `ObservationNode`, `DecisionNode`, `AgentContext`, `Role`, `SourceType`, `ExtractionMethod`, `TrustParams`.

Clients: `createNeo4jClient`, `createPostgresClient`.

Auth: `assertRole`, `assertWriteScope`, `KgAuthError`, `callerFromHeaders`.

Provenance & trust: `buildProvenance`, `computeTrustScore`, `DEFAULT_HALF_LIFE_DAYS`, `DEFAULT_SOURCE_RELIABILITY`.

Audit: `writeAuditEntry`.

Cypher (read-only escape): `runCypher`, `assertReadOnly`, `CypherWriteAttemptError`.

Embedding: `createOpenAIEmbeddingProvider`, `createMockEmbeddingProvider`, `EmbeddingProvider`.

Reads: `getNode`, `getEdge`, `getProvenance`, `findEntities`, `findSimilar`, `getEntityContext`, `traverse`, `getAuditLog`.

## What the Chief of Staff agent can do now

- Develop and test against the read API via the `@strvx/kg` SDK directly (in-process for the strvx internal app, or over HTTP shim that the COS agent implements until `apps/kg-mcp` ships in Month 3).
- Use `runCypher` (read-only enforced; audited) for ad-hoc exploration with the agent's API key.
- Build agent flows that consume `getEntityContext`, `findEntities`, `findSimilar`, `traverse`, `getProvenance`.
- Seed the graph manually via `client.write` + raw Cypher (writes go through `packages/kg` only; the rule-blocked path is the *internal-app* direct import).

## What is NOT yet available (deferred)

- **Write functions for agent memory** — `recordObservation`, `recordDecision`, `recordPlan`, `linkEntities` ship in Month 2.
- **CDC from Postgres** — Postgres rows do not yet flow into the graph; the graph is empty unless seeded manually or by application code that writes directly via `client.write`.
- **MCP server** (`apps/kg-mcp`) — Month 3.
- **Virtual-edge resolvers** (GitHub, Gmail content fetch on demand) — Month 3.
- **Management UI** under `/knowledge` in `apps/internal` — Month 3.
- **Self-improvement workers** (trust decay, ontology evolution, ER learning, memory consolidation, usage weighting, pattern extraction) — Month 4.

## Manual gates blocking full smoke test

The plan's Step 6 ("live smoke test against Aura") **is not run by T20**. It is blocked on:

1. **Aura DS provisioning.** Follow `docs/superpowers/plans/kg-neo4j-provisioning.md`:
   - Provision an Aura DS instance via https://console.neo4j.io.
   - Create `strvx_kg_rw` (editor role) and `strvx_kg_ro` (reader role) users.
   - Configure IP allowlist for Vercel egress + developer static IPs.
2. **Env vars.** Populate `NEO4J_URI`, `NEO4J_USER_RW`, `NEO4J_PASSWORD_RW`, `NEO4J_USER_RO`, `NEO4J_PASSWORD_RO`, `OPENAI_API_KEY` in:
   - Vercel project `strvx` Production + Preview
   - Local `.env` for development
3. **Run smoke test.** Once env is set, run from `/Users/nicolasdossantos/strvx`:

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

   Then verify a `Person` node round-trip via the SDK:

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
   // Seed a node via raw Cypher
   await client.write(async (tx) => {
     await tx.run('CREATE (p:Person {id: \\\"smoke:1\\\", type: \\\"Person\\\", name: \\\"Smoke Test\\\", prov_source_type: \\\"system\\\", prov_source_id: \\\"smoke:1\\\", prov_source_record_id: \\\"1\\\", prov_extraction_method: \\\"system_inference\\\", prov_extracted_at: datetime(), prov_last_validated_at: datetime(), prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0, prov_created_by: \\\"smoke\\\"})');
   });
   const node = await getNode({ client, sql, ctx: { actorKind: 'system', actorId: 'smoke', role: 'reader' } }, 'smoke:1');
   console.log(JSON.stringify(node, null, 2));
   // Cleanup
   await client.write(async (tx) => { await tx.run('MATCH (p {id: \\\"smoke:1\\\"}) DETACH DELETE p'); });
   await sql.end(); await client.close();
   "
   ```

   Expected: prints a `Person` node JSON with `provenance.source_type === 'system'`.

## Smoke-test checklist

- [ ] `pnpm --filter @strvx/kg test` is green locally (Docker required for integration suite).
- [ ] `pnpm --filter @strvx/kg typecheck` exits 0.
- [ ] `pnpm --filter tacoma lint` exits 0 (with the `kg/no-neo4j-outside-kg` rule active).
- [ ] Neo4j Aura DS instance provisioned and env vars set.
- [ ] The Cypher smoke test above prints `1`.
- [ ] The SDK round-trip smoke test prints a `Person` node with parsed provenance.

## Known infrastructure constraints

- **Colima disk corruption risk on a tight host.** Running the full integration suite requires Docker (we use Colima). When host disk falls below ~10 GiB free during container-image pulls, the Colima VM's containerd metadata.db can corrupt and the cached images need a full Colima reset (`colima delete && colima start --disk 30`). Keep an eye on `df -h /` before long testcontainer runs.

## Roll-up

Month 1 ships the foundation. Read-side APIs work end-to-end against real Neo4j + pgvector containers. Coverage gate met. Writes, MCP, UI, CDC pipeline, self-improvement workers — all on the Month 2-4 roadmap per the plan in `docs/superpowers/plans/2026-05-11-strvx-knowledge-graph.md`.
