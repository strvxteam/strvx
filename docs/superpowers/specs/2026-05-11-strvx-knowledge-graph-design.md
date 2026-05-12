# strvx Knowledge Graph — Design Spec

**Date:** 2026-05-11
**Status:** Design approved, pending implementation plan
**Scope:** New `packages/kg`, new `apps/kg-mcp`, new `apps/kg-ingestor`, new `/knowledge` surface in `apps/internal`, schema additions to existing Postgres, new Neo4j Aura DS instance.

## Goal

Build a unified knowledge graph that the Chief of Staff agent (and future strvx agents) can use as a single substrate for **retrieval**, **reasoning**, and **memory**. The graph plugs into strvx's existing Postgres, external SaaS integrations (Gmail, Calendar, Mercury, Stripe, Slack), GitHub repos, and agent history. It self-improves over time as it is used.

## Audience

- **Primary agent consumer:** Chief of Staff agent (built in parallel by another agent against this spec's API contract).
- **Future agent consumers:** sales agent, ops agent, finance agent, growth agent (multi-agent ready in v1, single-agent in practice).
- **Human users:** Nicolas + Alex today; future strvx hires and contractors managing the graph and reviewing approval queues.

## Foundational Decisions (locked during design)

1. **Unified layer.** The graph serves retrieval + reasoning + memory in one substrate, not three separate systems.
2. **Hybrid sync.** Postgres + agent memory are materialized into the graph (CDC). GitHub repos and full Gmail history stay virtualized — metadata + embeddings are indexed; content is fetched on demand and cached.
3. **Tier 1 self-improvement in v1.** Six mechanisms ship in v1 (ontology evolution, entity resolution learning, memory consolidation, usage-weighted importance, pattern extraction, provenance & trust scoring). Architecture preserves hooks for Tier 2 (months 5–8) and Tier 3 (months 9–14) without rework.
4. **Storage substrate: Neo4j + Postgres + pgvector.** Postgres remains source of truth for operational data. Neo4j is the graph layer (Cypher + Graph Data Science library). pgvector stores embeddings keyed by Neo4j node ID.
5. **Agent API: MCP server + TypeScript SDK from a shared core.** `packages/kg` is the single library; `apps/kg-mcp` is a thin protocol wrapper. The internal app imports the SDK directly.
6. **Management UI in `apps/internal` under `/knowledge`.** Eight surfaces. Single auth, native to the existing internal app.

## Out of Scope (v1)

- **Event-sourcing the platform.** Postgres remains the operational source of truth.
- **Tier 2 mechanisms** (agent-driven gap filling, continuous re-embedding, self-documenting graph generation, multi-agent disagreement triage UI).
- **Tier 3 mechanisms** (autonomous schema design, predictive edges, adversarial self-test, causal modeling).
- **Cross-tenant pattern transfer** (privacy boundary still to design).
- **Mobile-optimized graph viewer.** Desktop only.
- **External / public sharing of graph views.** Internal tool, internal users.
- **Real-time collaboration UX** on the management UI (commenting, multi-user editing).

---

## Section 1 — Architecture & Components

### Topology

```
                    ┌──────────────────────────────┐
                    │  Chief of Staff Agent        │
                    │  (and future strvx agents)   │
                    └──────────────┬───────────────┘
                                   │ MCP (HTTP+SSE, API-key auth)
                    ┌──────────────▼───────────────┐
        ┌───────────┤  apps/kg-mcp (MCP server)    │
        │           └──────────────┬───────────────┘
        │                          │
        │           ┌──────────────▼───────────────┐
        │  SDK      │  packages/kg (core library)  │  ← shared TypeScript SDK
        │  import   │  — query, write, trust,      │
        │           │    provenance, conflict res. │
        │           └─────┬────────────────────┬───┘
        │                 │                    │
        │           ┌─────▼─────┐      ┌───────▼───────┐
        │           │  Neo4j    │      │  Postgres     │
        │           │  Aura DS  │      │  + pgvector   │
        │           └─────▲─────┘      └───────▲───────┘
        │                 │                    │
        │           ┌─────┴────────────────────┴───┐
        │           │  apps/kg-ingestor            │
        │           │  — Postgres CDC consumer     │
        │           │  — virtual-edge resolvers    │
        │           │  — agent-memory writer       │
        │           │  — self-improvement workers  │
        │           └──────────────────────────────┘
        │
        │           ┌──────────────────────────────┐
        └──────────►│  apps/internal/.../knowledge │  ← management UI (8 surfaces)
                    └──────────────────────────────┘
```

### Components

**1. `packages/kg`** — The core TypeScript library. The **only** code path that writes to Neo4j. Exposes typed query/write functions, enforces trust + provenance + conflict-detection invariants. Both `apps/kg-mcp` and `apps/internal` import from here.

**2. `apps/kg-mcp`** — Thin MCP protocol wrapper around `packages/kg`. Exposes the curated tool set to external agents. Read-only `runCypher` escape hatch; all writes go through curated tools.

**3. `apps/kg-ingestor`** — Long-running service hosting three worker pools:
- **CDC worker:** consumes Postgres logical replication slot → maps row changes to graph upserts.
- **Virtual-edge resolver workers:** on-demand fetchers for GitHub / Gmail content; populate cache; record provenance.
- **Self-improvement workers:** ontology proposals, ER candidate generation, memory consolidation, usage rollups, pattern extraction, trust decay.

**4. `apps/internal/src/app/(app)/knowledge/`** — The management UI. Imports `packages/kg` directly. Eight surfaces (Section 6).

**5. Neo4j** — Aura DS managed in v1. Holds entities, relationships, provenance metadata, agent memory nodes, system-generated edges.

**6. Postgres + pgvector** — Source-of-truth for operational data (already in place). Adds:
- `kg_embeddings` — embeddings keyed by Neo4j node ID
- `kg_resolver_cache` — virtual-edge content cache with TTL + freshness metadata
- `kg_audit_log` — every read/write the agent or UI performs (immutable, partitioned by month)
- `kg_credentials` — encrypted API tokens for resolver targets (GitHub, Gmail, Stripe, Mercury, Slack)
- `agent_credentials` — agent API keys, roles, scopes

### Boundary Rules

- **`packages/kg` is the only writer to Neo4j.** Enforced by a custom ESLint rule that fails on `neo4j-driver` imports outside `packages/kg`.
- **Postgres remains canonical for operational data.** The graph mirrors it; if they disagree, Postgres wins and the graph is corrected on next CDC tick.
- **Agent memory is graph-canonical.** `Observation`, `Decision`, `Plan`, `Pattern` nodes have no Postgres counterpart. The graph IS their source of truth.
- **No direct Cypher writes** from MCP, UI, or ingestor. Writes always go through `packages/kg` functions, which enforce trust/provenance/conflict invariants.

### SLOs

- **CDC lag:** < 5s p99 from Postgres commit to Neo4j visibility.
- **Read latency:** < 200ms p95 for 3-hop `getEntityContext` queries.
- **Write latency:** < 150ms p95 for agent memory writes.
- **Ingestor backlog:** virtual-edge resolver queue depth < 100 items p95.
- **Trust-decay worker:** runs at least once every 24 hours.

---

## Section 2 — Ontology v1

### Entity Types

**People & Organizations**
- `Person` — unifies `contacts`, `partner_contacts`, `users`, Gmail senders, GitHub authors, Slack users (entity-resolved)
- `Organization` — unifies `companies`, `partners`, GitHub orgs
- `Role` — Person's relationship to an Organization at a point in time (Employee, Founder, Partner Contact, etc.)

**Activity & Engagements**
- `Engagement` — `engagements` + `projects` from Postgres
- `Interaction` — `interactions`, `partner_interactions`, calls, meetings
- `Communication` — emails, Slack messages, calendar invites (channel-typed specialization of Interaction)
- `Task` — `tasks`, `next_actions`
- `FinancialEvent` — `invoices`, `expenses`, Mercury txns, Stripe payments, credit-card transactions (subtyped)
- `Booking` — `bookings`, follow-up calls

**Knowledge & Artifacts**
- `Document` — `documents`, file attachments, PDFs, Notion pages
- `Repository`, `Commit`, `PullRequest`, `Issue`, `CodeFile` — GitHub (CodeFile is virtual)
- `Note` — Obsidian notes, internal notes
- `Goal`, `MonitoredSite` — direct from Postgres

**Agent Memory (graph-canonical, no Postgres counterpart)**
- `Observation` — agent-written; decays unless reinforced
- `Decision` — agent-written; immutable; supersedable
- `Plan` — agent-written intent + status
- `Pattern` — system-extracted insight with supporting evidence edges
- `SchemaProposal` — ontology evolution worker output

### Relationships (v1)

`WORKS_AT`, `REPRESENTS`, `HAS_ENGAGEMENT`, `ASSIGNED_TO`, `INVOLVED_IN`, `ABOUT`, `AUTHORED`, `IN_REPO`, `OWNED_BY`, `PAID_BY`, `PAID_TO`, `FOLLOWS` (threading), `REFERENCES` (cross-entity mention), `DECIDED_ABOUT`, `OBSERVED`, `PLANS_FOR`, `EXTRACTED_FROM`, `SUPERSEDES`, `MERGED_FROM` (ER bookkeeping), `SAME_AS` (ER candidate), `CONFLICTS_WITH` (agent disagreement), `SUMMARIZED_BY` (consolidation), `DERIVED_FROM` (provenance edge).

**Tier-3 hook edges** (no v1 writers, schema reserved): `PREDICTS`, `CAUSED`, `COUNTERFACTUAL_OF`.

### Provenance Schema (on every node and every edge)

```ts
type Provenance = {
  source_type:        'postgres' | 'gmail' | 'calendar' | 'mercury' | 'stripe'
                    | 'slack' | 'github' | 'obsidian' | 'agent' | 'system',
  source_id:          string,           // fully-qualified ID in source system
  source_record_id:   string,           // stable ID within source
  extraction_method:  'cdc' | 'api_fetch' | 'llm_extraction'
                    | 'agent_write' | 'system_inference',
  extracted_at:       Date,
  last_validated_at:  Date,
  validation_count:   number,           // cross-source confirmations
  confidence:         number,           // 0-1, set at extraction
  trust_score:        number,           // 0-1, computed
  created_by:         string,           // agent_id, user_id, or worker name
};
```

Agent-written nodes carry extra fields: `agent_id`, `session_id`, `rationale`, `superseded_by`.

**Trust score formula:**
```
trust_score = confidence
            × source_reliability   (per-source, learned weekly)
            × age_decay            (per-entity-type half-life)
            × validation_factor    (capped at 1.5×)
```

Nodes/edges with `trust_score < 0.3` are hidden from default queries but remain retrievable via explicit `getNode(id)` or `runCypher`.

### Ontology Evolution

The ontology is **additive-only in v1.** New entity types, relationships, and properties can be added; nothing is ever deleted. Removals defer to v2 with a deprecation workflow.

The **ontology evolution worker** (Section 5) proposes additions based on observed data. Approvals trigger migrations recorded as `SchemaChange` nodes for audit.

---

## Section 3 — Ingestion

### Path 1: Postgres CDC → Neo4j (the materialized core)

```
Postgres WAL → logical replication slot (kg_cdc_slot)
            → wal2json output plugin
            → kg-ingestor CDC worker
            → packages/kg.upsertFromPostgres()
            → Neo4j (entity/edge upserts via MERGE)
            → kg_audit_log entry (Postgres)
```

**Mechanics:**
- Mapping declared in `packages/kg/src/mappings/postgres.ts` — data, not code where possible. Each Postgres table maps to entity types, FKs map to relationships, columns map to properties.
- One row can produce multiple entities (e.g., `engagements` row → `Engagement` node + `HAS_ENGAGEMENT` edge to its `Organization`).
- All Neo4j writes are idempotent via `MERGE` keyed by `(source_type, source_id)`.

**Ordering & idempotency:**
- WAL order preserved per-table; parallel across tables.
- Cross-table FK dependencies resolved by **upsert-or-stub:** if `engagements.company_id` references an unseen `Company`, create a stub `Organization` node with `confidence=0.5`, `is_stub=true`. CDC for `companies` later upgrades it.
- Replay-safe: deleting and replaying the slot from a checkpoint produces identical state.

**SLO:** < 5s p99 lag from Postgres commit to Neo4j visibility.

### Path 2: Virtual-edge resolvers (GitHub & Gmail content)

For repos and full email bodies — store metadata + embeddings only, fetch on demand.

**At ingestion (background, low priority):**
- **GitHub:** poll repo manifest → upsert `Repository`, `CodeFile` (metadata only: path, size, language, last commit), `Commit`, `PullRequest`, `Issue` nodes. Embed commit messages, PR titles/descriptions, issue text. Store embeddings in `kg_embeddings` (pgvector).
- **Gmail:** poll watched mailboxes via Gmail API → upsert `Communication` nodes with subject + snippet + recipients + thread ID. Embed subject + snippet. Body lives in source.

**At query time:**
- `packages/kg.getContent(nodeId)` checks `kg_resolver_cache` first. On miss, fetches from GitHub/Gmail API, caches with TTL based on `last_modified` (default: 7 days for code, 30 days for email), returns content.
- **Cache invalidation:** on webhook events (GitHub push, Gmail label change) when feasible; otherwise TTL.
- **Tradeoff explicitly accepted:** first-time content fetch is 500–2000ms. Cache hits are <50ms. SDK exposes `hasContent(nodeId)` so callers can choose.

### Path 3: Agent memory writes (graph-canonical)

```
Agent call (via MCP or SDK)
       → packages/kg.recordObservation(payload) (or recordDecision / recordPlan / linkEntities)
       → conflict detection (LLM-judged semantic conflict on same subject + similar timeframe)
       → trust scoring (initial: 1.0 × agent_reliability_score)
       → Neo4j MERGE with full provenance
       → kg_audit_log entry (Postgres, same logical txn from caller's POV)
       → return node ID
```

**Conflict detection:** if a new `Observation` contradicts an existing one, both are kept; a `CONFLICTS_WITH` edge is created; the conflict surfaces in the management UI's approval queue. The agent is not silenced — disagreement is recorded.

### Path 4: External SaaS → Postgres → CDC

For Gmail headers, Calendar events, Mercury txns, Stripe payments, Slack messages: existing or new strvx sync jobs land them in Postgres tables. Some already exist (`gmail_sync_state`, `expenses` from Mercury). From there, Path 1 (CDC) handles propagation.

**No special path** — uniform pipeline keeps Postgres canonical.

### Entity Resolution at Ingest

Every new node runs through an ER step before being finalized:
- **Deterministic match (auto-merge):** identical email, identical Stripe customer ID, identical GitHub login → merge into existing node, increment `validation_count`.
- **High-confidence probabilistic (> 0.97, auto-merge):** name similarity + co-occurrence in same engagement/thread → auto-merge with `MERGED_FROM` edge for reversibility.
- **Mid-confidence (0.85–0.97, queue):** propose `SAME_AS` edge; ER candidate worker batches into approval queue.
- **Below threshold:** create as new node; ER worker periodically rescans.

Merges are **reversible** — `MERGED_FROM` edges preserve the chain.

### Initial Backfill

One-time job: full-table scan of every Postgres table the mapping config covers → produce synthetic CDC events in topological order (Organizations before Engagements before Tasks, etc.) → run through the same Path 1 pipeline. Idempotent, resumable, runs in hours not days at strvx's data scale.

### Failure Handling

| Failure | Behavior |
|---|---|
| Neo4j down | CDC worker pauses; replication slot accumulates WAL; Postgres keeps working. Drain on recovery. Page if slot lag > 100 MB. |
| Postgres down | strvx is down; KG isn't the priority. |
| Resolver API failure (GitHub, Gmail) | Return stale cache with `is_stale=true`; agent decides whether to proceed; exponential-backoff retry. |
| LLM API failure (conflict detection, ER, consolidation) | Worker enqueues for retry; graph reads unaffected. |
| Embedding API failure | New nodes proceed without embeddings; backfill worker fills gaps. |

---

## Section 4 — Query & Write Surfaces

### `packages/kg` — Core Library API

```ts
// === Read ===
getEntityContext(id, opts?: { depth?, types?, limit? }): EntityContext
findEntities(query, opts?: { types?, filters?, mode?, limit? }): SearchResult[]
findSimilar(entityId, opts?: { scope?, limit? }): SimilarEntity[]
traverse(startId, pattern: TraversalPattern, opts?: { limit?, maxDepth? }): TraversalResult
getNode(id): Node | null
getEdge(id): Edge | null
getProvenance(id): Provenance
// getContent / hasContent ship in Month 3 alongside virtual-edge resolvers.
// Not part of the Month 1 read surface.
getContent(id): { content: string, source: string, is_stale: boolean }   // Month 3
hasContent(id): boolean                                                  // Month 3
getAuditLog(id, opts?: { since?, limit? }): AuditEntry[]
runCypher(query: string, params: Record<string, unknown>): CypherResult  // READ-ONLY

// === Write (curated) ===
recordObservation({ subject, content, sources, confidence }): NodeId
recordDecision({ context, choice, rationale, alternatives, confidence }): NodeId
recordPlan({ subject, intent, steps, status }): NodeId
linkEntities({ from, to, type, properties?, confidence }): EdgeId
supersedeDecision({ original, replacement, reason }): EdgeId

// === Self-improvement hooks ===
proposeOntologyChange({ kind, definition, evidence }): ProposalId
proposeEntityMerge({ candidates, evidence, confidence }): ProposalId
recordPattern({ description, query, supporting_evidence, confidence }): NodeId
recordQuery({ agent_id, query, intent, result_quality }): void  // fire-and-forget, feeds Tier 2 gap filling
```

**Every write function:**
1. Computes provenance from caller context (`agent_id`, `session_id`, source).
2. Computes initial `trust_score` from `source_reliability × confidence`.
3. Runs conflict detection where applicable.
4. Writes to Neo4j via parameterized Cypher only (no string concatenation, ever).
5. Writes audit entry to Postgres `kg_audit_log` synchronously (same logical txn from caller's POV).
6. Returns the new node/edge ID.

### `apps/kg-mcp` — MCP Tool Catalog

Each public library function is exposed as an MCP tool with the same semantics.

| Tool | Purpose | Latency target |
|---|---|---|
| `kg_get_entity_context` | "Tell me everything about X within N hops" | < 200ms p95 |
| `kg_find_entities` | Hybrid semantic + structured search | < 300ms p95 |
| `kg_find_similar` | "What's like this?" | < 250ms p95 |
| `kg_traverse` | Pattern-based traversal | < 400ms p95 |
| `kg_get_provenance` | "Where did this fact come from? How trusted?" | < 50ms |
| `kg_get_content` | Fetch virtual-edge content (GitHub/Gmail body) | < 50ms cached / < 2000ms uncached |
| `kg_record_observation` | Agent memory write | < 100ms |
| `kg_record_decision` | Agent decision write | < 150ms |
| `kg_record_plan` | Agent plan write | < 100ms |
| `kg_link_entities` | Agent-asserted relationship | < 100ms |
| `kg_record_query` | Agent logs intent (feeds Tier 2) | < 50ms (fire-and-forget) |
| `kg_run_cypher` | Read-only Cypher escape | varies |

Transport: HTTP+SSE. Auth: API key per agent in HTTP header. Tool descriptions in the catalog steer agents toward curated tools and away from `kg_run_cypher` for hot paths.

### Authorization & Scoping

Multi-agent ready in v1 (single agent in practice):
- Each agent has an **API key** stored in `agent_credentials`.
- Each agent has a **role** (`reader`, `writer`, `admin`) and **scope** (allowed entity types, allowed write operations).
- Every write records `created_by = agent_id`; conflict detection groups by subject + uses `agent_id` to surface "two agents disagree."

### Cypher Escape Hatch — Constraints

- **Read-only.** A Cypher parser pass rejects any clause matching `CREATE`, `MERGE`, `SET`, `DELETE`, `REMOVE`, or `CALL { ... CREATE ... }`. No exceptions.
- **Parameterized only.** Library callers pass `{ query, params }`; concatenation in `query` is allowed but agent-supplied params never interpolate into the query string.
- **Audited.** Every `kg_run_cypher` call is logged in `kg_audit_log` with full query + params.
- **Rate-limited.** Per-agent rate limit (default: 60 queries/minute) configurable in settings.

### TypeScript SDK Usage (inside `apps/internal`)

```ts
import { findEntities, getEntityContext } from '@strvx/kg';

const results = await findEntities(searchQuery, {
  types: ['Person', 'Organization'],
  limit: 20,
});
```

Same auth model, no MCP overhead, full type safety.

---

## Section 5 — Self-Improvement (Tier 1)

Six workers in `apps/kg-ingestor`, each with a clear schedule, output, and approval gate where one is needed.

### Worker 1: Provenance & Trust Scoring (always-on + hourly)

Every write computes trust at write-time. The **trust-decay worker** runs hourly:
- Re-computes `trust_score` per the formula above.
- `age_decay` half-life is configurable per entity type. Defaults: `Observation` = 30 days, `Pattern` = 90 days, `FinancialEvent` = 5 years, `Person`/`Organization` = effectively never.
- `validation_factor`: every independent cross-source confirmation adds 0.1 (cap 1.5×).
- `source_reliability` recomputed weekly from observed correction rate per source. Defaults: Postgres CDC = 1.0, Gmail LLM extraction = 0.7, agent observation = 0.6, system inference = 0.5.

**Tier-3 hook:** trust history exposed to future causal modeling worker.

### Worker 2: Ontology Evolution (daily)

LLM analyzes recently ingested nodes with the current ontology as context. Proposes:
- New entity types ("vendor invoice" subtype of `FinancialEvent`)
- New properties on existing types
- New relationship types

**Output:** `SchemaProposal` node + entry in management UI's approval queue with: proposal, sample evidence nodes, back-projection impact analysis, suggested migration.

**Approval gate:** human reviews. Rejections record rationale; worker uses rationale to avoid re-proposing.

### Worker 3: Entity Resolution Learning (every 6 hours)

Three sub-jobs:
- **High-confidence auto-merges** (> 0.97 confidence): merged with `MERGED_FROM` for reversibility.
- **Mid-confidence proposals** (0.85–0.97): added to ER approval queue.
- **Feedback learning:** human approve/reject decisions reinforce/penalize the matcher's feature weights (logistic regression in v1; upgradable later).

**Tier-2 hook:** matcher version tracked; future re-matching on improved models supported.

### Worker 4: Memory Consolidation (nightly + on-demand)

Three tiers:
- **Short → mid (nightly):** rolls up related `Observation` nodes (same subject, within 7 days) into a `Summary` node. Originals retained but de-prioritized; `SUMMARIZED_BY` edges preserve chains.
- **Mid → long (weekly):** rolls 90-day windows into `LongTermInsight` nodes.
- **Decision retention:** `Decision` nodes are immutable, never consolidated away. Supersedable via `SUPERSEDES`.

LLM-driven; uses current ontology + provenance to write summaries that maintain references back to source nodes.

### Worker 5: Usage Weighting (continuous + nightly)

- Every traversal records edges traversed (sampled 10% by default; 100% for `kg_run_cypher`).
- Nightly aggregation updates `edge.traverse_count`, `node.read_count`.
- Hot edges receive materialized composite indexes in Neo4j.
- Cold subgraphs (no reads 180+ days, `trust_score < 0.5`) marked `archived=true` — excluded from default queries, retained for compliance.

**Tier-2 hook:** usage log is the substrate for future agent-driven gap filling worker.

### Worker 6: Pattern Extraction (weekly)

Runs canned + LLM-suggested graph queries to find statistical regularities:
- "Average time-in-stage for closed-won vs closed-lost engagements"
- "Person nodes with highest centrality in engagement co-occurrence"
- "Clusters in `Observation` embedding space not captured by an entity"

**Output:** each finding becomes a `Pattern` node with `EXTRACTED_FROM` edges to supporting evidence. Patterns above confidence threshold appear in approval queue (human approves the framing, not the data). Approved patterns become first-class queryable knowledge.

**Tier-3 hook:** `Pattern` nodes are the substrate for future causal modeling.

### Unified Approval Queue UX

All three approval queues (ontology, ER, patterns) live in the management UI's **Approval queues** surface (Section 6, Surface 5):
- One queue per type with counts in top nav.
- Each item: proposal, evidence, "what would happen if approved," approve / reject / "ask later" buttons.
- Rejections require ≥10-char reason for worker learning.
- Bulk-approve available for ER matches above confidence threshold.
- "Ask the agent" button on every item opens a side panel where the Chief of Staff agent evaluates the proposal with optional human input.

### Tier 2/3 Hooks Preserved (no v1 worker, scaffolding present)

- **#7 Agent-driven gap filling:** `recordQuery` and `kg_audit_log` provide signal substrate.
- **#8 Continuous re-embedding:** `embedding_model_version` stored on every embedding.
- **#9 Self-documenting graph:** schema/audit data is sufficient when worker ships.
- **#10 Multi-agent disagreement triage:** `CONFLICTS_WITH` edges + per-agent attribution already in v1.
- **#11–14 (Tier 3):** edge types `PREDICTS`, `CAUSED`, `COUNTERFACTUAL_OF` reserved in ontology.

---

## Section 6 — Management UI

Lives in `apps/internal/src/app/(app)/knowledge/`. Built on the existing internal-app stack (Next.js 16 App Router, shadcn/ui, Drizzle for Postgres reads, `packages/kg` for graph).

### Routing

```
/knowledge                         → Overview (entry, recent activity, queue counts, health gauge)
/knowledge/browse                  → Graph browser (interactive)
/knowledge/search                  → Search
/knowledge/entity/[id]             → Entity detail page
/knowledge/queues                  → Approval queues (tabs: ontology / ER / patterns)
/knowledge/health                  → Health & observability
/knowledge/settings                → Settings & integrations
/knowledge/audit                   → Audit log explorer (agent activity feed)
```

### Surface 1 — Overview (`/knowledge`)

Landing page. Six tiles in a 2×3 grid:
- **Graph size** — node count by type, edge count by type, growth sparkline.
- **Recent activity** — last 20 writes (agent or human), each linking to the entity.
- **Queues summary** — counts per queue type, with quick-link to each.
- **Health gauge** — CDC lag p99, query p95, ingestor queue depth, "all green / N warnings."
- **Top patterns** — last 5 approved `Pattern` nodes with one-line summary.
- **Search** — embedded search box (also lives in nav).

### Surface 2 — Graph browser (`/knowledge/browse`)

Interactive visualization using **React Flow**.
- **Left panel:** entity type checkboxes, relationship type checkboxes, trust threshold slider.
- **Center:** node-link diagram. Nodes sized by `read_count`, colored by entity type, opacity by trust score.
- **Right panel:** when a node is selected, shows summary + "expand neighbors" controls (by hop count, by edge type).
- **Top bar:** search-to-locate, "save view" (named, URL-state encoded, shareable).
- **Scale strategy:** for graphs > 500 visible nodes, switches to a **community-detection summary view** (Neo4j GDS Louvain clusters) — clusters clickable to drill in.

### Surface 3 — Search (`/knowledge/search`)

Single search box, ranked results, unified cards.
- **Modes (toggle):** Hybrid (default), Semantic only, Structured only.
- **Filters:** entity type, source, trust threshold, date range.
- **Results:** entity, type, snippet, provenance badge, trust score, actions.
- **Saved searches:** named, pinnable to the sidebar.

Server-side: calls `findEntities()`. p95 < 300ms.

### Surface 4 — Entity detail (`/knowledge/entity/[id]`)

Four tabs:
- **Overview:** properties, summary, key edges, 10-node mini neighborhood.
- **Edges:** full edge list, groupable by relationship type, filterable by direction.
- **Provenance:** every property and edge shows source, extraction method, trust, age, validation count. Click to drill into source record where possible.
- **Activity:** every read/write on this entity by agents or humans, chronological. **Scrubbable time slider** lets a user see the entity state at any past moment (possible because we store full audit history).

Inline actions: "Merge with another entity" (creates ER proposal), "Report as wrong" (lowers trust, files audit note), "Annotate" (human-attributed `Observation`).

### Surface 5 — Approval queues (`/knowledge/queues`)

Three tabs (ontology / ER / patterns). Unified card pattern (Section 5). "Ask the agent" button on every item.

### Surface 6 — Health & observability (`/knowledge/health`)

- **Ingestion health:** CDC slot lag gauge + 24h chart, per-table throughput, resolver queue depths, cache hit rate, recent errors (drillable).
- **Query health:** p50/p95/p99 latency by tool, slow-query log (>1s with full Cypher + params), error rate + samples.
- **Storage:** Neo4j size, Postgres KG table sizes, pgvector index sizes, growth trend.
- **Trust distribution:** histogram of `trust_score` across all nodes/edges, by entity type.
- **Worker status:** each self-improvement worker — last run, duration, output volume, errors. One-click "run now" trigger.

### Surface 7 — Settings & integrations (`/knowledge/settings`)

- **Integrations:** per-source toggle, encrypted credential management, sync schedule, last sync, error rate.
- **Trust config:** per-entity-type half-life, per-source initial reliability, archival thresholds.
- **Agent permissions:** registered agents, API keys (rotate/revoke), roles, scopes, deep-link to filtered audit.
- **Retention policies:** per-entity-type retention, archive vs delete, compliance flags.
- **Backup & export:** trigger Neo4j backup, export ontology as JSON, dump audit log to CSV.

### Surface 8 — Audit (`/knowledge/audit`)

Filterable timeline of every read and write on the graph. Filters: actor, tool, entity, time range, success/error. Each entry: timestamp, actor, tool/method, target entity (clickable), parameters, result summary, latency.

### Build Aesthetic

Matches existing strvx internal-app design (shadcn/ui base, lucide icons, charts via **recharts** per the strvx core rules, inline styles for new color values per Tailwind v4 JIT constraint). React Flow is a new dependency (the only one beyond what's already in the monorepo). Visualization and charts styled to match the rest of the internal app — no foreign-tool feel.

---

## Section 7 — Operations

### Testing Strategy

**Three layers:**

- **Unit (`packages/kg`):** Every public function. Pure functions tested in isolation. Cypher query builders tested by snapshot. Mappings (`packages/kg/src/mappings/postgres.ts`) tested with golden-file row → expected entity/edge.
- **Integration (`apps/kg-ingestor`, `apps/kg-mcp`):** Spin up real Neo4j and real Postgres in CI (testcontainers). Test CDC end-to-end with synthetic WAL events. Mock GitHub/Gmail APIs deterministically. Test self-improvement workers against fixture corpora and assert expected proposals.
- **E2E (management UI):** Playwright. Critical paths: search returns results, approval queues approve correctly, graph browser renders for fixture graph, entity detail shows correct provenance.

**Determinism:** seeded fixtures, no `Date.now()` / `Math.random()` outside controlled mocks. LLM-using tests mock the LLM with replayable fixture responses.

**Coverage gate:** `packages/kg` must hit 90%+ line coverage before v1 ships. Apps target 70%+.

### Observability

- **Logs:** structured JSON to stdout, shipped to existing strvx log pipeline. Every `packages/kg` call emits a log line with `agent_id`, `tool`, `latency_ms`, `result_count`, `cache_hit`.
- **Metrics:** OpenTelemetry. Histograms for tool latency, gauges for ingestor lag, counters for writes/errors.
- **Traces:** distributed tracing across MCP → packages/kg → Neo4j/Postgres. Sample at 1%, 100% on errors. Tracer headers propagate from agent into traces.
- **Alerting:** page-worthy conditions: CDC lag > 60s, ingestor error rate > 5%, Neo4j unreachable, kg-mcp p99 > 1s for 5 min, trust-decay worker hasn't run in 25 hours.

### Security & Privacy

- **Authentication:**
  - Agents: API key per agent in `agent_credentials`, rotated via management UI.
  - Humans: existing strvx internal-app auth.
- **Authorization:** role + scope checks in `packages/kg` middleware. Same enforcement for MCP and SDK callers.
- **Cypher injection:** ALL Cypher uses parameterized queries. ESLint rule against template-string Cypher. `runCypher` parses query AST and rejects write clauses.
- **PII:** Gmail bodies, Mercury account details, Stripe customer data — encrypted at rest. Never logged as raw values. Audit log records access.
- **External tokens:** stored in `kg_credentials`, KMS-encrypted, rotated quarterly. Scoped read-only where APIs allow.
- **Backups:** Neo4j Aura DS daily snapshots + weekly export to S3 as cold storage. Postgres backups handled by existing strvx infra.

### Deployment Topology

| Component | Where | Size |
|---|---|---|
| Neo4j Aura DS | Managed | Smallest tier ($65/mo entry) |
| Postgres | Existing Supabase | Incremental tables only |
| `apps/kg-mcp` | Fly.io | 256MB, autoscale 1–3 |
| `apps/kg-ingestor` | Fly.io | 1GB, single-instance (replication slot consumer) |
| `apps/internal` | Existing Vercel | `/knowledge` ships with normal deploys |

**Network:** kg-mcp + kg-ingestor on Fly internal network; Neo4j Aura DS over public DNS with allowlisted IPs + mutual TLS. Postgres CDC via Supabase pooler with logical replication endpoint (`wal_level=logical` already enabled).

**Secrets:** Vercel env for Next.js, Fly secrets for services. Rotate quarterly.

### Cost Expectations (early v1)

| Component | Monthly |
|---|---|
| Neo4j Aura DS (smallest) | $65 |
| Fly.io (kg-mcp + kg-ingestor) | $30 |
| Supabase Postgres incremental | $50–100 |
| pgvector embedding compute (OpenAI text-embedding-3-small or Voyage) | $20–50 |
| LLM costs (ontology, ER, consolidation) | $50–200 |
| **Total v1 monthly run-rate** | **$215–445** |

Scales linearly with data + agent activity. LLM cost is the biggest variable; per-worker budget caps configurable in settings.

### Migration / Cutover Phasing (~4 months to v1)

**Month 1: foundation.** `packages/kg` skeleton, ontology types, Neo4j connection, Postgres schema additions, basic read functions. No CDC yet.

**Month 2: ingestion.** CDC pipeline operational for top 10 tables (`companies`, `contacts`, `engagements`, `interactions`, `partners`, `projects`, `tasks`, `invoices`, `expenses`, `calendar_events`). Initial backfill. Agent memory write functions. Deterministic ER.

**Month 3: agent surface + management UI MVP.** `apps/kg-mcp` deployed. Chief of Staff agent integrates against MCP. UI surfaces: search, entity detail, graph browser (read-only). Virtual-edge resolvers for GitHub + Gmail metadata.

**Month 4: self-improvement workers, polish, GA.** All six Tier-1 workers running. Approval queues live. Health dashboard live. Production hardening. Chief of Staff cutover to graph as primary memory source.

**Each month ships something usable.** Agent gets value incrementally; design can course-correct.

### Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| ER auto-merge propagates a wrong merge | High | Reversible `MERGED_FROM` edges; correction UX prioritized; auto-merge only > 0.97 confidence; weekly review of recent auto-merges in approval queue. |
| CDC lag spikes block agent on stale data | Medium | SLO + alerting; agent SDK exposes `freshness` hint; degraded mode reads from Postgres for hot paths. |
| Self-improvement workers produce noise | Medium | Confidence thresholds + rejection-feedback learning; per-worker pause toggle; explicit "training" mode where humans rate proposals. |
| Neo4j Aura cost grows faster than projected | Medium | Archival of cold subgraphs ships in Tier 1; capacity monitored monthly; option to self-host on Fly if costs exceed plan. |
| Trust scoring formula misbehaves; important facts decay | Low | All formula params configurable; trust distribution dashboard surfaces anomalies; "freeze trust" emergency toggle. |
| Chief of Staff agent depends on graph; graph downtime blocks agent | Medium | Agent SDK has fallback to direct Postgres reads for critical paths; circuit breaker on kg-mcp; degraded mode tested. |
| Postgres schema migration drifts from KG mapping config | High | Mapping config validated against schema in CI; drift produces failing test; mapping changes go through same migration review as schema changes. |
| Audit log grows unbounded | Medium | Partitioned by month from day 1; tiered storage (recent in Postgres, >6 months to S3 Parquet); compliance retention configurable. |
| Cypher parser misses a novel write pattern, allowing injection of writes through `runCypher` | Low | Parser tests include a corpus of write-attempt strings; CI fails if any new pattern bypasses; defense-in-depth: read-only DB user for `runCypher` connections. |

---

## Glossary

- **CDC** — Change Data Capture. Postgres logical replication streams every row change to subscribers.
- **Virtual edge** — A node in the graph whose content lives in an external system (GitHub, Gmail) and is fetched on demand.
- **Materialized core** — The portion of the graph derived from Postgres + agent memory, kept up-to-date via CDC and direct writes.
- **Ontology** — The schema of the graph: entity types, relationship types, properties.
- **Provenance** — The metadata on every node and edge describing where it came from, when, by what process, and with what confidence.
- **Trust score** — A 0–1 score computed from confidence, source reliability, age decay, and validation count. Determines visibility in default queries.
- **Entity resolution (ER)** — The process of recognizing that two graph nodes refer to the same real-world entity and merging them.
- **Memory consolidation** — Rolling up short-term agent observations into mid-term summaries and long-term insights, mirroring human memory hierarchy.
- **Tier 1 / 2 / 3** — Self-improvement scope tiers. Tier 1 ships v1. Tier 2 (months 5–8) and Tier 3 (months 9–14) have their hooks scaffolded into v1 architecture.

---

## Open Questions (to resolve in writing-plans phase)

1. **GitHub repo selection.** Which strvx + client repos are in v1 scope? All-by-default or explicit allow-list?
2. **Gmail mailbox selection.** Which strvx team mailboxes? Per-user or per-team?
3. **Embedding model choice.** OpenAI `text-embedding-3-small` vs Voyage `voyage-3` vs `voyage-3-large`. Cost vs quality trade.
4. **LLM provider for workers.** Anthropic Claude (matches Chief of Staff stack) vs OpenAI vs mix-and-match per worker. Affects worker prompts, structured output approach, and budget math.
5. **CDC tool.** `wal2json` (simpler) vs Debezium (more capable). Default: `wal2json`.
6. **Cypher AST parser library.** Specific choice affects `runCypher` safety implementation.
7. **First Chief of Staff use case.** What's the first end-to-end agent question we test v1 against? (Drives Month 3 acceptance.)
8. **Per-tenant isolation strategy.** Single Neo4j database in v1 is fine; multi-tenant requires deciding database-per-tenant vs label-scoped queries before Custos clients land in the graph.
