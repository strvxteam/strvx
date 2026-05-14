import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { upsertFromPostgres } from "../../src/writes/upsert-from-postgres.js";
import type { AgentContext } from "../../src/types.js";
import { REPLAY_EVENTS } from "./fixtures/cdc-replay-events.js";

const ctx: AgentContext = { actorKind: "system", actorId: "replay-test", role: "admin" };

/**
 * M2.T8 — CDC replay idempotency.
 *
 * Apply the full event stream once, snapshot the graph, apply it again, snapshot
 * again. The two snapshots must be deep-equal. This validates that
 * upsertFromPostgres is safe to replay (CDC at-least-once semantics).
 *
 * `prov_extracted_at` and `prov_last_validated_at` are excluded from snapshots
 * because they are set to `now()` on every call (see provenance/compute.ts
 * `buildProvenance` — extracted_at = input.now ?? new Date()).
 *
 * `prov_trust_score` IS included: trust_score is computed from
 * (confidence × source_reliability × age_decay × validation_factor). In
 * buildProvenance, age_days is hardcoded to 0 → ageDecay = 1, and
 * validation_count is hardcoded to 0 → validationFactor = 1. So given the
 * same source_type + entity_type + confidence, trust_score is deterministic
 * across runs and must match exactly.
 */
describe("CDC replay idempotency", () => {
  let n4j: StartedNeo4j;
  let pg: StartedPostgres;
  let client: Neo4jClient;
  let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key,
      occurred_at timestamptz not null default now(),
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
  }, 180_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("re-applying the full CDC event stream yields identical graph state", async () => {
    // 1. Apply all events once, in order.
    for (const ev of REPLAY_EVENTS) {
      await upsertFromPostgres({ client, sql, ctx }, ev);
    }

    // 2. Snapshot graph state.
    const firstSnapshot = await snapshotGraph(client);

    // Sanity: the fixture produced *something*.
    expect(firstSnapshot.nodes.length).toBeGreaterThan(0);
    expect(firstSnapshot.edges.length).toBeGreaterThan(0);

    // 3. Apply the entire fixture a second time.
    for (const ev of REPLAY_EVENTS) {
      await upsertFromPostgres({ client, sql, ctx }, ev);
    }

    // 4. Snapshot again — must equal first snapshot.
    const secondSnapshot = await snapshotGraph(client);

    // Counts match.
    expect(secondSnapshot.nodes.length).toBe(firstSnapshot.nodes.length);
    expect(secondSnapshot.edges.length).toBe(firstSnapshot.edges.length);

    // Full deep equality (provenance timestamps excluded — see helper).
    expect(secondSnapshot).toEqual(firstSnapshot);

    // 5. Audit log accumulated roughly 2× the event count (one entry per call).
    //    Allow inequality: some events take 1 entry, this is just a sanity check.
    const auditCount = await sql`SELECT count(*)::int AS c FROM kg_audit_log`;
    expect(auditCount[0].c).toBeGreaterThanOrEqual(REPLAY_EVENTS.length * 2);
  }, 120_000);

  it("interleaving deletes and inserts within the same stream is idempotent", async () => {
    const nodeId = "postgres:companies:r-replay-interleave-1";

    const insertEv = {
      kind: "insert" as const,
      table: "companies",
      row: { id: "r-replay-interleave-1", name: "Interleave Co", industry: "Test" },
      lsn: "0/00000100",
    };
    const deleteEv = {
      kind: "delete" as const,
      table: "companies",
      row: {},
      oldKeys: { id: "r-replay-interleave-1" },
      lsn: "0/00000101",
    };

    // Round 1: insert, then delete.
    await upsertFromPostgres({ client, sql, ctx }, insertEv);
    await upsertFromPostgres({ client, sql, ctx }, deleteEv);

    const afterRound1 = await client.read(async (tx) => {
      const r = await tx.run("MATCH (n {id: $id}) RETURN count(n) AS c", { id: nodeId });
      return r.records[0].get("c") as number;
    });
    expect(afterRound1).toBe(0);

    // Round 2: replay same insert + delete.
    await upsertFromPostgres({ client, sql, ctx }, insertEv);
    await upsertFromPostgres({ client, sql, ctx }, deleteEv);

    const afterRound2 = await client.read(async (tx) => {
      const r = await tx.run("MATCH (n {id: $id}) RETURN count(n) AS c", { id: nodeId });
      return r.records[0].get("c") as number;
    });
    // Node still absent — not resurrected, not duplicated.
    expect(afterRound2).toBe(0);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────

interface NodeSnapshot {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

interface EdgeSnapshot {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  prov_confidence: unknown;
  prov_trust_score: unknown;
}

interface GraphSnapshot {
  nodes: NodeSnapshot[];
  edges: EdgeSnapshot[];
}

/**
 * Stable, JSON-serializable view of the entire graph.
 *
 * Excludes prov_extracted_at and prov_last_validated_at — those are
 * set to datetime() on every call so they drift between runs.
 */
async function snapshotGraph(client: Neo4jClient): Promise<GraphSnapshot> {
  const nodes: NodeSnapshot[] = await client.read(async (tx) => {
    const r = await tx.run("MATCH (n) RETURN n AS node, labels(n) AS labels");
    return r.records.map((rec) => {
      const node = rec.get("node") as { properties: Record<string, unknown> };
      const labels = (rec.get("labels") as string[]).slice().sort();
      const id = String(node.properties.id);
      const properties = sortedNonTimestampProps(node.properties);
      return { id, labels, properties };
    });
  });

  const edges: EdgeSnapshot[] = await client.read(async (tx) => {
    const r = await tx.run(
      `MATCH (a)-[r]->(b)
       RETURN r AS rel, type(r) AS t, a.id AS fromId, b.id AS toId`,
    );
    return r.records.map((rec) => {
      const rel = rec.get("rel") as { properties: Record<string, unknown> };
      const props = rel.properties;
      return {
        id: String(props.id),
        type: String(rec.get("t")),
        fromId: String(rec.get("fromId")),
        toId: String(rec.get("toId")),
        prov_confidence: props.prov_confidence,
        prov_trust_score: props.prov_trust_score,
      };
    });
  });

  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, edges };
}

/**
 * Strip the two drifting timestamp fields, then return an object with keys
 * sorted alphabetically (so deep-equal comparisons aren't sensitive to insertion
 * order — though Vitest's `toEqual` is order-insensitive for objects, this
 * keeps the snapshot stable if we ever serialize it).
 */
function sortedNonTimestampProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const EXCLUDE = new Set(["prov_extracted_at", "prov_last_validated_at"]);
  const keys = Object.keys(props)
    .filter((k) => !EXCLUDE.has(k))
    .sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = props[k];
  return out;
}
