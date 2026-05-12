# @strvx/kg

TypeScript SDK for the strvx knowledge graph. The only writer to Neo4j across the monorepo. Consumed by `apps/internal`, the (future) `apps/kg-mcp` MCP server, and `apps/kg-ingestor` (Month 2+).

## What ships in Month 1 (current)

Read-side substrate:

- **Types** — full ontology (22 entity types, 26 relationship types including Tier-3 reserved hooks `PREDICTS` / `CAUSED` / `COUNTERFACTUAL_OF`).
- **Clients** — `createNeo4jClient` (separate RW + RO drivers; methods named `unsafeWrite` / `unsafeRawSession` to make abuse loud), `createPostgresClient`.
- **Auth** — `assertRole`, `assertWriteScope`, `buildAgentContext`, `KgAuthError`. `assertRole` rejects unknown role strings.
- **Provenance + trust** — `buildProvenance`, `computeTrustScore` (confidence × source_reliability × age_decay × validation_factor, capped 1.5×), `DEFAULT_HALF_LIFE_DAYS`, `DEFAULT_SOURCE_RELIABILITY`.
- **Audit** — `writeAuditEntry`. Every read function audits itself on both success and failure.
- **Cypher (read-only escape)** — `runCypher`, `assertReadOnly` (literal-aware tokenizer; forbids `CREATE`, `MERGE`, `SET`, `DELETE`, `REMOVE`, `LOAD CSV`), `CypherWriteAttemptError`, `CypherMalformedError`.
- **Embedding providers** — `createOpenAIEmbeddingProvider`, `createMockEmbeddingProvider` (deterministic SHA-256, L2-normalized; tests).
- **Reads** — `getNode`, `getEdge`, `getProvenance`, `findEntities` (structured + semantic + hybrid via reciprocal-rank fusion), `findSimilar`, `getEntityContext`, `traverse`, `getAuditLog`. All respect `minTrust` (default 0.3).

## What does NOT ship in Month 1

| Surface | Ships in |
|---|---|
| Agent memory writes (`recordObservation`, `recordDecision`, `recordPlan`, `linkEntities`) | Month 2 |
| Postgres CDC → graph pipeline (`apps/kg-ingestor`) | Month 2 |
| MCP server (`apps/kg-mcp`) | Month 3 |
| Virtual-edge resolvers (`getContent`, `hasContent`) | Month 3 |
| `/knowledge` management UI in `apps/internal` | Month 3 |
| Self-improvement workers (trust decay, ontology evolution, ER learning, memory consolidation, usage weighting, pattern extraction) | Month 4 |

## Boundary rule

**`@strvx/kg` is the only writer to Neo4j.** Direct `neo4j-driver` imports and `createNeo4jClient` / `Neo4jClient` named imports from `@strvx/kg` are forbidden outside `packages/kg/`. The ESLint rule `kg/no-neo4j-outside-kg` enforces this at lint time. Consumers use the curated read/write functions.

## Quick start

```ts
import {
  createNeo4jClient,
  createPostgresClient,
  createOpenAIEmbeddingProvider,
  findEntities,
  getEntityContext,
  type AgentContext,
} from "@strvx/kg";

const client = createNeo4jClient({
  uri: process.env.NEO4J_URI!,
  rw: { user: process.env.NEO4J_USER_RW!, password: process.env.NEO4J_PASSWORD_RW! },
  ro: { user: process.env.NEO4J_USER_RO!, password: process.env.NEO4J_PASSWORD_RO! },
});
const sql = createPostgresClient(process.env.DATABASE_URL!);
const embedding = createOpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! });

const ctx: AgentContext = { actorKind: "agent", actorId: "cos", role: "reader" };

const hits = await findEntities(
  { client, sql, ctx, embedding },
  "Ada Lovelace",
  { mode: "hybrid", types: ["Person"], limit: 10 },
);

const context = await getEntityContext({ client, sql, ctx }, hits[0].node.id, { depth: 2 });
```

## Running tests

```bash
# Unit tests (no Docker)
pnpm --filter @strvx/kg test tests/unit

# Full suite (requires Docker for testcontainers Neo4j + pgvector)
pnpm --filter @strvx/kg test

# With coverage (also requires Docker)
pnpm --filter @strvx/kg test --coverage
```

Integration tests run serially via `fileParallelism: false` and a single-fork pool — parallel execution exhausts Colima resources.

## Required environment

| Var | Used by |
|---|---|
| `NEO4J_URI` | All consumers (`bolt+s://...`) |
| `NEO4J_USER_RW`, `NEO4J_PASSWORD_RW` | RW driver |
| `NEO4J_USER_RO`, `NEO4J_PASSWORD_RO` | RO driver (`runCypher` escape) |
| `OPENAI_API_KEY` | `createOpenAIEmbeddingProvider` |
| `DATABASE_URL` | `createPostgresClient` (matches `@strvx/db`) |

See `docs/superpowers/plans/kg-neo4j-provisioning.md` for the Aura DS runbook.

## Reference docs

- Design spec: `docs/superpowers/specs/2026-05-11-strvx-knowledge-graph-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-11-strvx-knowledge-graph.md`
- Month 1 acceptance: `docs/superpowers/plans/kg-month1-acceptance.md`
- Aura provisioning: `docs/superpowers/plans/kg-neo4j-provisioning.md`
