import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import {
  createPostgresClient,
  type PostgresClient,
} from "../../src/client/postgres.js";
import {
  recordDecision,
  recordObservation,
  recordPlan,
} from "../../src/writes/agent-memory.js";
import { KgAuthError } from "../../src/auth/middleware.js";
import type { AgentContext } from "../../src/types.js";

const adminCtx: AgentContext = {
  actorKind: "agent",
  actorId: "cos",
  role: "admin",
};

const readerCtx: AgentContext = {
  actorKind: "agent",
  actorId: "viewer",
  role: "reader",
};

describe("agent memory writers", () => {
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

    // Seed two Organization nodes the agent can reference.
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Organization {id: 'postgres:companies:org-1', type: 'Organization', name: 'Org One', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Organization {id: 'postgres:companies:org-2', type: 'Organization', name: 'Org Two', is_stub: false})`,
      );
    });
  }, 180_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("records an observation with no refs", async () => {
    const res = await recordObservation(
      { client, sql, ctx: adminCtx },
      {
        agentId: "cos",
        sessionId: "sess-001",
        rationale: "Q1 revenue trending below plan based on Mar gross sales.",
      },
    );
    expect(res.nodeId).toMatch(/^agent:observation:/);
    expect(res.edgeIds).toHaveLength(0);

    const node = await client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (n {id: $id}) RETURN labels(n) AS labels, n.type AS type, n.agent_id AS agent, n.session_id AS sess, n.rationale AS r, n.prov_source_type AS src, n.prov_extraction_method AS method",
        { id: res.nodeId },
      );
      return r.records[0];
    });
    expect(node.get("labels")).toContain("Observation");
    expect(node.get("type")).toBe("Observation");
    expect(node.get("agent")).toBe("cos");
    expect(node.get("sess")).toBe("sess-001");
    expect(node.get("r")).toContain("Q1 revenue");
    expect(node.get("src")).toBe("agent");
    expect(node.get("method")).toBe("agent_write");
  });

  it("records an observation with two existing targets — both edges merge", async () => {
    const res = await recordObservation(
      { client, sql, ctx: adminCtx },
      {
        agentId: "cos",
        sessionId: "sess-002",
        rationale: "Both orgs went dark this month.",
        about: ["postgres:companies:org-1", "postgres:companies:org-2"],
        observationId: "obs-both",
      },
    );
    expect(res.nodeId).toBe("agent:observation:obs-both");
    expect(res.edgeIds).toHaveLength(2);

    const targets = await client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (o {id: $obs})-[:OBSERVED_FROM]->(t) RETURN t.id AS id ORDER BY t.id",
        { obs: res.nodeId },
      );
      return r.records.map((rec) => rec.get("id") as string);
    });
    expect(targets).toEqual([
      "postgres:companies:org-1",
      "postgres:companies:org-2",
    ]);
  });

  it("skips non-existent refs and reports them in audit", async () => {
    const fakeId = "postgres:companies:ghost";
    const res = await recordObservation(
      { client, sql, ctx: adminCtx },
      {
        agentId: "cos",
        sessionId: "sess-003",
        rationale: "Half real, half fake refs.",
        about: ["postgres:companies:org-1", fakeId],
        observationId: "obs-mixed",
      },
    );
    expect(res.edgeIds).toHaveLength(1);
    expect(res.edgeIds[0]).toContain("postgres:companies:org-1");

    const ghost = await client.read(async (tx) => {
      const r = await tx.run("MATCH (n {id: $id}) RETURN count(n) AS c", {
        id: fakeId,
      });
      return r.records[0].get("c") as number;
    });
    expect(ghost).toBe(0); // no stub should have been created

    const audit = await sql`
      SELECT result_summary FROM kg_audit_log
      WHERE target_node_id = ${res.nodeId} AND success = true
      ORDER BY id DESC LIMIT 1`;
    expect(audit.length).toBe(1);
    expect(audit[0].result_summary).toMatchObject({ skippedRefs: [fakeId] });
  });

  it("records a decision with basedOn linking to an observation", async () => {
    const obs = await recordObservation(
      { client, sql, ctx: adminCtx },
      {
        agentId: "cos",
        sessionId: "sess-004",
        rationale: "Reviewed Q1 pipeline, weighted forecast is $X.",
        observationId: "obs-for-decision",
      },
    );
    const decision = await recordDecision(
      { client, sql, ctx: adminCtx },
      {
        agentId: "cos",
        sessionId: "sess-004",
        rationale: "Cut spend by 15% next quarter.",
        basedOn: [obs.nodeId],
        alternatives: ["Hold spend flat", "Cut by 25%"],
        decisionId: "dec-001",
      },
    );
    expect(decision.nodeId).toBe("agent:decision:dec-001");
    expect(decision.edgeIds).toHaveLength(1);

    const link = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (d {id: $dec})-[:BASED_ON]->(o {id: $obs}) RETURN d.alternatives AS alts, labels(d) AS labels`,
        { dec: decision.nodeId, obs: obs.nodeId },
      );
      return r.records[0];
    });
    expect(link.get("labels")).toContain("Decision");
    expect(link.get("alts")).toEqual(["Hold spend flat", "Cut by 25%"]);
  });

  it("records a plan with goal, steps, and default status 'active'", async () => {
    const res = await recordPlan(
      { client, sql, ctx: adminCtx },
      {
        agentId: "cos",
        sessionId: "sess-005",
        goal: "Land 3 new Pro-tier clients in Q2",
        steps: [
          "Audit current pipeline",
          "Identify top 10 warm leads",
          "Send tailored outreach",
        ],
        planId: "plan-q2",
      },
    );
    expect(res.nodeId).toBe("agent:plan:plan-q2");

    const node = await client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (p {id: $id}) RETURN labels(p) AS labels, p.goal AS goal, p.steps AS steps, p.status AS status",
        { id: res.nodeId },
      );
      return r.records[0];
    });
    expect(node.get("labels")).toContain("Plan");
    expect(node.get("goal")).toBe("Land 3 new Pro-tier clients in Q2");
    expect(node.get("steps")).toEqual([
      "Audit current pipeline",
      "Identify top 10 warm leads",
      "Send tailored outreach",
    ]);
    expect(node.get("status")).toBe("active");
  });

  it("is idempotent on caller-supplied id (no duplicate edges)", async () => {
    const input = {
      agentId: "cos",
      sessionId: "sess-idem",
      rationale: "Repeated observation.",
      about: ["postgres:companies:org-1"],
      observationId: "obs-idem",
    };
    await recordObservation({ client, sql, ctx: adminCtx }, input);
    await recordObservation({ client, sql, ctx: adminCtx }, input);

    const counts = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (n {id: 'agent:observation:obs-idem'})
         OPTIONAL MATCH (n)-[e:OBSERVED_FROM]->()
         RETURN count(DISTINCT n) AS nodes, count(e) AS edges`,
      );
      return r.records[0];
    });
    expect(counts.get("nodes") as number).toBe(1);
    expect(counts.get("edges") as number).toBe(1);
  });

  it("denies writes when ctx.role lacks scope (reader) and records failure audit", async () => {
    await expect(
      recordObservation(
        { client, sql, ctx: readerCtx },
        {
          agentId: "viewer",
          sessionId: "sess-deny",
          rationale: "Reader shouldn't be allowed to write.",
        },
      ),
    ).rejects.toBeInstanceOf(KgAuthError);

    const audit = await sql`
      SELECT * FROM kg_audit_log
      WHERE actor_id = 'viewer' AND success = false AND tool = 'recordObservation'
      ORDER BY id DESC LIMIT 1`;
    expect(audit.length).toBe(1);
    expect(audit[0].error_message).toMatch(/role/);
  });
});
