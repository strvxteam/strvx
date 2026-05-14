import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import {
  createPostgresClient,
  type PostgresClient,
} from "../../src/client/postgres.js";
import { recordDecision } from "../../src/writes/agent-memory.js";
import {
  linkEntities,
  supersedeDecision,
} from "../../src/writes/links.js";
import type { AgentContext } from "../../src/types.js";

const adminCtx: AgentContext = {
  actorKind: "agent",
  actorId: "cos",
  role: "admin",
  sessionId: "sess-links",
};

describe("linkEntities + supersedeDecision writers", () => {
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
      rw: {
        user: n4j.container.getUsername(),
        password: n4j.container.getPassword(),
      },
      ro: {
        user: n4j.container.getUsername(),
        password: n4j.container.getPassword(),
      },
    });
    sql = createPostgresClient(pg.url);

    // Seed two Organization nodes for link tests. We pick ids so that
    // 'postgres:companies:org-a' < 'postgres:companies:org-b' alphabetically.
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Organization {id: 'postgres:companies:org-a', type: 'Organization', name: 'Org A', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Organization {id: 'postgres:companies:org-b', type: 'Organization', name: 'Org B', is_stub: false})`,
      );
    });
  }, 180_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("adds a SAME_AS edge between two existing nodes in canonical order", async () => {
    // Pass in reversed order to exercise canonicalization.
    const res = await linkEntities(
      { client, sql, ctx: adminCtx },
      {
        aId: "postgres:companies:org-b",
        bId: "postgres:companies:org-a",
        reason: "Both records describe the same company; founded same year.",
        linkId: "link-001",
      },
    );

    expect(res.canonicalFrom).toBe("postgres:companies:org-a");
    expect(res.canonicalTo).toBe("postgres:companies:org-b");
    expect(res.alreadyExisted).toBe(false);
    expect(res.edgeId).toBe("agent:same_as:link-001");

    const edge = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (a {id: 'postgres:companies:org-a'})-[r:SAME_AS]->(b {id: 'postgres:companies:org-b'})
         RETURN r.id AS id, r.reason AS reason, r.confidence AS conf, r.linked_by AS by`,
      );
      return r.records[0];
    });
    expect(edge.get("id")).toBe("agent:same_as:link-001");
    expect(edge.get("reason")).toContain("same company");
    expect(edge.get("conf")).toBeCloseTo(0.8, 5);
    expect(edge.get("by")).toBe("cos");
  });

  it("is idempotent — second call returns alreadyExisted:true and no duplicate edge", async () => {
    const first = await linkEntities(
      { client, sql, ctx: adminCtx },
      {
        aId: "postgres:companies:org-a",
        bId: "postgres:companies:org-b",
        reason: "Calling again with a different reason — should be ignored.",
        linkId: "link-002",
      },
    );
    // First call already linked these two in the previous test, so this is
    // still the second observation of the edge.
    expect(first.alreadyExisted).toBe(true);

    const second = await linkEntities(
      { client, sql, ctx: adminCtx },
      {
        aId: "postgres:companies:org-a",
        bId: "postgres:companies:org-b",
        reason: "Third call — also a no-op for the edge.",
        linkId: "link-003",
      },
    );
    expect(second.alreadyExisted).toBe(true);

    const count = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (:Organization {id: 'postgres:companies:org-a'})-[r:SAME_AS]->(:Organization {id: 'postgres:companies:org-b'})
         RETURN count(r) AS c`,
      );
      return r.records[0].get("c") as number;
    });
    expect(count).toBe(1);
  });

  it("rejects a self-link", async () => {
    await expect(
      linkEntities(
        { client, sql, ctx: adminCtx },
        {
          aId: "postgres:companies:org-a",
          bId: "postgres:companies:org-a",
          reason: "self-link should fail",
        },
      ),
    ).rejects.toThrow(/cannot link a node to itself/);
  });

  it("rejects a missing node and records failure audit", async () => {
    await expect(
      linkEntities(
        { client, sql, ctx: adminCtx },
        {
          aId: "postgres:companies:org-a",
          bId: "postgres:companies:ghost",
          reason: "ghost endpoint should fail validation",
          linkId: "link-ghost",
        },
      ),
    ).rejects.toThrow(/node not found.*ghost/);

    const audit = await sql`
      SELECT success, error_message FROM kg_audit_log
      WHERE tool = 'linkEntities' AND error_message LIKE '%ghost%'
      ORDER BY id DESC LIMIT 1`;
    expect(audit.length).toBe(1);
    expect(audit[0].success).toBe(false);
  });

  it("writes audit entry with target_edge_id set on success", async () => {
    // Seed two fresh orgs for this test so we don't reuse an existing link.
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Organization {id: 'postgres:companies:org-c', type: 'Organization', name: 'Org C', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Organization {id: 'postgres:companies:org-d', type: 'Organization', name: 'Org D', is_stub: false})`,
      );
    });

    const res = await linkEntities(
      { client, sql, ctx: adminCtx },
      {
        aId: "postgres:companies:org-c",
        bId: "postgres:companies:org-d",
        reason: "same company across two crm sources",
        linkId: "link-audit",
      },
    );

    const audit = await sql`
      SELECT target_edge_id, success FROM kg_audit_log
      WHERE tool = 'linkEntities' AND target_edge_id = ${res.edgeId}
      ORDER BY id DESC LIMIT 1`;
    expect(audit.length).toBe(1);
    expect(audit[0].success).toBe(true);
    expect(audit[0].target_edge_id).toBe("agent:same_as:link-audit");
  });

  it("supersedeDecision creates a new Decision and SUPERSEDES edge", async () => {
    const old = await recordDecision(
      { client, sql, ctx: adminCtx },
      {
        agentId: "cos",
        sessionId: "sess-sup-1",
        rationale: "Cut marketing spend by 10% next quarter.",
        decisionId: "dec-old-1",
      },
    );

    const res = await supersedeDecision(
      { client, sql, ctx: adminCtx },
      {
        oldDecisionId: old.nodeId,
        newDecisionId: "dec-new-1",
        newDecision: {
          agentId: "cos",
          sessionId: "sess-sup-1",
          rationale:
            "Updated: cut marketing by 25% — Q1 results were worse than projected.",
          alternatives: ["10% cut (original)", "30% cut"],
        },
      },
    );

    expect(res.newDecision.nodeId).toBe("agent:decision:dec-new-1");
    expect(res.supersedesEdgeId).toBe("agent:supersedes:dec-new-1");
    expect(res.alreadyExisted).toBe(false);

    const link = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (newD {id: $newId})-[r:SUPERSEDES]->(oldD {id: $oldId})
         RETURN r.id AS edgeId, oldD.superseded_by AS oldRef, labels(newD) AS labels`,
        { newId: res.newDecision.nodeId, oldId: old.nodeId },
      );
      return r.records[0];
    });
    expect(link.get("edgeId")).toBe("agent:supersedes:dec-new-1");
    expect(link.get("oldRef")).toBe(res.newDecision.nodeId);
    expect(link.get("labels")).toContain("Decision");
  });

  it("supersedeDecision rejects a non-Decision target", async () => {
    await expect(
      supersedeDecision(
        { client, sql, ctx: adminCtx },
        {
          oldDecisionId: "postgres:companies:org-a", // Organization, not Decision
          newDecision: {
            agentId: "cos",
            sessionId: "sess-sup-2",
            rationale: "Attempted to supersede a non-Decision node.",
          },
        },
      ),
    ).rejects.toThrow(/not found or not a Decision/);
  });

  it("is idempotent on caller-supplied newDecisionId", async () => {
    const old = await recordDecision(
      { client, sql, ctx: adminCtx },
      {
        agentId: "cos",
        sessionId: "sess-sup-3",
        rationale: "Initial pricing decision: $99/mo flat.",
        decisionId: "dec-old-3",
      },
    );

    const input = {
      oldDecisionId: old.nodeId,
      newDecisionId: "dec-new-3",
      newDecision: {
        agentId: "cos",
        sessionId: "sess-sup-3",
        rationale: "Revised: tiered pricing $49/$99/$199.",
      },
    };

    const first = await supersedeDecision(
      { client, sql, ctx: adminCtx },
      input,
    );
    const second = await supersedeDecision(
      { client, sql, ctx: adminCtx },
      input,
    );

    expect(first.alreadyExisted).toBe(false);
    expect(second.alreadyExisted).toBe(true);
    expect(first.newDecision.nodeId).toBe(second.newDecision.nodeId);

    const counts = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (newD {id: 'agent:decision:dec-new-3'})
         OPTIONAL MATCH (newD)-[r:SUPERSEDES]->(:Decision {id: $oldId})
         RETURN count(DISTINCT newD) AS nodes, count(r) AS edges`,
        { oldId: old.nodeId },
      );
      return r.records[0];
    });
    expect(counts.get("nodes") as number).toBe(1);
    expect(counts.get("edges") as number).toBe(1);

    const oldRef = await client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (d {id: $oldId}) RETURN d.superseded_by AS ref",
        { oldId: old.nodeId },
      );
      return r.records[0].get("ref") as string;
    });
    expect(oldRef).toBe("agent:decision:dec-new-3");
  });
});
