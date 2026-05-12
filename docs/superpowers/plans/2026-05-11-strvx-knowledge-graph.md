# strvx Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified, self-improving knowledge graph (`packages/kg` + `apps/kg-mcp` + `apps/kg-ingestor` + `/knowledge` UI) that serves as retrieval, reasoning, and memory substrate for the Chief of Staff agent and future strvx agents.

**Architecture:** Hybrid materialized+virtual graph. Postgres remains source of truth for operational data; CDC streams changes into Neo4j Aura DS. Agent memory is graph-canonical. GitHub repos and Gmail bodies are virtualized (metadata+embeddings indexed, content fetched on demand). All graph writes go through `packages/kg`, the only writer; MCP server and internal app import the same library. Self-improvement workers (trust, ontology evolution, ER learning, consolidation, usage, patterns) ship in v1.

**Tech Stack:** TypeScript 5, pnpm workspaces + Turbo, Drizzle ORM + postgres-js (existing), Neo4j 5.x + Cypher (Aura DS managed), pgvector for embeddings, Next.js 16 App Router (existing), Vitest + testcontainers for tests, OpenAI text-embedding-3-small (v1 embedding default), Anthropic Claude (v1 worker LLM default, matches existing `@anthropic-ai/sdk` dep), wal2json + Postgres logical replication for CDC, React Flow for graph visualization, MCP HTTP+SSE transport, Fly.io for services, Vercel for the internal app (existing), Sentry for errors (existing).

**Spec reference:** `docs/superpowers/specs/2026-05-11-strvx-knowledge-graph-design.md`. Read it once before starting Month 1.

**Resolved open questions for this plan:**
- Embedding model: OpenAI `text-embedding-3-small` (1536 dim). Revisitable in v1.5 via worker #8.
- Worker LLM: Anthropic Claude (matches existing internal-app `@anthropic-ai/sdk` dep).
- CDC tool: `wal2json` output plugin on a dedicated replication slot.
- Cypher safety: regex-tokenizer denylist for write clauses (string-literal-aware) + Neo4j read-only DB user for `runCypher`. AST parser upgrade deferred to v1.5.
- Per-tenant isolation: single Neo4j database for v1. Multi-tenant decision deferred.
- GitHub/Gmail/Slack scoping and first COS use case: open until Month 3 plan is written.

---

## File Structure (Month 1)

### New package: `packages/kg/`

```
packages/kg/
├── package.json                    # @strvx/kg, exports ., ./types, ./testing
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Public API barrel
│   ├── types.ts                    # Ontology types (Entity, Relationship, Provenance, etc.)
│   ├── client/
│   │   ├── neo4j.ts                # Neo4j driver wrapper, read-only and read-write pools
│   │   └── postgres.ts             # Re-export @strvx/db; KG-specific helpers
│   ├── auth/
│   │   ├── context.ts              # AgentContext type, callerFromHeaders helper
│   │   └── middleware.ts           # assertRole, assertScope
│   ├── provenance/
│   │   ├── compute.ts              # buildProvenance, computeTrustScore
│   │   └── source-reliability.ts   # default source-reliability map
│   ├── audit/
│   │   └── writer.ts               # writeAuditEntry
│   ├── cypher/
│   │   ├── validate.ts             # assertReadOnly: regex-denylist Cypher validator
│   │   └── run.ts                  # runCypher (uses validate + read-only driver)
│   ├── reads/
│   │   ├── get-node.ts             # getNode, getEdge
│   │   ├── get-provenance.ts       # getProvenance
│   │   ├── find-entities.ts        # findEntities (semantic + structured + hybrid)
│   │   ├── get-entity-context.ts   # getEntityContext (N-hop)
│   │   ├── find-similar.ts         # findSimilar
│   │   ├── traverse.ts             # traverse (pattern-based)
│   │   └── get-audit-log.ts        # getAuditLog
│   ├── embedding/
│   │   ├── provider.ts             # EmbeddingProvider interface
│   │   ├── openai.ts               # OpenAI text-embedding-3-small impl
│   │   └── mock.ts                 # Deterministic mock for tests
│   ├── eslint/
│   │   └── no-neo4j-outside-kg.js  # Custom ESLint rule
│   └── testing/
│       ├── index.ts                # Re-exports for consumers' tests
│       ├── containers.ts           # testcontainers helpers (Neo4j, Postgres)
│       └── fixtures.ts             # Sample nodes/edges
└── tests/
    ├── unit/
    │   ├── provenance.test.ts
    │   ├── cypher-validate.test.ts
    │   └── auth.test.ts
    └── integration/
        ├── reads.test.ts
        ├── audit.test.ts
        ├── run-cypher.test.ts
        └── find-entities.test.ts
```

### Modified: `packages/db/`

- `packages/db/src/schema.ts` — append KG tables (`kg_embeddings`, `kg_resolver_cache`, `kg_audit_log`, `kg_credentials`, `agent_credentials`) and the `vector` column type helpers.
- `packages/db/drizzle/0009_kg_foundation.sql` — generated migration enabling the `vector` extension and creating KG tables.

### Modified: root

- `pnpm-workspace.yaml` — no change (already globs `packages/*`).
- `turbo.json` — no change (lint / test / typecheck pipelines pick up new package automatically).
- `.eslintrc` or `eslint.config.mjs` (consumer level) — wire up `no-neo4j-outside-kg` (apps that touch graph state).

### Environment variables (new)

| Var | Where | Purpose |
|---|---|---|
| `NEO4J_URI` | Vercel (apps/internal), Fly secrets (later kg-mcp/ingestor) | bolt+ssc://... |
| `NEO4J_USER_RW` | Same | read-write user (used by packages/kg writes) |
| `NEO4J_PASSWORD_RW` | Same | |
| `NEO4J_USER_RO` | Same | read-only user (used by runCypher) |
| `NEO4J_PASSWORD_RO` | Same | |
| `OPENAI_API_KEY` | Same | for embeddings (text-embedding-3-small) |

---

## Phase 1 — Month 1 (Foundation): full executable plan

### Task 1: Bootstrap `packages/kg` package

**Files:**
- Create: `packages/kg/package.json`
- Create: `packages/kg/tsconfig.json`
- Create: `packages/kg/vitest.config.ts`
- Create: `packages/kg/src/index.ts`
- Create: `packages/kg/tests/unit/.gitkeep`
- Create: `packages/kg/tests/integration/.gitkeep`

- [ ] **Step 1: Create `packages/kg/package.json`**

```json
{
  "name": "@strvx/kg",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts",
    "./testing": "./src/testing/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run tests/integration",
    "lint": "eslint src tests"
  },
  "dependencies": {
    "@strvx/db": "workspace:*",
    "neo4j-driver": "^5.27.0",
    "openai": "^4.83.0"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@testcontainers/neo4j": "^10.13.2",
    "@testcontainers/postgresql": "^10.13.2",
    "testcontainers": "^10.13.2",
    "typescript": "^5",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create `packages/kg/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/kg/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
      include: ["src/**/*.ts"],
      exclude: ["src/testing/**", "src/eslint/**"],
    },
    testTimeout: 60_000, // testcontainers can take time
  },
});
```

- [ ] **Step 4: Create `packages/kg/src/index.ts` (initial barrel — fills in as tasks land)**

```ts
export {};
```

- [ ] **Step 5: Install dependencies**

Run: `pnpm install` (from repo root)
Expected: `@strvx/kg` resolved as workspace package, deps installed.

- [ ] **Step 6: Verify typecheck passes**

Run: `pnpm --filter @strvx/kg typecheck`
Expected: exit 0, no output.

- [ ] **Step 7: Commit**

```bash
git add packages/kg/
git commit -m "feat(kg): bootstrap @strvx/kg package skeleton"
```

---

### Task 2: Add testcontainers-based integration test harness

**Files:**
- Create: `packages/kg/src/testing/containers.ts`
- Create: `packages/kg/src/testing/fixtures.ts`
- Create: `packages/kg/src/testing/index.ts`
- Create: `packages/kg/tests/integration/harness.test.ts`

- [ ] **Step 1: Write the integration harness self-test first**

Create `packages/kg/tests/integration/harness.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startNeo4j, startPostgres, type KgTestEnv } from "@strvx/kg/testing";

describe("test harness", () => {
  let env: KgTestEnv;

  beforeAll(async () => {
    env = { neo4j: await startNeo4j(), postgres: await startPostgres() };
  }, 120_000);

  afterAll(async () => {
    await env.neo4j.stop();
    await env.postgres.stop();
  });

  it("starts a Neo4j container and accepts a Cypher query", async () => {
    const session = env.neo4j.driver.session();
    try {
      const result = await session.run("RETURN 1 AS one");
      expect(result.records[0].get("one").toNumber()).toBe(1);
    } finally {
      await session.close();
    }
  });

  it("starts a Postgres container with vector extension and accepts SQL", async () => {
    const rows = await env.postgres.sql`SELECT 1 AS one`;
    expect(rows[0].one).toBe(1);
    const ext = await env.postgres.sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    expect(ext[0]?.extname).toBe("vector");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @strvx/kg test tests/integration/harness.test.ts`
Expected: FAIL (module `@strvx/kg/testing` not yet implemented).

- [ ] **Step 3: Implement `packages/kg/src/testing/containers.ts`**

```ts
import { Neo4jContainer, type StartedNeo4jContainer } from "@testcontainers/neo4j";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import neo4j, { type Driver as Neo4jDriver } from "neo4j-driver";
import postgres, { type Sql } from "postgres";

export type StartedNeo4j = {
  container: StartedNeo4jContainer;
  driver: Neo4jDriver;
  stop: () => Promise<void>;
};

export type StartedPostgres = {
  container: StartedPostgreSqlContainer;
  url: string;
  sql: Sql;
  stop: () => Promise<void>;
};

export type KgTestEnv = { neo4j: StartedNeo4j; postgres: StartedPostgres };

export async function startNeo4j(): Promise<StartedNeo4j> {
  const container = await new Neo4jContainer("neo4j:5.25-enterprise")
    .withEnvironment({ NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes" })
    .withApoc()
    .start();
  const driver = neo4j.driver(
    container.getBoltUri(),
    neo4j.auth.basic(container.getUsername(), container.getPassword()),
  );
  return {
    container,
    driver,
    stop: async () => {
      await driver.close();
      await container.stop();
    },
  };
}

export async function startPostgres(): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = container.getConnectionUri();
  const sql = postgres(url, { prepare: false, max: 5 });
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  return {
    container,
    url,
    sql,
    stop: async () => {
      await sql.end();
      await container.stop();
    },
  };
}
```

- [ ] **Step 4: Implement `packages/kg/src/testing/fixtures.ts` (initial — grows over tasks)**

```ts
import type { Node, Provenance } from "../types.js";

// Filled in by Task 5 once types exist; for harness self-test we don't need fixtures yet.
export const POSTGRES_PROVENANCE_SAMPLE: Pick<Provenance, "source_type" | "extraction_method"> = {
  source_type: "postgres",
  extraction_method: "cdc",
};

export type _FixturesPlaceholderUntilTask5 = Node;
```

- [ ] **Step 5: Implement `packages/kg/src/testing/index.ts`**

```ts
export { startNeo4j, startPostgres, type KgTestEnv } from "./containers.js";
export * from "./fixtures.js";
```

- [ ] **Step 6: Run the integration harness test**

Run: `pnpm --filter @strvx/kg test tests/integration/harness.test.ts`
Expected: PASS (2 tests). Note: first run pulls Docker images and may take 2–3 min.

- [ ] **Step 7: Commit**

```bash
git add packages/kg/src/testing/ packages/kg/tests/integration/
git commit -m "feat(kg): add testcontainers harness for Neo4j + Postgres+pgvector"
```

---

### Task 3: Add Postgres schema additions for KG tables

**Files:**
- Modify: `packages/db/src/schema.ts` (append)
- Create: `packages/db/drizzle/0009_kg_foundation.sql` (generated by drizzle-kit)

- [ ] **Step 1: Append KG tables to `packages/db/src/schema.ts`**

Add at the bottom of the file:

```ts
// ── Knowledge Graph foundation tables ──────────────────────────────────────

export const agentCredentials = pgTable("agent_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentName: text("agent_name").notNull().unique(),
  apiKeyHash: text("api_key_hash").notNull(), // bcrypt/argon2
  role: text("role").notNull(), // 'reader' | 'writer' | 'admin'
  scopeEntityTypes: jsonb("scope_entity_types").$type<string[] | null>(),
  scopeOperations: jsonb("scope_operations").$type<string[] | null>(),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kgCredentials = pgTable("kg_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceType: text("source_type").notNull(), // 'github' | 'gmail' | 'stripe' | 'mercury' | 'slack'
  label: text("label").notNull(),
  encryptedToken: text("encrypted_token").notNull(), // KMS-encrypted
  scopeNotes: text("scope_notes"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kgEmbeddings = pgTable(
  "kg_embeddings",
  {
    nodeId: text("node_id").primaryKey(), // matches Neo4j elementId or our stable id
    modelName: text("model_name").notNull(),
    modelVersion: text("model_version").notNull(),
    // 1536 dims for text-embedding-3-small. Stored as text in Drizzle today
    // because pgvector typings are not first-class; raw SQL handles vector ops.
    embedding: text("embedding").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    modelIdx: index("kg_embeddings_model_idx").on(t.modelName, t.modelVersion),
  }),
);

export const kgResolverCache = pgTable(
  "kg_resolver_cache",
  {
    nodeId: text("node_id").primaryKey(),
    sourceType: text("source_type").notNull(),
    contentRef: text("content_ref").notNull(), // URL or message-id
    content: text("content"), // can be large — partitioning deferred
    contentHash: text("content_hash"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    ttl: integer("ttl_seconds").notNull(),
    isStale: boolean("is_stale").notNull().default(false),
  },
  (t) => ({
    sourceIdx: index("kg_resolver_cache_source_idx").on(t.sourceType),
    staleIdx: index("kg_resolver_cache_stale_idx").on(t.isStale),
  }),
);

export const kgAuditLog = pgTable(
  "kg_audit_log",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorKind: text("actor_kind").notNull(), // 'agent' | 'user' | 'system'
    actorId: text("actor_id").notNull(),
    tool: text("tool").notNull(), // 'getNode', 'recordObservation', etc.
    targetNodeId: text("target_node_id"),
    targetEdgeId: text("target_edge_id"),
    parameters: jsonb("parameters").$type<Record<string, unknown>>(),
    resultSummary: jsonb("result_summary").$type<Record<string, unknown>>(),
    latencyMs: integer("latency_ms"),
    success: boolean("success").notNull(),
    errorMessage: text("error_message"),
  },
  (t) => ({
    occurredIdx: index("kg_audit_log_occurred_idx").on(t.occurredAt),
    actorIdx: index("kg_audit_log_actor_idx").on(t.actorKind, t.actorId),
    targetIdx: index("kg_audit_log_target_idx").on(t.targetNodeId),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @strvx/db db:generate`
Expected: a new file appears at `packages/db/drizzle/0009_<random_name>.sql` containing CREATE TABLE statements for the five new tables.

- [ ] **Step 3: Rename the migration for clarity**

```bash
mv packages/db/drizzle/0009_*.sql packages/db/drizzle/0009_kg_foundation.sql
```

Also rename inside `packages/db/drizzle/meta/_journal.json` to keep the entry consistent (Drizzle uses the filename as a tag — open `_journal.json` and update the `tag` for entry index 9 to `0009_kg_foundation`).

- [ ] **Step 4: Prepend pgvector extension creation to the SQL**

Open `packages/db/drizzle/0009_kg_foundation.sql` and add as the FIRST line:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then immediately after, alter `kg_embeddings.embedding` to be a real `vector(1536)`:

```sql
ALTER TABLE "kg_embeddings"
  ALTER COLUMN "embedding" TYPE vector(1536) USING embedding::vector;
CREATE INDEX "kg_embeddings_ann_idx"
  ON "kg_embeddings" USING hnsw (embedding vector_cosine_ops);
```

- [ ] **Step 5: Push migration to a local Postgres for sanity (optional but recommended)**

Run (in a throwaway local Supabase or pgvector container):
```bash
DATABASE_URL=postgres://... pnpm --filter @strvx/db db:push
```
Expected: success; tables and the HNSW index exist.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/0009_kg_foundation.sql packages/db/drizzle/meta/_journal.json
git commit -m "feat(db): add KG foundation tables and pgvector extension"
```

---

### Task 4: Provision Neo4j Aura DS + record connection config

**Files:**
- Create: `docs/superpowers/plans/kg-neo4j-provisioning.md`
- Modify: `apps/internal/.env.example` (add NEO4J_* + OPENAI_API_KEY)
- Modify: `apps/internal/src/instrumentation.ts` (no code change yet; just verify env)

- [ ] **Step 1: Provision Neo4j Aura DS via the Aura console**

Follow these manual steps (done by Nicolas, recorded in the doc you write in Step 3):

1. Sign in to https://console.neo4j.io with the strvx Google account.
2. Create a new **AuraDS** instance (Data Science) — smallest size (1GB).
3. Region: choose closest to the existing Supabase region.
4. Download the connection credentials file. Store **only** the URI; secrets go in env vars.
5. In the Aura console, create two database users:
   - `strvx_kg_rw` with role `editor` (database write access).
   - `strvx_kg_ro` with role `reader` (read-only).

- [ ] **Step 2: Add IP allowlist entries**

In the Aura console under **Network**, add:
- Vercel production egress IP range (look up current range in Vercel dashboard).
- Local developer IPs (Nicolas + Alex).
- Fly.io egress range for the org (deferred to Month 2 when ingestor deploys).

- [ ] **Step 3: Write provisioning runbook**

Create `docs/superpowers/plans/kg-neo4j-provisioning.md`:

```markdown
# Neo4j Aura DS Provisioning Runbook

## What

Single Neo4j Aura DS instance for the strvx knowledge graph (v1, single-tenant).

## Credentials

- URI: stored in Vault under `strvx/neo4j/uri`.
- Read-write user: `strvx_kg_rw`. Password in Vault.
- Read-only user: `strvx_kg_ro`. Password in Vault.

## Environment variables required

| Var | Used by |
|---|---|
| NEO4J_URI | apps/internal, apps/kg-mcp, apps/kg-ingestor |
| NEO4J_USER_RW | All |
| NEO4J_PASSWORD_RW | All |
| NEO4J_USER_RO | All (only used in runCypher path) |
| NEO4J_PASSWORD_RO | All |

## IP allowlist

- Vercel egress (auto-rotated; revisit quarterly).
- Fly.io egress (added in Month 2).
- Developer static IPs.

## Backups

Aura DS provides daily automatic snapshots. Weekly export to S3 (`s3://strvx-backups/neo4j/`)
configured in Aura console under Backups → S3 destination.
```

- [ ] **Step 4: Update `apps/internal/.env.example`**

Append:
```
# Knowledge graph
NEO4J_URI=
NEO4J_USER_RW=
NEO4J_PASSWORD_RW=
NEO4J_USER_RO=
NEO4J_PASSWORD_RO=
OPENAI_API_KEY=
```

- [ ] **Step 5: Set env vars in Vercel for `apps/internal`**

In Vercel dashboard for the `strvx` project, add all six env vars in Production + Preview. Use the actual Aura URI + the Vault-stored credentials.

- [ ] **Step 6: Smoke test connectivity from local dev**

From repo root, run a one-off Node REPL:
```bash
NEO4J_URI=neo4j+s://... NEO4J_USER_RW=... NEO4J_PASSWORD_RW=... node --input-type=module -e "
import neo4j from 'neo4j-driver';
const d = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER_RW, process.env.NEO4J_PASSWORD_RW));
const s = d.session();
const r = await s.run('RETURN 1 AS one');
console.log(r.records[0].get('one').toNumber());
await s.close(); await d.close();
"
```
Expected: prints `1`.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/kg-neo4j-provisioning.md apps/internal/.env.example
git commit -m "docs(kg): add Neo4j Aura DS provisioning runbook"
```

---

### Task 5: Define ontology TypeScript types

**Files:**
- Create: `packages/kg/src/types.ts`
- Modify: `packages/kg/src/testing/fixtures.ts`
- Modify: `packages/kg/src/index.ts`

- [ ] **Step 1: Write the type-shape test (a "this compiles" guard)**

Create `packages/kg/tests/unit/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  EntityType,
  Provenance,
  Node,
  Edge,
  ObservationNode,
  AgentContext,
} from "../../src/types.js";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "../../src/types.js";

describe("ontology types", () => {
  it("exports all v1 entity types", () => {
    expect(ENTITY_TYPES).toContain("Person");
    expect(ENTITY_TYPES).toContain("Organization");
    expect(ENTITY_TYPES).toContain("Engagement");
    expect(ENTITY_TYPES).toContain("Observation");
    expect(ENTITY_TYPES).toContain("Decision");
    expect(ENTITY_TYPES).toContain("Pattern");
    expect(ENTITY_TYPES.length).toBeGreaterThanOrEqual(20);
  });

  it("exports all v1 relationship types including Tier-3 hooks", () => {
    expect(RELATIONSHIP_TYPES).toContain("WORKS_AT");
    expect(RELATIONSHIP_TYPES).toContain("PREDICTS"); // Tier-3 reserved
    expect(RELATIONSHIP_TYPES).toContain("CAUSED");   // Tier-3 reserved
  });

  it("Observation extends Node with agent fields", () => {
    const obs: ObservationNode = {
      id: "n1",
      type: "Observation",
      properties: { content: "x", subject: "client:acme" },
      provenance: {
        source_type: "agent",
        source_id: "agent:cos:obs:1",
        source_record_id: "1",
        extraction_method: "agent_write",
        extracted_at: new Date(),
        last_validated_at: new Date(),
        validation_count: 0,
        confidence: 0.9,
        trust_score: 0.9,
        created_by: "agent:cos",
      },
      agent_id: "cos",
      session_id: "s1",
      rationale: "noticed in email thread",
    };
    expect(obs.type).toBe("Observation");
  });

  it("AgentContext carries role + scope", () => {
    const ctx: AgentContext = { actorKind: "agent", actorId: "cos", role: "writer" };
    expect(ctx.role).toBe("writer");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @strvx/kg test tests/unit/types.test.ts`
Expected: FAIL (`Cannot find module '../../src/types.js'`).

- [ ] **Step 3: Create `packages/kg/src/types.ts`**

```ts
// ── Entity & relationship enums ────────────────────────────────────────────

export const ENTITY_TYPES = [
  // People & Organizations
  "Person",
  "Organization",
  "Role",
  // Activity & Engagements
  "Engagement",
  "Interaction",
  "Communication",
  "Task",
  "FinancialEvent",
  "Booking",
  // Knowledge & Artifacts
  "Document",
  "Repository",
  "Commit",
  "PullRequest",
  "Issue",
  "CodeFile",
  "Note",
  "Goal",
  "MonitoredSite",
  // Agent memory
  "Observation",
  "Decision",
  "Plan",
  "Pattern",
  "SchemaProposal",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const RELATIONSHIP_TYPES = [
  "WORKS_AT",
  "REPRESENTS",
  "HAS_ENGAGEMENT",
  "ASSIGNED_TO",
  "INVOLVED_IN",
  "ABOUT",
  "AUTHORED",
  "IN_REPO",
  "OWNED_BY",
  "PAID_BY",
  "PAID_TO",
  "FOLLOWS",
  "REFERENCES",
  "DECIDED_ABOUT",
  "OBSERVED",
  "PLANS_FOR",
  "EXTRACTED_FROM",
  "SUPERSEDES",
  "MERGED_FROM",
  "SAME_AS",
  "CONFLICTS_WITH",
  "SUMMARIZED_BY",
  "DERIVED_FROM",
  // Tier-3 hook edges (reserved; no writers in v1)
  "PREDICTS",
  "CAUSED",
  "COUNTERFACTUAL_OF",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

// ── Provenance ─────────────────────────────────────────────────────────────

export type SourceType =
  | "postgres"
  | "gmail"
  | "calendar"
  | "mercury"
  | "stripe"
  | "slack"
  | "github"
  | "obsidian"
  | "agent"
  | "system";

export type ExtractionMethod =
  | "cdc"
  | "api_fetch"
  | "llm_extraction"
  | "agent_write"
  | "system_inference";

export interface Provenance {
  source_type: SourceType;
  source_id: string;
  source_record_id: string;
  extraction_method: ExtractionMethod;
  extracted_at: Date;
  last_validated_at: Date;
  validation_count: number;
  confidence: number; // 0..1
  trust_score: number; // 0..1 (derived)
  created_by: string;
}

// ── Nodes & edges ──────────────────────────────────────────────────────────

export interface Node {
  id: string; // stable graph id: `${source_type}:${source_id}`
  type: EntityType;
  properties: Record<string, unknown>;
  provenance: Provenance;
}

export interface Edge {
  id: string;
  type: RelationshipType;
  from: string; // node id
  to: string; // node id
  properties: Record<string, unknown>;
  provenance: Provenance;
}

export interface ObservationNode extends Node {
  type: "Observation";
  agent_id: string;
  session_id: string;
  rationale: string;
  superseded_by?: string;
}

export interface DecisionNode extends Node {
  type: "Decision";
  agent_id: string;
  session_id: string;
  rationale: string;
  alternatives?: string[];
}

// ── Auth context ───────────────────────────────────────────────────────────

export type Role = "reader" | "writer" | "admin";

export interface AgentContext {
  actorKind: "agent" | "user" | "system";
  actorId: string;
  role: Role;
  scopeEntityTypes?: EntityType[]; // null/undefined = all
  scopeOperations?: string[]; // null/undefined = all
  sessionId?: string;
}

// ── Trust & validation ─────────────────────────────────────────────────────

export interface TrustParams {
  confidence: number;
  source_reliability: number;
  age_decay: number;
  validation_factor: number;
}
```

- [ ] **Step 4: Update `packages/kg/src/testing/fixtures.ts` to use real types**

Replace contents with:

```ts
import type { Node, Provenance } from "../types.js";

export function makeProvenance(overrides: Partial<Provenance> = {}): Provenance {
  const now = new Date();
  return {
    source_type: "postgres",
    source_id: "pg:test:1",
    source_record_id: "1",
    extraction_method: "cdc",
    extracted_at: now,
    last_validated_at: now,
    validation_count: 1,
    confidence: 1,
    trust_score: 1,
    created_by: "test",
    ...overrides,
  };
}

export function makePersonNode(overrides: Partial<Node> = {}): Node {
  return {
    id: "postgres:contact:1",
    type: "Person",
    properties: { name: "Test Person", email: "t@example.com" },
    provenance: makeProvenance(),
    ...overrides,
  };
}
```

- [ ] **Step 5: Re-export from `packages/kg/src/index.ts`**

```ts
export * from "./types.js";
```

- [ ] **Step 6: Run the types test**

Run: `pnpm --filter @strvx/kg test tests/unit/types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/kg/src/types.ts packages/kg/src/testing/fixtures.ts packages/kg/src/index.ts packages/kg/tests/unit/types.test.ts
git commit -m "feat(kg): define ontology v1 TypeScript types"
```

---

### Task 6: Neo4j client (read-write and read-only drivers)

**Files:**
- Create: `packages/kg/src/client/neo4j.ts`

- [ ] **Step 1: Write the failing integration test**

Create `packages/kg/tests/integration/neo4j-client.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j } from "@strvx/kg/testing";
import { startNeo4j } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";

describe("Neo4jClient", () => {
  let n4j: StartedNeo4j;
  let client: Neo4jClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await n4j.stop();
  });

  it("executes a read query via the read-only session", async () => {
    const result = await client.read(async (tx) => {
      const r = await tx.run("RETURN 1 AS one");
      return r.records[0].get("one").toNumber();
    });
    expect(result).toBe(1);
  });

  it("executes a write query via the read-write session", async () => {
    const result = await client.write(async (tx) => {
      const r = await tx.run("CREATE (n:Test {id: 'x'}) RETURN n.id AS id");
      return r.records[0].get("id");
    });
    expect(result).toBe("x");
  });

  it("rejects writes attempted through the read-only session", async () => {
    await expect(
      client.read(async (tx) => {
        await tx.run("CREATE (n:Test {id: 'should-fail'}) RETURN n");
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @strvx/kg test tests/integration/neo4j-client.test.ts`
Expected: FAIL — module `client/neo4j` missing.

- [ ] **Step 3: Implement `packages/kg/src/client/neo4j.ts`**

```ts
import neo4j, { type Driver, type Session, type Transaction } from "neo4j-driver";

export interface Neo4jClientOptions {
  uri: string;
  rw: { user: string; password: string };
  ro: { user: string; password: string };
  database?: string; // default 'neo4j'
}

export interface Neo4jClient {
  read<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  write<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  rawSession(mode: "read" | "write"): Session;
  close(): Promise<void>;
}

export function createNeo4jClient(opts: Neo4jClientOptions): Neo4jClient {
  const database = opts.database ?? "neo4j";
  const rwDriver: Driver = neo4j.driver(
    opts.uri,
    neo4j.auth.basic(opts.rw.user, opts.rw.password),
    { disableLosslessIntegers: true },
  );
  const roDriver: Driver = neo4j.driver(
    opts.uri,
    neo4j.auth.basic(opts.ro.user, opts.ro.password),
    { disableLosslessIntegers: true },
  );

  function read<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    const session = roDriver.session({ database, defaultAccessMode: neo4j.session.READ });
    return session.executeRead(work).finally(() => session.close());
  }
  function write<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    const session = rwDriver.session({ database, defaultAccessMode: neo4j.session.WRITE });
    return session.executeWrite(work).finally(() => session.close());
  }
  function rawSession(mode: "read" | "write"): Session {
    const driver = mode === "read" ? roDriver : rwDriver;
    return driver.session({
      database,
      defaultAccessMode: mode === "read" ? neo4j.session.READ : neo4j.session.WRITE,
    });
  }
  async function close(): Promise<void> {
    await Promise.all([rwDriver.close(), roDriver.close()]);
  }

  return { read, write, rawSession, close };
}
```

> Note: in production, the read-only Neo4j user has no write privileges granted; the test
> harness uses the same user for both because the testcontainer's preset role allows writes.
> The "read-only enforcement" the test asserts comes from `defaultAccessMode: READ` and
> Neo4j's session-mode check, which rejects writes inside a READ session regardless of user.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @strvx/kg test tests/integration/neo4j-client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kg/src/client/neo4j.ts packages/kg/tests/integration/neo4j-client.test.ts
git commit -m "feat(kg): add Neo4j client with read-only and read-write modes"
```

---

### Task 7: Provenance + trust score helpers

**Files:**
- Create: `packages/kg/src/provenance/source-reliability.ts`
- Create: `packages/kg/src/provenance/compute.ts`
- Create: `packages/kg/tests/unit/provenance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kg/tests/unit/provenance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildProvenance, computeTrustScore, DEFAULT_HALF_LIFE_DAYS, DEFAULT_SOURCE_RELIABILITY } from "../../src/provenance/compute.js";

describe("buildProvenance", () => {
  it("produces a complete provenance with computed trust", () => {
    const p = buildProvenance({
      source_type: "agent",
      source_id: "agent:cos:obs:42",
      source_record_id: "42",
      extraction_method: "agent_write",
      confidence: 0.8,
      created_by: "agent:cos",
      entity_type: "Observation",
    });
    expect(p.source_type).toBe("agent");
    expect(p.validation_count).toBe(0);
    expect(p.trust_score).toBeCloseTo(0.8 * DEFAULT_SOURCE_RELIABILITY.agent * 1, 5);
  });
});

describe("computeTrustScore", () => {
  it("uses age decay relative to entity-type half-life", () => {
    const halfLife = DEFAULT_HALF_LIFE_DAYS.Observation;
    const score = computeTrustScore({
      confidence: 1,
      source_reliability: 1,
      age_days: halfLife,
      validation_count: 0,
      entity_type: "Observation",
    });
    expect(score).toBeCloseTo(0.5, 2);
  });

  it("rewards cross-source validation up to the cap", () => {
    const noVal = computeTrustScore({
      confidence: 0.5,
      source_reliability: 1,
      age_days: 0,
      validation_count: 0,
      entity_type: "Person",
    });
    const muchVal = computeTrustScore({
      confidence: 0.5,
      source_reliability: 1,
      age_days: 0,
      validation_count: 20,
      entity_type: "Person",
    });
    expect(muchVal).toBeGreaterThan(noVal);
    expect(muchVal).toBeLessThanOrEqual(0.5 * 1.5); // 1.5× cap
  });

  it("clamps to [0, 1]", () => {
    const high = computeTrustScore({
      confidence: 1,
      source_reliability: 1,
      age_days: 0,
      validation_count: 50,
      entity_type: "Person",
    });
    expect(high).toBeLessThanOrEqual(1);
    expect(high).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @strvx/kg test tests/unit/provenance.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `packages/kg/src/provenance/source-reliability.ts`**

```ts
import type { SourceType, EntityType } from "../types.js";

export const DEFAULT_SOURCE_RELIABILITY: Record<SourceType, number> = {
  postgres: 1.0,
  github: 0.9,
  stripe: 0.95,
  mercury: 0.95,
  calendar: 0.85,
  slack: 0.75,
  gmail: 0.7,
  obsidian: 0.6,
  agent: 0.6,
  system: 0.5,
};

export const DEFAULT_HALF_LIFE_DAYS: Record<EntityType, number> = {
  Person: 36500,
  Organization: 36500,
  Role: 1825,
  Engagement: 1825,
  Interaction: 365,
  Communication: 365,
  Task: 365,
  FinancialEvent: 1825,
  Booking: 365,
  Document: 1825,
  Repository: 3650,
  Commit: 3650,
  PullRequest: 3650,
  Issue: 1825,
  CodeFile: 1825,
  Note: 365,
  Goal: 365,
  MonitoredSite: 365,
  Observation: 30,
  Decision: 36500, // decisions never decay
  Plan: 90,
  Pattern: 90,
  SchemaProposal: 30,
};
```

- [ ] **Step 4: Implement `packages/kg/src/provenance/compute.ts`**

```ts
import type { EntityType, ExtractionMethod, Provenance, SourceType } from "../types.js";
import { DEFAULT_HALF_LIFE_DAYS, DEFAULT_SOURCE_RELIABILITY } from "./source-reliability.js";

export { DEFAULT_HALF_LIFE_DAYS, DEFAULT_SOURCE_RELIABILITY };

export interface BuildProvenanceInput {
  source_type: SourceType;
  source_id: string;
  source_record_id: string;
  extraction_method: ExtractionMethod;
  confidence: number;
  created_by: string;
  entity_type: EntityType;
  source_reliability?: number;
  now?: Date;
}

export function buildProvenance(input: BuildProvenanceInput): Provenance {
  const now = input.now ?? new Date();
  const reliability =
    input.source_reliability ?? DEFAULT_SOURCE_RELIABILITY[input.source_type];
  const trust = computeTrustScore({
    confidence: input.confidence,
    source_reliability: reliability,
    age_days: 0,
    validation_count: 0,
    entity_type: input.entity_type,
  });
  return {
    source_type: input.source_type,
    source_id: input.source_id,
    source_record_id: input.source_record_id,
    extraction_method: input.extraction_method,
    extracted_at: now,
    last_validated_at: now,
    validation_count: 0,
    confidence: clamp01(input.confidence),
    trust_score: trust,
    created_by: input.created_by,
  };
}

export interface ComputeTrustInput {
  confidence: number;
  source_reliability: number;
  age_days: number;
  validation_count: number;
  entity_type: EntityType;
}

export function computeTrustScore(input: ComputeTrustInput): number {
  const halfLife = DEFAULT_HALF_LIFE_DAYS[input.entity_type];
  const ageDecay = halfLife > 0 ? Math.pow(0.5, input.age_days / halfLife) : 1;
  // +0.1 per cross-source validation, capped at 1.5×
  const validationFactor = Math.min(1 + input.validation_count * 0.1, 1.5);
  const raw =
    clamp01(input.confidence) *
    clamp01(input.source_reliability) *
    ageDecay *
    validationFactor;
  return clamp01(raw);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @strvx/kg test tests/unit/provenance.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/kg/src/provenance/ packages/kg/tests/unit/provenance.test.ts
git commit -m "feat(kg): provenance and trust scoring helpers"
```

---

### Task 8: Auth context + role/scope middleware

**Files:**
- Create: `packages/kg/src/auth/context.ts`
- Create: `packages/kg/src/auth/middleware.ts`
- Create: `packages/kg/tests/unit/auth.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/kg/tests/unit/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertRole, assertWriteScope, KgAuthError } from "../../src/auth/middleware.js";
import type { AgentContext } from "../../src/types.js";

const reader: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };
const writer: AgentContext = { actorKind: "agent", actorId: "a2", role: "writer" };
const scopedWriter: AgentContext = {
  actorKind: "agent", actorId: "a3", role: "writer",
  scopeEntityTypes: ["Observation"], scopeOperations: ["recordObservation"],
};

describe("assertRole", () => {
  it("passes when role is sufficient", () => {
    expect(() => assertRole(writer, "writer")).not.toThrow();
    expect(() => assertRole(writer, "reader")).not.toThrow();
  });
  it("throws KgAuthError when role is insufficient", () => {
    expect(() => assertRole(reader, "writer")).toThrow(KgAuthError);
  });
});

describe("assertWriteScope", () => {
  it("passes when entity type and operation are in scope", () => {
    expect(() => assertWriteScope(scopedWriter, "Observation", "recordObservation")).not.toThrow();
  });
  it("throws when entity type is out of scope", () => {
    expect(() => assertWriteScope(scopedWriter, "Decision", "recordObservation")).toThrow(KgAuthError);
  });
  it("throws when operation is out of scope", () => {
    expect(() => assertWriteScope(scopedWriter, "Observation", "linkEntities")).toThrow(KgAuthError);
  });
  it("treats unset scope as 'all'", () => {
    expect(() => assertWriteScope(writer, "Decision", "linkEntities")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, see it fail**

Run: `pnpm --filter @strvx/kg test tests/unit/auth.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `packages/kg/src/auth/context.ts`**

```ts
import type { AgentContext, Role } from "../types.js";

export type { AgentContext, Role };

/**
 * Build an AgentContext from request headers. Caller is expected to have already
 * verified the API key against agent_credentials; this just packages the claims.
 */
export function callerFromHeaders(
  headers: Headers,
  claims: { agentId: string; role: Role; scopeEntityTypes?: string[]; scopeOperations?: string[] },
): AgentContext {
  return {
    actorKind: "agent",
    actorId: claims.agentId,
    role: claims.role,
    scopeEntityTypes: claims.scopeEntityTypes as AgentContext["scopeEntityTypes"],
    scopeOperations: claims.scopeOperations,
    sessionId: headers.get("x-kg-session-id") ?? undefined,
  };
}
```

- [ ] **Step 4: Implement `packages/kg/src/auth/middleware.ts`**

```ts
import type { AgentContext, EntityType, Role } from "../types.js";

export class KgAuthError extends Error {
  constructor(message: string) { super(message); this.name = "KgAuthError"; }
}

const ROLE_RANK: Record<Role, number> = { reader: 0, writer: 1, admin: 2 };

export function assertRole(ctx: AgentContext, minRole: Role): void {
  if (ROLE_RANK[ctx.role] < ROLE_RANK[minRole]) {
    throw new KgAuthError(
      `actor ${ctx.actorId} has role '${ctx.role}', needs at least '${minRole}'`,
    );
  }
}

export function assertWriteScope(
  ctx: AgentContext,
  entityType: EntityType,
  operation: string,
): void {
  assertRole(ctx, "writer");
  if (ctx.scopeEntityTypes && !ctx.scopeEntityTypes.includes(entityType)) {
    throw new KgAuthError(
      `actor ${ctx.actorId} is not scoped to write ${entityType}`,
    );
  }
  if (ctx.scopeOperations && !ctx.scopeOperations.includes(operation)) {
    throw new KgAuthError(
      `actor ${ctx.actorId} is not scoped for operation '${operation}'`,
    );
  }
}
```

- [ ] **Step 5: Run test**

Run: `pnpm --filter @strvx/kg test tests/unit/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/kg/src/auth/ packages/kg/tests/unit/auth.test.ts
git commit -m "feat(kg): auth context + role/scope middleware"
```

---

### Task 9: Audit log writer

**Files:**
- Create: `packages/kg/src/client/postgres.ts`
- Create: `packages/kg/src/audit/writer.ts`
- Create: `packages/kg/tests/integration/audit.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `packages/kg/tests/integration/audit.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgres } from "@strvx/kg/testing";
import { startPostgres } from "@strvx/kg/testing";
import { writeAuditEntry } from "../../src/audit/writer.js";
import { createPostgresClient } from "../../src/client/postgres.js";

describe("writeAuditEntry", () => {
  let pg: StartedPostgres;

  beforeAll(async () => {
    pg = await startPostgres();
    // Apply the audit-log table directly (the full migration is in @strvx/db; we
    // create the minimum schema here for isolation).
    await pg.sql`
      CREATE TABLE kg_audit_log (
        id           bigint generated always as identity primary key,
        occurred_at  timestamptz not null default now(),
        actor_kind   text not null,
        actor_id     text not null,
        tool         text not null,
        target_node_id text,
        target_edge_id text,
        parameters   jsonb,
        result_summary jsonb,
        latency_ms   integer,
        success      boolean not null,
        error_message text
      )
    `;
  }, 120_000);

  afterAll(async () => {
    await pg.stop();
  });

  it("inserts a successful audit entry", async () => {
    const client = createPostgresClient(pg.url);
    await writeAuditEntry(client, {
      actorKind: "agent",
      actorId: "cos",
      tool: "getNode",
      targetNodeId: "n1",
      parameters: { id: "n1" },
      resultSummary: { found: true },
      latencyMs: 42,
      success: true,
    });
    const rows = await pg.sql`SELECT * FROM kg_audit_log`;
    expect(rows.length).toBe(1);
    expect(rows[0].tool).toBe("getNode");
    expect(rows[0].success).toBe(true);
  });

  it("inserts a failed audit entry with an error message", async () => {
    const client = createPostgresClient(pg.url);
    await writeAuditEntry(client, {
      actorKind: "agent",
      actorId: "cos",
      tool: "runCypher",
      parameters: { query: "CREATE (n)" },
      success: false,
      errorMessage: "writes not allowed",
    });
    const rows = await pg.sql`SELECT * FROM kg_audit_log WHERE success = false`;
    expect(rows.length).toBe(1);
    expect(rows[0].error_message).toBe("writes not allowed");
  });
});
```

- [ ] **Step 2: Run, see it fail**

Run: `pnpm --filter @strvx/kg test tests/integration/audit.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `packages/kg/src/client/postgres.ts`**

```ts
import postgres, { type Sql } from "postgres";

export type PostgresClient = Sql;

export function createPostgresClient(url: string): PostgresClient {
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
}
```

- [ ] **Step 4: Implement `packages/kg/src/audit/writer.ts`**

```ts
import type { PostgresClient } from "../client/postgres.js";

export interface AuditEntry {
  actorKind: "agent" | "user" | "system";
  actorId: string;
  tool: string;
  targetNodeId?: string;
  targetEdgeId?: string;
  parameters?: Record<string, unknown>;
  resultSummary?: Record<string, unknown>;
  latencyMs?: number;
  success: boolean;
  errorMessage?: string;
}

export async function writeAuditEntry(
  sql: PostgresClient,
  entry: AuditEntry,
): Promise<void> {
  await sql`
    INSERT INTO kg_audit_log (
      actor_kind, actor_id, tool, target_node_id, target_edge_id,
      parameters, result_summary, latency_ms, success, error_message
    ) VALUES (
      ${entry.actorKind}, ${entry.actorId}, ${entry.tool},
      ${entry.targetNodeId ?? null}, ${entry.targetEdgeId ?? null},
      ${entry.parameters ?? null}::jsonb,
      ${entry.resultSummary ?? null}::jsonb,
      ${entry.latencyMs ?? null}, ${entry.success}, ${entry.errorMessage ?? null}
    )
  `;
}
```

- [ ] **Step 5: Run test**

Run: `pnpm --filter @strvx/kg test tests/integration/audit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/kg/src/client/postgres.ts packages/kg/src/audit/ packages/kg/tests/integration/audit.test.ts
git commit -m "feat(kg): audit log writer"
```

---

### Task 10: ESLint rule blocking neo4j-driver imports outside packages/kg

**Files:**
- Create: `packages/kg/src/eslint/no-neo4j-outside-kg.js`
- Create: `packages/kg/src/eslint/README.md`
- Modify: `apps/internal/eslint.config.mjs`

- [ ] **Step 1: Implement the ESLint rule**

Create `packages/kg/src/eslint/no-neo4j-outside-kg.js`:

```js
/**
 * ESLint rule: forbid `import 'neo4j-driver'` (and dynamic equivalents) anywhere
 * outside the `@strvx/kg` package. All Neo4j access must go through `packages/kg`.
 */
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Disallow direct neo4j-driver imports outside @strvx/kg" },
    schema: [],
    messages: {
      disallowed:
        "Direct `neo4j-driver` imports are forbidden outside packages/kg. Use the @strvx/kg public API.",
    },
  },
  create(context) {
    const filename = context.getFilename();
    if (filename.includes("/packages/kg/")) return {};
    function check(value, node) {
      if (typeof value === "string" && value === "neo4j-driver") {
        context.report({ node, messageId: "disallowed" });
      }
    }
    return {
      ImportDeclaration(node) { check(node.source.value, node); },
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node.source.value, node);
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0]?.type === "Literal"
        ) {
          check(node.arguments[0].value, node);
        }
      },
    };
  },
};
```

- [ ] **Step 2: Write a unit test for the rule**

Create `packages/kg/tests/unit/eslint-rule.test.ts`:

```ts
import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import rule from "../../src/eslint/no-neo4j-outside-kg.js";

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } });

describe("no-neo4j-outside-kg rule", () => {
  it("flags direct neo4j-driver imports outside packages/kg", () => {
    tester.run("no-neo4j-outside-kg", rule as any, {
      valid: [
        { filename: "/repo/packages/kg/src/client/neo4j.ts", code: "import neo4j from 'neo4j-driver'" },
        { filename: "/repo/apps/internal/src/page.tsx", code: "import { findEntities } from '@strvx/kg'" },
      ],
      invalid: [
        {
          filename: "/repo/apps/internal/src/lib/q.ts",
          code: "import neo4j from 'neo4j-driver'",
          errors: [{ messageId: "disallowed" }],
        },
        {
          filename: "/repo/apps/internal/src/lib/q.ts",
          code: "const x = require('neo4j-driver')",
          errors: [{ messageId: "disallowed" }],
        },
      ],
    });
  });
});
```

Add `eslint` to `packages/kg/package.json` devDependencies (`"eslint": "^9.18.0"`), then `pnpm install`.

- [ ] **Step 3: Run the rule test**

Run: `pnpm --filter @strvx/kg test tests/unit/eslint-rule.test.ts`
Expected: PASS.

- [ ] **Step 4: Wire the rule into `apps/internal/eslint.config.mjs`**

Open `apps/internal/eslint.config.mjs` and add:

```js
import noNeo4jRule from "../../packages/kg/src/eslint/no-neo4j-outside-kg.js";

export default [
  // ...existing config entries...
  {
    plugins: { kg: { rules: { "no-neo4j-outside-kg": noNeo4jRule } } },
    rules: { "kg/no-neo4j-outside-kg": "error" },
  },
];
```

- [ ] **Step 5: Run lint to confirm clean baseline**

Run: `pnpm --filter tacoma lint` (internal app's pnpm name is `tacoma`)
Expected: exit 0 — no existing files import `neo4j-driver`.

- [ ] **Step 6: Document the rule**

Create `packages/kg/src/eslint/README.md`:

```markdown
# `no-neo4j-outside-kg`

Forbids `import 'neo4j-driver'` anywhere outside `packages/kg`. All graph access
must flow through `@strvx/kg`, which enforces trust, provenance, and audit invariants.

Wire it up in any app's `eslint.config.mjs` (see `apps/internal/eslint.config.mjs`).
```

- [ ] **Step 7: Commit**

```bash
git add packages/kg/src/eslint/ packages/kg/tests/unit/eslint-rule.test.ts apps/internal/eslint.config.mjs packages/kg/package.json
git commit -m "feat(kg): ESLint rule blocking neo4j-driver imports outside @strvx/kg"
```

---

### Task 11: Cypher safety validator (read-only enforcement)

**Files:**
- Create: `packages/kg/src/cypher/validate.ts`
- Create: `packages/kg/tests/unit/cypher-validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kg/tests/unit/cypher-validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertReadOnly, CypherWriteAttemptError } from "../../src/cypher/validate.js";

describe("assertReadOnly", () => {
  const reads = [
    "MATCH (n:Person) RETURN n",
    "MATCH (a)-[r]->(b) WHERE a.name = 'x' RETURN r",
    "CALL db.indexes() YIELD name RETURN name",
    "RETURN 1 AS one",
    "MATCH (n) WHERE n.name CONTAINS 'CREATE' RETURN n",  // CREATE inside string literal
    "// CREATE a comment\nMATCH (n) RETURN n",            // CREATE inside line comment
    "/* CREATE */ MATCH (n) RETURN n",                    // CREATE inside block comment
  ];
  const writes = [
    "CREATE (n:Person {name: 'x'}) RETURN n",
    "match (n) create (m) return m",                       // lowercase
    "MERGE (n:Person {email: 'x'}) RETURN n",
    "MATCH (n) SET n.x = 1 RETURN n",
    "MATCH (n) DELETE n",
    "MATCH (n) DETACH DELETE n",
    "MATCH (n) REMOVE n.x",
    "CALL { MATCH (n) CREATE (m) RETURN m } RETURN 1",
  ];

  for (const q of reads) {
    it(`accepts read: ${q.slice(0, 40)}`, () => {
      expect(() => assertReadOnly(q)).not.toThrow();
    });
  }
  for (const q of writes) {
    it(`rejects write: ${q.slice(0, 40)}`, () => {
      expect(() => assertReadOnly(q)).toThrow(CypherWriteAttemptError);
    });
  }
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @strvx/kg test tests/unit/cypher-validate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/kg/src/cypher/validate.ts`**

```ts
/**
 * Read-only enforcement for `runCypher` (v1 implementation).
 *
 * Strategy: regex-tokenize the query, stripping string literals and comments,
 * then check for forbidden keywords. The Neo4j read-only user is the defense-in-depth
 * floor — even if a pattern slips past this validator, the database rejects the write.
 *
 * Forbidden top-level keywords: CREATE, MERGE, SET, DELETE, REMOVE, DETACH DELETE,
 * plus CALL { ... CREATE/MERGE/SET/DELETE/REMOVE ... } subqueries.
 *
 * v1.5: upgrade to a proper Cypher AST parser (tree-sitter-cypher).
 */

export class CypherWriteAttemptError extends Error {
  constructor(keyword: string, query: string) {
    super(`Cypher write attempt detected (${keyword}) in: ${query.slice(0, 100)}`);
    this.name = "CypherWriteAttemptError";
  }
}

const FORBIDDEN = ["CREATE", "MERGE", "SET", "DELETE", "REMOVE"] as const;

export function assertReadOnly(query: string): void {
  const stripped = stripLiteralsAndComments(query);
  // tokenize on word boundaries; check uppercase forms
  const upper = stripped.toUpperCase();
  for (const kw of FORBIDDEN) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upper)) {
      throw new CypherWriteAttemptError(kw, query);
    }
  }
}

function stripLiteralsAndComments(q: string): string {
  let out = "";
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    // line comment: // ... \n
    if (c === "/" && q[i + 1] === "/") {
      while (i < q.length && q[i] !== "\n") i++;
      continue;
    }
    // block comment: /* ... */
    if (c === "/" && q[i + 1] === "*") {
      i += 2;
      while (i < q.length && !(q[i] === "*" && q[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // string literal: '...' or "..." or `...` (back-ticked identifiers)
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      i++;
      while (i < q.length && q[i] !== quote) {
        if (q[i] === "\\") i += 2;
        else i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @strvx/kg test tests/unit/cypher-validate.test.ts`
Expected: PASS (all read and write cases).

- [ ] **Step 5: Commit**

```bash
git add packages/kg/src/cypher/validate.ts packages/kg/tests/unit/cypher-validate.test.ts
git commit -m "feat(kg): Cypher read-only validator (literal-aware, with DB read-only user as DiD)"
```

---

### Task 12: `runCypher` (read-only escape hatch)

**Files:**
- Create: `packages/kg/src/cypher/run.ts`
- Create: `packages/kg/tests/integration/run-cypher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kg/tests/integration/run-cypher.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { runCypher } from "../../src/cypher/run.js";
import { CypherWriteAttemptError } from "../../src/cypher/validate.js";
import type { AgentContext } from "../../src/types.js";

const reader: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("runCypher", () => {
  let n4j: StartedNeo4j;
  let pg: StartedPostgres;
  let client: Neo4jClient;
  let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    pg = await startPostgres();
    await pg.sql`
      CREATE TABLE kg_audit_log (
        id bigint generated always as identity primary key,
        occurred_at timestamptz not null default now(),
        actor_kind text not null, actor_id text not null, tool text not null,
        target_node_id text, target_edge_id text,
        parameters jsonb, result_summary jsonb, latency_ms integer,
        success boolean not null, error_message text
      )`;
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    sql = createPostgresClient(pg.url);
    // seed a node
    await client.write(async (tx) => {
      await tx.run("CREATE (n:Person {id: 'p1', name: 'Ada'})");
    });
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await sql.end();
    await n4j.stop();
    await pg.stop();
  });

  it("returns rows for a read query", async () => {
    const res = await runCypher(
      { client, sql, ctx: reader },
      "MATCH (n:Person {id: $id}) RETURN n.name AS name",
      { id: "p1" },
    );
    expect(res.records[0].name).toBe("Ada");
  });

  it("rejects writes before hitting Neo4j", async () => {
    await expect(
      runCypher(
        { client, sql, ctx: reader },
        "CREATE (n:Person {id: 'p2'}) RETURN n",
        {},
      ),
    ).rejects.toThrow(CypherWriteAttemptError);
  });

  it("writes an audit entry on success", async () => {
    await runCypher({ client, sql, ctx: reader }, "RETURN 1 AS one", {});
    const rows = await sql`SELECT * FROM kg_audit_log WHERE tool = 'runCypher' AND success = true`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("writes an audit entry on rejected write", async () => {
    try {
      await runCypher({ client, sql, ctx: reader }, "CREATE (n) RETURN n", {});
    } catch { /* expected */ }
    const rows = await sql`SELECT * FROM kg_audit_log WHERE tool = 'runCypher' AND success = false`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @strvx/kg test tests/integration/run-cypher.test.ts`
Expected: FAIL — `cypher/run` missing.

- [ ] **Step 3: Implement `packages/kg/src/cypher/run.ts`**

```ts
import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import type { AgentContext } from "../types.js";
import { assertReadOnly } from "./validate.js";

export interface RunCypherDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
}

export interface CypherResult {
  records: Record<string, unknown>[];
  recordCount: number;
}

export async function runCypher(
  deps: RunCypherDeps,
  query: string,
  params: Record<string, unknown>,
): Promise<CypherResult> {
  const start = Date.now();
  assertRole(deps.ctx, "reader");
  try {
    assertReadOnly(query);
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "runCypher",
      parameters: { query, params },
      success: false,
      errorMessage: (err as Error).message,
      latencyMs: Date.now() - start,
    });
    throw err;
  }
  try {
    const records = await deps.client.read(async (tx) => {
      const r = await tx.run(query, params);
      return r.records.map((rec) => Object.fromEntries(rec.keys.map((k) => [k, rec.get(k)])));
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "runCypher",
      parameters: { query, params },
      resultSummary: { recordCount: records.length },
      latencyMs: Date.now() - start,
      success: true,
    });
    return { records, recordCount: records.length };
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "runCypher",
      parameters: { query, params },
      success: false,
      errorMessage: (err as Error).message,
      latencyMs: Date.now() - start,
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @strvx/kg test tests/integration/run-cypher.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kg/src/cypher/run.ts packages/kg/tests/integration/run-cypher.test.ts
git commit -m "feat(kg): runCypher with read-only validation and audit logging"
```

---

### Task 13: `getNode`, `getEdge`, `getProvenance`

**Files:**
- Create: `packages/kg/src/reads/get-node.ts`
- Create: `packages/kg/src/reads/get-provenance.ts`
- Create: `packages/kg/tests/integration/get-node.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/kg/tests/integration/get-node.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient } from "../../src/client/postgres.js";
import { getEdge, getNode } from "../../src/reads/get-node.js";
import { getProvenance } from "../../src/reads/get-provenance.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("getNode / getEdge / getProvenance", () => {
  let n4j: StartedNeo4j;
  let pg: StartedPostgres;
  let client: Neo4jClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
      actor_kind text not null, actor_id text not null, tool text not null,
      target_node_id text, target_edge_id text,
      parameters jsonb, result_summary jsonb, latency_ms integer,
      success boolean not null, error_message text
    )`;
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    await client.write(async (tx) => {
      await tx.run(`
        CREATE (p:Person {
          id: 'postgres:contact:1', type: 'Person', name: 'Ada',
          prov_source_type: 'postgres', prov_source_id: 'pg:contact:1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0,
          prov_created_by: 'cdc'
        })
        CREATE (o:Organization {
          id: 'postgres:company:1', type: 'Organization', name: 'Acme',
          prov_source_type: 'postgres', prov_source_id: 'pg:company:1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0,
          prov_created_by: 'cdc'
        })
        CREATE (p)-[r:WORKS_AT {
          id: 'rel:1', prov_source_type: 'postgres', prov_source_id: 'pg:rel:1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0,
          prov_created_by: 'cdc'
        }]->(o)
      `);
    });
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("getNode returns a node with parsed provenance", async () => {
    const sql = createPostgresClient(pg.url);
    const node = await getNode({ client, sql, ctx }, "postgres:contact:1");
    expect(node?.type).toBe("Person");
    expect(node?.properties.name).toBe("Ada");
    expect(node?.provenance.source_type).toBe("postgres");
    expect(node?.provenance.trust_score).toBe(1);
    await sql.end();
  });

  it("getNode returns null for missing id", async () => {
    const sql = createPostgresClient(pg.url);
    const node = await getNode({ client, sql, ctx }, "postgres:contact:404");
    expect(node).toBeNull();
    await sql.end();
  });

  it("getEdge returns an edge with provenance", async () => {
    const sql = createPostgresClient(pg.url);
    const edge = await getEdge({ client, sql, ctx }, "rel:1");
    expect(edge?.type).toBe("WORKS_AT");
    expect(edge?.from).toBe("postgres:contact:1");
    expect(edge?.to).toBe("postgres:company:1");
    await sql.end();
  });

  it("getProvenance returns provenance for a node id", async () => {
    const sql = createPostgresClient(pg.url);
    const prov = await getProvenance({ client, sql, ctx }, "postgres:contact:1");
    expect(prov?.source_type).toBe("postgres");
    await sql.end();
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @strvx/kg test tests/integration/get-node.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `packages/kg/src/reads/get-node.ts`**

```ts
import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import type { AgentContext, Edge, EntityType, Node, Provenance, RelationshipType } from "../types.js";

export interface ReadDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
}

export async function getNode(deps: ReadDeps, id: string): Promise<Node | null> {
  assertRole(deps.ctx, "reader");
  const start = Date.now();
  try {
    const result = await deps.client.read(async (tx) => {
      const r = await tx.run("MATCH (n {id: $id}) RETURN n LIMIT 1", { id });
      if (r.records.length === 0) return null;
      const n = r.records[0].get("n");
      return rowToNode(n.properties as Record<string, unknown>, [...n.labels]);
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "getNode", targetNodeId: id, parameters: { id },
      resultSummary: { found: result !== null },
      latencyMs: Date.now() - start, success: true,
    });
    return result;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "getNode", targetNodeId: id, parameters: { id },
      latencyMs: Date.now() - start, success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

export async function getEdge(deps: ReadDeps, id: string): Promise<Edge | null> {
  assertRole(deps.ctx, "reader");
  const start = Date.now();
  try {
    const result = await deps.client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (a)-[r {id: $id}]->(b) RETURN r, a.id AS fromId, b.id AS toId, type(r) AS relType LIMIT 1",
        { id },
      );
      if (r.records.length === 0) return null;
      const props = r.records[0].get("r").properties as Record<string, unknown>;
      const fromId = r.records[0].get("fromId") as string;
      const toId = r.records[0].get("toId") as string;
      const relType = r.records[0].get("relType") as RelationshipType;
      return {
        id: props.id as string,
        type: relType,
        from: fromId,
        to: toId,
        properties: stripProvenanceFields(props),
        provenance: extractProvenance(props),
      };
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "getEdge", targetEdgeId: id, parameters: { id },
      resultSummary: { found: result !== null },
      latencyMs: Date.now() - start, success: true,
    });
    return result;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "getEdge", targetEdgeId: id, parameters: { id },
      latencyMs: Date.now() - start, success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

export function extractProvenance(props: Record<string, unknown>): Provenance {
  return {
    source_type: props.prov_source_type as Provenance["source_type"],
    source_id: props.prov_source_id as string,
    source_record_id: props.prov_source_record_id as string,
    extraction_method: props.prov_extraction_method as Provenance["extraction_method"],
    extracted_at: toDate(props.prov_extracted_at),
    last_validated_at: toDate(props.prov_last_validated_at),
    validation_count: Number(props.prov_validation_count ?? 0),
    confidence: Number(props.prov_confidence ?? 0),
    trust_score: Number(props.prov_trust_score ?? 0),
    created_by: (props.prov_created_by as string) ?? "unknown",
  };
}

export function stripProvenanceFields(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!k.startsWith("prov_")) out[k] = v;
  }
  return out;
}

export function rowToNode(props: Record<string, unknown>, labels: string[]): Node {
  const type = (props.type ?? labels[0]) as EntityType;
  return {
    id: props.id as string,
    type,
    properties: stripProvenanceFields({ ...props, id: undefined, type: undefined }),
    provenance: extractProvenance(props),
  };
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string") return new Date(v);
  // Neo4j DateTime
  if (typeof v === "object" && v !== null && "toString" in v) {
    return new Date((v as { toString(): string }).toString());
  }
  return new Date(0);
}
```

- [ ] **Step 4: Implement `packages/kg/src/reads/get-provenance.ts`**

```ts
import type { Provenance } from "../types.js";
import { extractProvenance } from "./get-node.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import type { ReadDeps } from "./get-node.js";

export async function getProvenance(deps: ReadDeps, id: string): Promise<Provenance | null> {
  assertRole(deps.ctx, "reader");
  const start = Date.now();
  try {
    const result = await deps.client.read(async (tx) => {
      const r = await tx.run("MATCH (n {id: $id}) RETURN properties(n) AS p LIMIT 1", { id });
      if (r.records.length === 0) {
        const r2 = await tx.run("MATCH ()-[r {id: $id}]->() RETURN properties(r) AS p LIMIT 1", { id });
        if (r2.records.length === 0) return null;
        return extractProvenance(r2.records[0].get("p") as Record<string, unknown>);
      }
      return extractProvenance(r.records[0].get("p") as Record<string, unknown>);
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "getProvenance", targetNodeId: id, parameters: { id },
      resultSummary: { found: result !== null },
      latencyMs: Date.now() - start, success: true,
    });
    return result;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "getProvenance", targetNodeId: id, parameters: { id },
      latencyMs: Date.now() - start, success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @strvx/kg test tests/integration/get-node.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/kg/src/reads/get-node.ts packages/kg/src/reads/get-provenance.ts packages/kg/tests/integration/get-node.test.ts
git commit -m "feat(kg): getNode, getEdge, getProvenance read functions"
```

---

### Task 14: Embedding provider (OpenAI + deterministic mock)

**Files:**
- Create: `packages/kg/src/embedding/provider.ts`
- Create: `packages/kg/src/embedding/openai.ts`
- Create: `packages/kg/src/embedding/mock.ts`
- Create: `packages/kg/tests/unit/embedding.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/kg/tests/unit/embedding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMockEmbeddingProvider } from "../../src/embedding/mock.js";

describe("mock embedding provider", () => {
  it("returns deterministic 1536-dim vectors for the same input", async () => {
    const p = createMockEmbeddingProvider();
    const a = await p.embed("hello world");
    const b = await p.embed("hello world");
    expect(a.length).toBe(1536);
    expect(a).toEqual(b);
  });
  it("returns different vectors for different input", async () => {
    const p = createMockEmbeddingProvider();
    const a = await p.embed("hello");
    const b = await p.embed("world");
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `pnpm --filter @strvx/kg test tests/unit/embedding.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/kg/src/embedding/provider.ts`**

```ts
export interface EmbeddingProvider {
  modelName: string;
  modelVersion: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

- [ ] **Step 4: Implement `packages/kg/src/embedding/mock.ts`**

```ts
import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./provider.js";

/** Deterministic, content-derived pseudo-embeddings for tests. Never use in prod. */
export function createMockEmbeddingProvider(dimensions = 1536): EmbeddingProvider {
  return {
    modelName: "mock",
    modelVersion: "0.0.0",
    dimensions,
    async embed(text: string): Promise<number[]> {
      const seed = createHash("sha256").update(text).digest();
      const out = new Array<number>(dimensions);
      for (let i = 0; i < dimensions; i++) {
        const b = seed[i % seed.length];
        out[i] = (b / 255) * 2 - 1; // [-1, 1]
      }
      // L2-normalize so cosine similarity behaves like a unit-sphere comparison.
      const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0));
      return out.map((x) => x / norm);
    },
    async embedBatch(texts: string[]) {
      return Promise.all(texts.map((t) => this.embed(t)));
    },
  };
}
```

- [ ] **Step 5: Implement `packages/kg/src/embedding/openai.ts`**

```ts
import OpenAI from "openai";
import type { EmbeddingProvider } from "./provider.js";

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string; // default: text-embedding-3-small
}

export function createOpenAIEmbeddingProvider(opts: OpenAIEmbeddingOptions): EmbeddingProvider {
  const client = new OpenAI({ apiKey: opts.apiKey });
  const model = opts.model ?? "text-embedding-3-small";
  return {
    modelName: model,
    modelVersion: "v3", // family; specific version is on the OpenAI side
    dimensions: 1536,
    async embed(text: string): Promise<number[]> {
      const res = await client.embeddings.create({ model, input: text });
      return res.data[0].embedding;
    },
    async embedBatch(texts: string[]) {
      if (texts.length === 0) return [];
      const res = await client.embeddings.create({ model, input: texts });
      return res.data.map((d) => d.embedding);
    },
  };
}
```

- [ ] **Step 6: Run test**

Run: `pnpm --filter @strvx/kg test tests/unit/embedding.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/kg/src/embedding/ packages/kg/tests/unit/embedding.test.ts
git commit -m "feat(kg): embedding provider interface with OpenAI + deterministic mock"
```

---

### Task 15: `findEntities` (semantic + structured + hybrid search)

**Files:**
- Create: `packages/kg/src/reads/find-entities.ts`
- Create: `packages/kg/tests/integration/find-entities.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/kg/tests/integration/find-entities.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { createMockEmbeddingProvider } from "../../src/embedding/mock.js";
import { findEntities } from "../../src/reads/find-entities.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("findEntities", () => {
  let n4j: StartedNeo4j;
  let pg: StartedPostgres;
  let client: Neo4jClient;
  let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
      actor_kind text not null, actor_id text not null, tool text not null,
      target_node_id text, target_edge_id text,
      parameters jsonb, result_summary jsonb, latency_ms integer,
      success boolean not null, error_message text)`;
    await pg.sql`CREATE TABLE kg_embeddings (
      node_id text primary key, model_name text not null, model_version text not null,
      embedding vector(1536) not null, content_hash text not null,
      created_at timestamptz not null default now())`;
    await pg.sql`CREATE INDEX kg_embeddings_ann_idx ON kg_embeddings USING hnsw (embedding vector_cosine_ops)`;
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    sql = createPostgresClient(pg.url);

    // Seed 3 Person nodes with embeddings.
    const mock = createMockEmbeddingProvider();
    const seeds = [
      { id: "p1", name: "Ada Lovelace", snippet: "mathematician computer pioneer" },
      { id: "p2", name: "Grace Hopper", snippet: "naval officer compiler designer" },
      { id: "p3", name: "Henrietta Leavitt", snippet: "astronomer cepheid variable stars" },
    ];
    for (const s of seeds) {
      await client.write(async (tx) => {
        await tx.run(`
          CREATE (n:Person {
            id: $id, type: 'Person', name: $name, snippet: $snippet,
            prov_source_type: 'postgres', prov_source_id: $id,
            prov_source_record_id: $id, prov_extraction_method: 'cdc',
            prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
            prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0,
            prov_created_by: 'cdc'
          })
        `, s);
      });
      const v = await mock.embed(`${s.name} ${s.snippet}`);
      await sql`INSERT INTO kg_embeddings (node_id, model_name, model_version, embedding, content_hash)
                VALUES (${s.id}, 'mock', '0.0.0', ${`[${v.join(",")}]`}::vector, 'h')`;
    }
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await sql.end();
    await n4j.stop();
    await pg.stop();
  });

  it("structured search by entity type returns matching nodes", async () => {
    const r = await findEntities(
      { client, sql, ctx, embedding: createMockEmbeddingProvider() },
      "Ada",
      { mode: "structured", types: ["Person"], limit: 10 },
    );
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((x) => x.node.properties.name === "Ada Lovelace")).toBe(true);
  });

  it("semantic search returns the most similar node first", async () => {
    const r = await findEntities(
      { client, sql, ctx, embedding: createMockEmbeddingProvider() },
      "Ada Lovelace mathematician computer pioneer",
      { mode: "semantic", limit: 3 },
    );
    expect(r[0].node.properties.name).toBe("Ada Lovelace");
  });

  it("hybrid search ranks by combined score", async () => {
    const r = await findEntities(
      { client, sql, ctx, embedding: createMockEmbeddingProvider() },
      "Grace",
      { mode: "hybrid", limit: 3 },
    );
    expect(r[0].node.properties.name).toBe("Grace Hopper");
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `pnpm --filter @strvx/kg test tests/integration/find-entities.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/kg/src/reads/find-entities.ts`**

```ts
import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import type { EmbeddingProvider } from "../embedding/provider.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import { rowToNode } from "./get-node.js";
import type { AgentContext, EntityType, Node } from "../types.js";

export interface FindEntitiesDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
  embedding: EmbeddingProvider;
}

export interface FindEntitiesOptions {
  mode?: "structured" | "semantic" | "hybrid";
  types?: EntityType[];
  limit?: number;
  minTrust?: number;
}

export interface SearchResult {
  node: Node;
  score: number;
}

export async function findEntities(
  deps: FindEntitiesDeps,
  query: string,
  opts: FindEntitiesOptions = {},
): Promise<SearchResult[]> {
  assertRole(deps.ctx, "reader");
  const mode = opts.mode ?? "hybrid";
  const limit = opts.limit ?? 20;
  const minTrust = opts.minTrust ?? 0.3;
  const start = Date.now();
  try {
    const out =
      mode === "structured" ? await structured(deps, query, opts.types, limit, minTrust)
      : mode === "semantic" ? await semantic(deps, query, opts.types, limit, minTrust)
      : await hybrid(deps, query, opts.types, limit, minTrust);
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "findEntities", parameters: { query, opts },
      resultSummary: { count: out.length, mode },
      latencyMs: Date.now() - start, success: true,
    });
    return out;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "findEntities", parameters: { query, opts },
      latencyMs: Date.now() - start, success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

async function structured(
  deps: FindEntitiesDeps, query: string, types: EntityType[] | undefined,
  limit: number, minTrust: number,
): Promise<SearchResult[]> {
  const labelPart = types && types.length > 0 ? `WHERE n.type IN $types` : "";
  return deps.client.read(async (tx) => {
    const r = await tx.run(`
      MATCH (n) ${labelPart}
      WHERE toLower(coalesce(n.name, '')) CONTAINS toLower($q)
         OR toLower(coalesce(n.snippet, '')) CONTAINS toLower($q)
         OR toLower(coalesce(n.subject, '')) CONTAINS toLower($q)
      AND n.prov_trust_score >= $minTrust
      RETURN n, labels(n) AS labels LIMIT $limit
    `, { q: query, types: types ?? null, minTrust, limit: Math.floor(limit) });
    return r.records.map((rec) => ({
      node: rowToNode(rec.get("n").properties, [...rec.get("labels")]),
      score: 1,
    }));
  });
}

async function semantic(
  deps: FindEntitiesDeps, query: string, types: EntityType[] | undefined,
  limit: number, minTrust: number,
): Promise<SearchResult[]> {
  const v = await deps.embedding.embed(query);
  // 1) nearest node ids by cosine similarity from pgvector
  const vecLit = `[${v.join(",")}]`;
  const rows = await deps.sql<Array<{ node_id: string; distance: number }>>`
    SELECT node_id, embedding <=> ${vecLit}::vector AS distance
    FROM kg_embeddings
    ORDER BY embedding <=> ${vecLit}::vector
    LIMIT ${limit * 3}
  `;
  if (rows.length === 0) return [];
  // 2) fetch the nodes from Neo4j, filtering by type and trust
  const ids = rows.map((r) => r.node_id);
  return deps.client.read(async (tx) => {
    const r = await tx.run(`
      MATCH (n)
      WHERE n.id IN $ids
        AND n.prov_trust_score >= $minTrust
        ${types && types.length > 0 ? "AND n.type IN $types" : ""}
      RETURN n, labels(n) AS labels
    `, { ids, minTrust, types: types ?? null });
    const byId = new Map<string, ReturnType<typeof rowToNode>>();
    for (const rec of r.records) {
      const n = rec.get("n");
      const node = rowToNode(n.properties, [...rec.get("labels")]);
      byId.set(node.id, node);
    }
    const out: SearchResult[] = [];
    for (const row of rows) {
      const node = byId.get(row.node_id);
      if (node) out.push({ node, score: 1 - row.distance }); // distance is 0..2
      if (out.length >= limit) break;
    }
    return out;
  });
}

async function hybrid(
  deps: FindEntitiesDeps, query: string, types: EntityType[] | undefined,
  limit: number, minTrust: number,
): Promise<SearchResult[]> {
  const [s, m] = await Promise.all([
    structured(deps, query, types, limit, minTrust),
    semantic(deps, query, types, limit, minTrust),
  ]);
  // Reciprocal rank fusion (k=60) — standard hybrid retrieval combiner.
  const k = 60;
  const rrf = new Map<string, { node: Node; score: number }>();
  function fold(results: SearchResult[]) {
    results.forEach((r, i) => {
      const cur = rrf.get(r.node.id);
      const contrib = 1 / (k + i + 1);
      if (cur) cur.score += contrib;
      else rrf.set(r.node.id, { node: r.node, score: contrib });
    });
  }
  fold(s); fold(m);
  return [...rrf.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @strvx/kg test tests/integration/find-entities.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kg/src/reads/find-entities.ts packages/kg/tests/integration/find-entities.test.ts
git commit -m "feat(kg): findEntities — structured + semantic + hybrid (RRF) search"
```

---

### Task 16: `getEntityContext` (N-hop neighborhood)

**Files:**
- Create: `packages/kg/src/reads/get-entity-context.ts`
- Create: `packages/kg/tests/integration/get-entity-context.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/kg/tests/integration/get-entity-context.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { getEntityContext } from "../../src/reads/get-entity-context.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("getEntityContext", () => {
  let n4j: StartedNeo4j;
  let pg: StartedPostgres;
  let client: Neo4jClient;
  let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
      actor_kind text not null, actor_id text not null, tool text not null,
      target_node_id text, target_edge_id text,
      parameters jsonb, result_summary jsonb, latency_ms integer,
      success boolean not null, error_message text)`;
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    sql = createPostgresClient(pg.url);
    await client.write(async (tx) => {
      await tx.run(`
        CREATE (p:Person {id: 'p1', type: 'Person', name: 'Ada',
          prov_source_type: 'postgres', prov_source_id: 'p1', prov_source_record_id: '1',
          prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
          prov_last_validated_at: datetime(), prov_validation_count: 1,
          prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        CREATE (o:Organization {id: 'o1', type: 'Organization', name: 'Acme',
          prov_source_type: 'postgres', prov_source_id: 'o1', prov_source_record_id: '1',
          prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
          prov_last_validated_at: datetime(), prov_validation_count: 1,
          prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        CREATE (e:Engagement {id: 'e1', type: 'Engagement', name: 'Project',
          prov_source_type: 'postgres', prov_source_id: 'e1', prov_source_record_id: '1',
          prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
          prov_last_validated_at: datetime(), prov_validation_count: 1,
          prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        CREATE (p)-[:WORKS_AT {id: 'r1', prov_source_type: 'postgres', prov_source_id: 'r1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1, prov_trust_score: 1,
          prov_created_by: 'cdc'}]->(o)
        CREATE (o)-[:HAS_ENGAGEMENT {id: 'r2', prov_source_type: 'postgres', prov_source_id: 'r2',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1, prov_trust_score: 1,
          prov_created_by: 'cdc'}]->(e)
      `);
    });
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await sql.end();
    await pg.stop();
    await n4j.stop();
  });

  it("returns center node + neighbors within depth=1", async () => {
    const c = await getEntityContext({ client, sql, ctx }, "p1", { depth: 1 });
    expect(c.center?.id).toBe("p1");
    expect(c.nodes.map((n) => n.id).sort()).toEqual(["o1", "p1"].sort());
    expect(c.edges.map((e) => e.id)).toContain("r1");
  });

  it("expands to depth=2", async () => {
    const c = await getEntityContext({ client, sql, ctx }, "p1", { depth: 2 });
    const ids = c.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["e1", "o1", "p1"]);
    expect(c.edges.map((e) => e.id).sort()).toEqual(["r1", "r2"]);
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `pnpm --filter @strvx/kg test tests/integration/get-entity-context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/kg/src/reads/get-entity-context.ts`**

```ts
import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import { extractProvenance, rowToNode, stripProvenanceFields } from "./get-node.js";
import type { AgentContext, Edge, EntityType, Node, RelationshipType } from "../types.js";

export interface EntityContext {
  center: Node | null;
  nodes: Node[];
  edges: Edge[];
}

export interface GetEntityContextOptions {
  depth?: number; // default 2
  types?: EntityType[];
  limit?: number; // default 100
  minTrust?: number; // default 0.3
}

export async function getEntityContext(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  id: string,
  opts: GetEntityContextOptions = {},
): Promise<EntityContext> {
  assertRole(deps.ctx, "reader");
  const depth = Math.max(1, Math.min(4, opts.depth ?? 2));
  const limit = opts.limit ?? 100;
  const minTrust = opts.minTrust ?? 0.3;
  const start = Date.now();
  try {
    const out = await deps.client.read(async (tx) => {
      const r = await tx.run(`
        MATCH (center {id: $id})
        OPTIONAL MATCH p = (center)-[*1..${depth}]-(neighbor)
        WHERE all(rel IN relationships(p) WHERE rel.prov_trust_score >= $minTrust)
          AND ($types IS NULL OR neighbor.type IN $types)
        WITH center, collect(distinct neighbor) AS neighbors, collect(distinct p) AS paths
        RETURN center, labels(center) AS centerLabels, neighbors,
               [n IN neighbors | labels(n)] AS neighborLabels, paths
        LIMIT 1
      `, { id, minTrust, types: opts.types ?? null });
      if (r.records.length === 0) return { center: null, nodes: [], edges: [] } as EntityContext;
      const rec = r.records[0];
      const center = rowToNode(rec.get("center").properties, [...rec.get("centerLabels")]);
      const neighborNodes = rec.get("neighbors") as Array<{ properties: Record<string, unknown> }>;
      const neighborLabels = rec.get("neighborLabels") as string[][];
      const nodes: Node[] = [center];
      neighborNodes.forEach((n, i) => {
        nodes.push(rowToNode(n.properties, neighborLabels[i] ?? []));
      });
      const edges = new Map<string, Edge>();
      const paths = (rec.get("paths") as Array<{
        segments: Array<{ start: { properties: Record<string, unknown> }; relationship: { type: string; properties: Record<string, unknown> }; end: { properties: Record<string, unknown> } }>;
      }>);
      for (const path of paths) {
        for (const seg of path.segments) {
          const relProps = seg.relationship.properties;
          const id = relProps.id as string;
          if (!edges.has(id)) {
            edges.set(id, {
              id,
              type: seg.relationship.type as RelationshipType,
              from: seg.start.properties.id as string,
              to: seg.end.properties.id as string,
              properties: stripProvenanceFields(relProps),
              provenance: extractProvenance(relProps),
            });
          }
        }
      }
      const limitedNodes = nodes.slice(0, limit);
      const allowed = new Set(limitedNodes.map((n) => n.id));
      const limitedEdges = [...edges.values()].filter((e) => allowed.has(e.from) && allowed.has(e.to));
      return { center, nodes: limitedNodes, edges: limitedEdges };
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "getEntityContext", targetNodeId: id, parameters: { id, opts },
      resultSummary: { nodeCount: out.nodes.length, edgeCount: out.edges.length },
      latencyMs: Date.now() - start, success: true,
    });
    return out;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "getEntityContext", targetNodeId: id, parameters: { id, opts },
      latencyMs: Date.now() - start, success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @strvx/kg test tests/integration/get-entity-context.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kg/src/reads/get-entity-context.ts packages/kg/tests/integration/get-entity-context.test.ts
git commit -m "feat(kg): getEntityContext N-hop neighborhood with trust filtering"
```

---

### Task 17: `findSimilar` and `traverse`

**Files:**
- Create: `packages/kg/src/reads/find-similar.ts`
- Create: `packages/kg/src/reads/traverse.ts`
- Create: `packages/kg/tests/integration/find-similar.test.ts`
- Create: `packages/kg/tests/integration/traverse.test.ts`

- [ ] **Step 1: Write `findSimilar` failing test**

Create `packages/kg/tests/integration/find-similar.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { createMockEmbeddingProvider } from "../../src/embedding/mock.js";
import { findSimilar } from "../../src/reads/find-similar.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("findSimilar", () => {
  let n4j: StartedNeo4j; let pg: StartedPostgres;
  let client: Neo4jClient; let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j(); pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
      actor_kind text not null, actor_id text not null, tool text not null,
      target_node_id text, target_edge_id text,
      parameters jsonb, result_summary jsonb, latency_ms integer,
      success boolean not null, error_message text)`;
    await pg.sql`CREATE TABLE kg_embeddings (
      node_id text primary key, model_name text not null, model_version text not null,
      embedding vector(1536) not null, content_hash text not null,
      created_at timestamptz not null default now())`;
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    sql = createPostgresClient(pg.url);
    const mock = createMockEmbeddingProvider();
    for (const s of [
      { id: "p1", text: "Ada mathematician computer pioneer" },
      { id: "p2", text: "Grace compiler naval officer" },
      { id: "p3", text: "Henrietta astronomer cepheid variable" },
    ]) {
      await client.write(async (tx) => {
        await tx.run(`
          CREATE (n:Person {id: $id, type: 'Person', snippet: $text,
            prov_source_type: 'postgres', prov_source_id: $id, prov_source_record_id: $id,
            prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
            prov_last_validated_at: datetime(), prov_validation_count: 1,
            prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        `, s);
      });
      const v = await mock.embed(s.text);
      await sql`INSERT INTO kg_embeddings (node_id, model_name, model_version, embedding, content_hash)
                VALUES (${s.id}, 'mock', '0.0.0', ${`[${v.join(",")}]`}::vector, 'h')`;
    }
  }, 120_000);

  afterAll(async () => {
    await client.close(); await sql.end(); await n4j.stop(); await pg.stop();
  });

  it("returns nearest other nodes by embedding cosine similarity", async () => {
    const r = await findSimilar(
      { client, sql, ctx, embedding: createMockEmbeddingProvider() },
      "p1",
      { limit: 2 },
    );
    expect(r.length).toBe(2);
    // p1 itself is excluded; nearest of the remaining two ranks first.
    expect(r.map((x) => x.node.id)).not.toContain("p1");
  });
});
```

- [ ] **Step 2: Implement `packages/kg/src/reads/find-similar.ts`**

```ts
import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import type { EmbeddingProvider } from "../embedding/provider.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import { rowToNode } from "./get-node.js";
import type { AgentContext, EntityType, Node } from "../types.js";

export interface FindSimilarDeps {
  client: Neo4jClient; sql: PostgresClient; ctx: AgentContext; embedding: EmbeddingProvider;
}

export interface FindSimilarOptions { scope?: EntityType[]; limit?: number }

export interface SimilarEntity { node: Node; score: number }

export async function findSimilar(
  deps: FindSimilarDeps, entityId: string, opts: FindSimilarOptions = {},
): Promise<SimilarEntity[]> {
  assertRole(deps.ctx, "reader");
  const limit = opts.limit ?? 10;
  const start = Date.now();
  try {
    const row = await deps.sql<Array<{ embedding: string }>>`
      SELECT embedding::text AS embedding FROM kg_embeddings WHERE node_id = ${entityId} LIMIT 1`;
    if (row.length === 0) return [];
    const vec = row[0].embedding; // already a vector literal "[...]"
    const neighbors = await deps.sql<Array<{ node_id: string; distance: number }>>`
      SELECT node_id, embedding <=> ${vec}::vector AS distance
      FROM kg_embeddings
      WHERE node_id <> ${entityId}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit * 3}
    `;
    if (neighbors.length === 0) return [];
    const ids = neighbors.map((n) => n.node_id);
    const out = await deps.client.read(async (tx) => {
      const r = await tx.run(`
        MATCH (n) WHERE n.id IN $ids
          ${opts.scope && opts.scope.length > 0 ? "AND n.type IN $scope" : ""}
        RETURN n, labels(n) AS labels
      `, { ids, scope: opts.scope ?? null });
      const byId = new Map<string, Node>();
      for (const rec of r.records) {
        const n = rec.get("n");
        const node = rowToNode(n.properties, [...rec.get("labels")]);
        byId.set(node.id, node);
      }
      const ranked: SimilarEntity[] = [];
      for (const ne of neighbors) {
        const node = byId.get(ne.node_id);
        if (node) ranked.push({ node, score: 1 - ne.distance });
        if (ranked.length >= limit) break;
      }
      return ranked;
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "findSimilar", targetNodeId: entityId, parameters: { entityId, opts },
      resultSummary: { count: out.length },
      latencyMs: Date.now() - start, success: true,
    });
    return out;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "findSimilar", targetNodeId: entityId, parameters: { entityId, opts },
      latencyMs: Date.now() - start, success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
```

- [ ] **Step 3: Run `findSimilar` test**

Run: `pnpm --filter @strvx/kg test tests/integration/find-similar.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `traverse` failing test**

Create `packages/kg/tests/integration/traverse.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { traverse } from "../../src/reads/traverse.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("traverse", () => {
  let n4j: StartedNeo4j; let pg: StartedPostgres;
  let client: Neo4jClient; let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j(); pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
      actor_kind text not null, actor_id text not null, tool text not null,
      target_node_id text, target_edge_id text,
      parameters jsonb, result_summary jsonb, latency_ms integer,
      success boolean not null, error_message text)`;
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    sql = createPostgresClient(pg.url);
    await client.write(async (tx) => {
      await tx.run(`
        CREATE (p:Person {id: 'p1', type: 'Person', name: 'Ada',
          prov_source_type: 'postgres', prov_source_id: 'p1', prov_source_record_id: '1',
          prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
          prov_last_validated_at: datetime(), prov_validation_count: 1,
          prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        CREATE (o:Organization {id: 'o1', type: 'Organization', name: 'Acme',
          prov_source_type: 'postgres', prov_source_id: 'o1', prov_source_record_id: '1',
          prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
          prov_last_validated_at: datetime(), prov_validation_count: 1,
          prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        CREATE (p)-[:WORKS_AT {id: 'r1', prov_source_type: 'postgres', prov_source_id: 'r1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1, prov_trust_score: 1,
          prov_created_by: 'cdc'}]->(o)
      `);
    });
  }, 120_000);

  afterAll(async () => {
    await client.close(); await sql.end(); await n4j.stop(); await pg.stop();
  });

  it("traverses by relationship type", async () => {
    const r = await traverse(
      { client, sql, ctx },
      "p1",
      { relationshipTypes: ["WORKS_AT"], direction: "outgoing", maxDepth: 1 },
    );
    expect(r.nodes.find((n) => n.id === "o1")).toBeDefined();
    expect(r.edges.find((e) => e.id === "r1")).toBeDefined();
  });
});
```

- [ ] **Step 5: Implement `packages/kg/src/reads/traverse.ts`**

```ts
import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import { extractProvenance, rowToNode, stripProvenanceFields } from "./get-node.js";
import type { AgentContext, Edge, Node, RelationshipType } from "../types.js";

export interface TraversalPattern {
  relationshipTypes?: RelationshipType[];
  direction?: "incoming" | "outgoing" | "any";
  maxDepth?: number;
}

export interface TraversalResult { nodes: Node[]; edges: Edge[] }

export async function traverse(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  startId: string,
  pattern: TraversalPattern,
): Promise<TraversalResult> {
  assertRole(deps.ctx, "reader");
  const dir = pattern.direction ?? "any";
  const depth = Math.max(1, Math.min(4, pattern.maxDepth ?? 2));
  const relTypes = pattern.relationshipTypes ?? [];
  const relPart = relTypes.length > 0 ? `:${relTypes.join("|")}` : "";
  const start = Date.now();
  let cypher: string;
  if (dir === "outgoing")
    cypher = `MATCH (s {id:$id})-[r${relPart}*1..${depth}]->(n) RETURN r, n, labels(n) AS labels`;
  else if (dir === "incoming")
    cypher = `MATCH (s {id:$id})<-[r${relPart}*1..${depth}]-(n) RETURN r, n, labels(n) AS labels`;
  else
    cypher = `MATCH (s {id:$id})-[r${relPart}*1..${depth}]-(n) RETURN r, n, labels(n) AS labels`;
  try {
    const result = await deps.client.read(async (tx) => {
      const r = await tx.run(cypher, { id: startId });
      const nodes = new Map<string, Node>();
      const edges = new Map<string, Edge>();
      for (const rec of r.records) {
        const n = rec.get("n");
        const node = rowToNode(n.properties, [...rec.get("labels")]);
        nodes.set(node.id, node);
        const relPath = rec.get("r") as Array<{ properties: Record<string, unknown>; type: string; start: unknown; end: unknown }>;
        for (const rel of relPath) {
          const props = rel.properties;
          const id = props.id as string;
          if (!edges.has(id)) {
            // For relationship objects we don't get from/to ids directly without resolving;
            // do a follow-up query to resolve once per unique edge.
            edges.set(id, {
              id,
              type: rel.type as RelationshipType,
              from: "", to: "",
              properties: stripProvenanceFields(props),
              provenance: extractProvenance(props),
            });
          }
        }
      }
      if (edges.size > 0) {
        const ids = [...edges.keys()];
        const r2 = await tx.run(
          "MATCH (a)-[r]->(b) WHERE r.id IN $ids RETURN r.id AS id, a.id AS fromId, b.id AS toId",
          { ids },
        );
        for (const rec of r2.records) {
          const edge = edges.get(rec.get("id") as string);
          if (edge) {
            edge.from = rec.get("fromId") as string;
            edge.to = rec.get("toId") as string;
          }
        }
      }
      return { nodes: [...nodes.values()], edges: [...edges.values()] };
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "traverse", targetNodeId: startId, parameters: { startId, pattern },
      resultSummary: { nodeCount: result.nodes.length, edgeCount: result.edges.length },
      latencyMs: Date.now() - start, success: true,
    });
    return result;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "traverse", targetNodeId: startId, parameters: { startId, pattern },
      latencyMs: Date.now() - start, success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
```

- [ ] **Step 6: Run both tests**

Run: `pnpm --filter @strvx/kg test tests/integration/find-similar.test.ts tests/integration/traverse.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/kg/src/reads/find-similar.ts packages/kg/src/reads/traverse.ts packages/kg/tests/integration/find-similar.test.ts packages/kg/tests/integration/traverse.test.ts
git commit -m "feat(kg): findSimilar and traverse read functions"
```

---

### Task 18: `getAuditLog`

**Files:**
- Create: `packages/kg/src/reads/get-audit-log.ts`
- Create: `packages/kg/tests/integration/get-audit-log.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/kg/tests/integration/get-audit-log.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgres } from "@strvx/kg/testing";
import { startPostgres } from "@strvx/kg/testing";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { writeAuditEntry } from "../../src/audit/writer.js";
import { getAuditLog } from "../../src/reads/get-audit-log.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("getAuditLog", () => {
  let pg: StartedPostgres; let sql: PostgresClient;
  beforeAll(async () => {
    pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
      actor_kind text not null, actor_id text not null, tool text not null,
      target_node_id text, target_edge_id text,
      parameters jsonb, result_summary jsonb, latency_ms integer,
      success boolean not null, error_message text)`;
    sql = createPostgresClient(pg.url);
    for (let i = 0; i < 3; i++) {
      await writeAuditEntry(sql, {
        actorKind: "agent", actorId: "cos",
        tool: "getNode", targetNodeId: "x1",
        parameters: { i }, success: true, latencyMs: 10 + i,
      });
    }
  }, 120_000);
  afterAll(async () => { await sql.end(); await pg.stop(); });

  it("returns recent entries for a node id newest first", async () => {
    const r = await getAuditLog({ sql, ctx }, "x1", { limit: 10 });
    expect(r.length).toBe(3);
    expect(r[0].latencyMs).toBe(12); // newest
  });
});
```

- [ ] **Step 2: Implement `packages/kg/src/reads/get-audit-log.ts`**

```ts
import type { PostgresClient } from "../client/postgres.js";
import { assertRole } from "../auth/middleware.js";
import type { AgentContext } from "../types.js";

export interface AuditQueryOpts { since?: Date; limit?: number }

export interface AuditEntryRow {
  id: string;
  occurredAt: Date;
  actorKind: string;
  actorId: string;
  tool: string;
  targetNodeId: string | null;
  targetEdgeId: string | null;
  parameters: Record<string, unknown> | null;
  resultSummary: Record<string, unknown> | null;
  latencyMs: number | null;
  success: boolean;
  errorMessage: string | null;
}

export async function getAuditLog(
  deps: { sql: PostgresClient; ctx: AgentContext },
  targetId: string,
  opts: AuditQueryOpts = {},
): Promise<AuditEntryRow[]> {
  assertRole(deps.ctx, "reader");
  const limit = opts.limit ?? 100;
  const since = opts.since ?? new Date(0);
  const rows = await deps.sql<Array<{
    id: string; occurred_at: Date; actor_kind: string; actor_id: string; tool: string;
    target_node_id: string | null; target_edge_id: string | null;
    parameters: Record<string, unknown> | null; result_summary: Record<string, unknown> | null;
    latency_ms: number | null; success: boolean; error_message: string | null;
  }>>`
    SELECT id::text, occurred_at, actor_kind, actor_id, tool, target_node_id, target_edge_id,
           parameters, result_summary, latency_ms, success, error_message
    FROM kg_audit_log
    WHERE (target_node_id = ${targetId} OR target_edge_id = ${targetId})
      AND occurred_at >= ${since}
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id, occurredAt: r.occurred_at, actorKind: r.actor_kind, actorId: r.actor_id,
    tool: r.tool, targetNodeId: r.target_node_id, targetEdgeId: r.target_edge_id,
    parameters: r.parameters, resultSummary: r.result_summary,
    latencyMs: r.latency_ms, success: r.success, errorMessage: r.error_message,
  }));
}
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @strvx/kg test tests/integration/get-audit-log.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/kg/src/reads/get-audit-log.ts packages/kg/tests/integration/get-audit-log.test.ts
git commit -m "feat(kg): getAuditLog read function"
```

---

### Task 19: Public API barrel + coverage gate

**Files:**
- Modify: `packages/kg/src/index.ts`

- [ ] **Step 1: Update `packages/kg/src/index.ts` to expose the v1 surface**

```ts
// Types
export * from "./types.js";

// Clients (consumers usually don't import directly; exposed for advanced use)
export { createNeo4jClient } from "./client/neo4j.js";
export type { Neo4jClient } from "./client/neo4j.js";
export { createPostgresClient } from "./client/postgres.js";
export type { PostgresClient } from "./client/postgres.js";

// Auth
export { callerFromHeaders } from "./auth/context.js";
export { assertRole, assertWriteScope, KgAuthError } from "./auth/middleware.js";

// Provenance
export {
  buildProvenance,
  computeTrustScore,
  DEFAULT_HALF_LIFE_DAYS,
  DEFAULT_SOURCE_RELIABILITY,
} from "./provenance/compute.js";

// Audit
export { writeAuditEntry } from "./audit/writer.js";
export type { AuditEntry } from "./audit/writer.js";

// Cypher (read-only escape)
export { runCypher } from "./cypher/run.js";
export type { CypherResult } from "./cypher/run.js";
export { assertReadOnly, CypherWriteAttemptError } from "./cypher/validate.js";

// Embedding
export { createOpenAIEmbeddingProvider } from "./embedding/openai.js";
export { createMockEmbeddingProvider } from "./embedding/mock.js";
export type { EmbeddingProvider } from "./embedding/provider.js";

// Reads
export { getNode, getEdge } from "./reads/get-node.js";
export { getProvenance } from "./reads/get-provenance.js";
export { findEntities } from "./reads/find-entities.js";
export type { SearchResult, FindEntitiesOptions } from "./reads/find-entities.js";
export { findSimilar } from "./reads/find-similar.js";
export type { SimilarEntity, FindSimilarOptions } from "./reads/find-similar.js";
export { getEntityContext } from "./reads/get-entity-context.js";
export type { EntityContext, GetEntityContextOptions } from "./reads/get-entity-context.js";
export { traverse } from "./reads/traverse.js";
export type { TraversalPattern, TraversalResult } from "./reads/traverse.js";
export { getAuditLog } from "./reads/get-audit-log.js";
export type { AuditEntryRow, AuditQueryOpts } from "./reads/get-audit-log.js";
```

- [ ] **Step 2: Run full test suite with coverage**

Run: `pnpm --filter @strvx/kg test --coverage`
Expected: PASS, coverage thresholds met (lines ≥ 90, functions ≥ 90, branches ≥ 85). If a threshold is missed, add tests until it passes — list the uncovered lines from the coverage report and write targeted unit tests.

- [ ] **Step 3: Typecheck the whole package**

Run: `pnpm --filter @strvx/kg typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/kg/src/index.ts
git commit -m "feat(kg): export v1 public API surface"
```

---

### Task 20: Month 1 acceptance — Chief of Staff dev can build against the SDK

**Files:**
- Create: `docs/superpowers/plans/kg-month1-acceptance.md`

- [ ] **Step 1: Author the acceptance doc**

Create `docs/superpowers/plans/kg-month1-acceptance.md`:

```markdown
# KG Month 1 Acceptance

## What is shippable now

- `packages/kg` published as a workspace package.
- `@strvx/kg` exposes: types, Neo4j + Postgres clients, auth, provenance,
  audit writer, read-only `runCypher`, `getNode`, `getEdge`, `getProvenance`,
  `findEntities` (structured + semantic + hybrid), `findSimilar`,
  `getEntityContext`, `traverse`, `getAuditLog`, embedding providers.
- Neo4j Aura DS instance provisioned (RW + RO users).
- Postgres KG tables exist in `@strvx/db` (`kg_embeddings`, `kg_resolver_cache`,
  `kg_audit_log`, `kg_credentials`, `agent_credentials`).
- ESLint rule prevents `neo4j-driver` imports outside `packages/kg`.
- Test coverage on `packages/kg` ≥ 90% lines / 90% functions / 85% branches.

## What the other agent (Chief of Staff) can do now

- Manually insert a few sample nodes via Neo4j Browser to develop and test
  agent prompts against the read API.
- Use `runCypher` (read-only) from a long-lived REPL, with audit log enabled.
- Implement and test agent flows that consume `getEntityContext`, `findEntities`,
  `findSimilar`, `traverse`, and `getProvenance`.

## What is NOT yet available (deferred to Month 2+)

- No write functions yet — `recordObservation`, `recordDecision`, `recordPlan`,
  `linkEntities` ship in Month 2.
- No CDC from Postgres yet — graph is empty unless seeded manually.
- No MCP server yet — Chief of Staff must call the SDK directly or via HTTP
  shim it implements.
- No management UI yet.

## Smoke-test checklist

- [ ] `pnpm --filter @strvx/kg test` is green locally.
- [ ] CI runs the same and green.
- [ ] A throwaway script can connect to Aura DS, write a `Person` node,
      and read it back via `getNode` from a local developer machine.
- [ ] Audit entries appear in Postgres for every read.
```

- [ ] **Step 2: Run the live smoke test**

Write and execute (do not commit) `scripts/kg-smoke.ts` that:
1. Connects to Aura DS with the RW user.
2. Creates a `Person` node with provenance via raw Cypher.
3. Reads it back through `getNode`.
4. Logs the result.
Tear down the node and the script.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/kg-month1-acceptance.md
git commit -m "docs(kg): Month 1 acceptance criteria"
```

---

## Phase 2 — Month 2 (Ingestion): skeleton outline

Each item is a task-sized scope, not a full plan. Full task expansion happens after Month 1 ships and the open questions are answered.

1. **Postgres logical replication setup.** Enable `wal_level=logical` (Supabase already does), publish all KG-relevant tables, create a dedicated `kg_cdc_slot` with `wal2json` output. Add a Drizzle migration that creates the publication. Include a manual runbook for slot recovery.
2. **`apps/kg-ingestor` skeleton.** New Fly.io app. Node.js entry, structured logging, health endpoint, graceful shutdown on SIGTERM. Imports `@strvx/kg`.
3. **CDC consumer worker.** Consume `wal2json` replication stream; parse to typed change events; dispatch to mapping config; ack LSN after Neo4j write completes (Postgres logical-replication "synchronous" ack model). Backoff + replay logic.
4. **Mapping config: `packages/kg/src/mappings/postgres.ts`.** Declarative map from Postgres tables → graph entities, FKs → relationships, columns → properties. Each entry is data; tests are golden-file: `row → expected (node, edges)`.
5. **Mapping tests.** For every mapped table, a golden file: input row + expected upserts. CI fails when a `packages/db` schema change has no corresponding mapping update.
6. **`upsertFromPostgres`.** Function in `packages/kg/src/writes/` that takes a parsed change event and applies it idempotently in Neo4j via `MERGE`. Provenance computed from source row + mapping defaults.
7. **Stub-or-upgrade for FK dependencies.** When a row references an unseen parent, create a stub node with `is_stub=true, confidence=0.5`. CDC for the parent later upgrades it.
8. **Idempotency & replay tests.** Replay a fixed slot from offset 0 produces identical Neo4j state.
9. **Initial backfill script.** Topologically ordered scan that emits synthetic CDC events for existing rows. Resumable, runs in hours.
10. **Agent memory write functions.** `recordObservation`, `recordDecision`, `recordPlan`, `linkEntities`, `supersedeDecision`. Each: builds provenance, runs conflict detection, writes Neo4j + audit. Uses Anthropic Claude for conflict detection (LLM-judged semantic conflict on subject+timeframe).
11. **Deterministic ER.** Match by email, GitHub login, Stripe customer ID, Mercury account ID. Merge into existing node, increment `validation_count`.
12. **Probabilistic ER worker.** Periodic job — scan recent nodes for candidate matches (name similarity + co-occurrence). Auto-merge above 0.97 with `MERGED_FROM`; queue 0.85-0.97 as proposals.
13. **`MERGED_FROM` reversibility.** Helper functions to inspect and unwind a merge.
14. **End-to-end CDC integration tests.** Use testcontainers Postgres with `wal_level=logical` + Neo4j; insert a row in Postgres, assert the corresponding node appears in Neo4j within 5 seconds.
15. **Deploy `kg-ingestor` to Fly.io.** Single instance (replication slot consumer). Fly secrets configured. Production smoke test inserts a test row and verifies graph appearance.
16. **Month 2 acceptance.** Real strvx Postgres data flowing into Aura DS. Chief of Staff can ask "tell me about client X" and get back the materialized core.

---

## Phase 3 — Month 3 (Agent surface + UI MVP): skeleton outline

1. **`apps/kg-mcp` skeleton.** New Fly.io app. MCP server over HTTP+SSE. Uses `@modelcontextprotocol/sdk`. Auth middleware validates API keys against `agent_credentials` table.
2. **MCP tool catalog wiring.** One MCP tool per `@strvx/kg` public function. Tool descriptions steer toward curated tools over `kg_run_cypher`.
3. **Rate limiting.** Per-agent token bucket. Default 60/min, configurable in `agent_credentials.rate_limit_per_minute`.
4. **Deploy `kg-mcp` to Fly.io.** Public ingress + API key auth. Fly health checks.
5. **Virtual-edge resolver: GitHub.** API client, repo-scoped reads, commit/PR/issue ingestion with embeddings. Cache fetched content in `kg_resolver_cache`. Webhook ingestion for cache invalidation.
6. **Virtual-edge resolver: Gmail.** API client, mailbox-scoped reads, thread/message ingestion with embeddings. Snippet + headers only; bodies fetched on demand.
7. **`getContent(nodeId)` implementation.** Hits cache; on miss, dispatches to source-specific resolver; stores; returns content with `is_stale` flag.
8. **UI: `/knowledge` shell.** Next.js route layout, sidebar integration in existing internal app, breadcrumbs.
9. **UI: Overview surface (`/knowledge`).** Six tiles per spec §6 Surface 1.
10. **UI: Search surface (`/knowledge/search`).** Single search box, mode toggle (hybrid/semantic/structured), filters, ranked results.
11. **UI: Entity detail surface (`/knowledge/entity/[id]`).** Four tabs: Overview, Edges, Provenance, Activity. Scrubbable time slider on Activity.
12. **UI: Graph browser surface (`/knowledge/browse`).** React Flow integration. New dep: `reactflow`. Filter panel + neighborhood expansion.
13. **UI: Community-detection summary view.** When > 500 visible nodes, switch to Louvain clusters via Neo4j GDS; clusters drillable.
14. **Month 3 acceptance.** Chief of Staff agent integrates against `apps/kg-mcp` and answers a real strvx question end-to-end. UI MVP usable for navigating the graph.

---

## Phase 4 — Month 4 (Self-improvement + polish + GA): skeleton outline

1. **Worker 1: Trust decay.** Hourly. Recomputes `trust_score` per the formula. Hides `trust_score < 0.3` from default queries.
2. **Worker 2: Ontology evolution.** Daily. LLM proposes new entity/relationship/property types from observed data. Writes `SchemaProposal` nodes. Approval queue feeds back into worker (rejected proposals are remembered).
3. **Worker 3: ER learning.** Every 6 hours. Mid-confidence merge proposals queue; high-confidence auto-merges. Human approve/reject reinforces matcher feature weights.
4. **Worker 4: Memory consolidation.** Nightly short→mid (`Observation` rollups into `Summary`); weekly mid→long (into `LongTermInsight`). Decisions never consolidated. LLM-driven via Anthropic Claude.
5. **Worker 5: Usage weighting.** Continuous traversal logging (10% sample; 100% for `runCypher`). Nightly aggregation updates `traverse_count`/`read_count`. Cold-subgraph archival (`archived=true`).
6. **Worker 6: Pattern extraction.** Weekly. Canned + LLM-suggested graph queries find statistical regularities; outputs `Pattern` nodes with `EXTRACTED_FROM` evidence edges; approval queue gates visibility.
7. **Worker scheduling infrastructure.** Cron loops inside `kg-ingestor`. Worker registry, per-worker pause toggle in `kg_settings` table, per-worker budget caps for LLM cost.
8. **UI: Approval queues surface (`/knowledge/queues`).** Three tabs (ontology / ER / patterns). Unified card UX. "Ask the agent" side panel.
9. **UI: Health surface (`/knowledge/health`).** CDC lag, resolver queue, query p50/p95/p99, trust distribution histogram, worker status table.
10. **UI: Settings surface (`/knowledge/settings`).** Integrations toggle, trust config, agent permissions (rotate/revoke API keys), retention policies, backup/export.
11. **UI: Audit surface (`/knowledge/audit`).** Filterable read/write timeline.
12. **OpenTelemetry instrumentation.** Tracing across MCP → `packages/kg` → Neo4j/Postgres. Histograms for tool latency.
13. **Alerting setup.** Page-worthy conditions configured in Sentry/whatever monitoring strvx is on: CDC lag > 60s, ingestor errors > 5%, Neo4j unreachable, MCP p99 > 1s sustained, trust-decay missed run.
14. **Performance load testing.** 1k-node fixture graph; assert SLOs (CDC lag p99, query p95, write p95). Iterate indexes until met.
15. **Production hardening.** Sentry breadcrumbs on every tool call. Circuit breaker on `kg-mcp`. Graceful degradation paths.
16. **Chief of Staff cutover.** Switch agent's primary memory source from whatever it was using to `@strvx/kg`. Migration plan for any prior agent memory data.
17. **Month 4 acceptance / GA.** All Tier-1 workers running. Approval queues live. All eight UI surfaces shipped. SLOs validated. Chief of Staff is fully on the graph.

---

## Cross-cutting concerns

- **Deterministic tests:** seed any `Date.now()` / `Math.random()` via mocks. LLM calls in tests must use recorded fixture responses (vitest's `expect.fn` + a `LLMProvider` interface that can be swapped to a `MockLLMProvider`).
- **Frequent commits:** every task above ends in a commit. Months 2-4 follow the same TDD-then-commit pattern when their full plans are written.
- **Documentation:** any new env var, runbook, or breaking decision gets a doc in `docs/superpowers/plans/` (e.g. `kg-neo4j-provisioning.md`, `kg-month1-acceptance.md`).

## Self-review (post-write)

- **Spec coverage:** Sections 1-7 of `2026-05-11-strvx-knowledge-graph-design.md` map to Phase 1 (foundation + reads), Phase 2 (ingestion), Phase 3 (agent surface + UI MVP), Phase 4 (self-improvement + UI completion + ops). No spec section is unaddressed.
- **Placeholder scan:** Month 1 (Phase 1) is fully concrete — no TBDs, no "implement later" placeholders. Months 2-4 are explicitly skeleton outlines (per user request) and reference back to spec §3-§7 for detail; each will be expanded to a full task plan post-Month-1 ship.
- **Type consistency:** `ReadDeps` is defined in `reads/get-node.ts` and re-used by `getProvenance` (re-exports the type). `Neo4jClient` and `PostgresClient` are defined once and imported elsewhere. `EntityType`, `RelationshipType`, `Provenance`, `AgentContext` are defined in `types.ts` and referenced consistently.
