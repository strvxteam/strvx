import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import {
  createPostgresClient,
  type PostgresClient,
} from "../../src/client/postgres.js";
import {
  DEFAULT_IDENTITY_KEYS,
  resolveDeterministic,
  type IdentityKey,
} from "../../src/er/deterministic.js";
import type { AgentContext } from "../../src/types.js";

const adminCtx: AgentContext = {
  actorKind: "agent",
  actorId: "er-bot",
  role: "admin",
  sessionId: "sess-er",
};

describe("resolveDeterministic — deterministic entity resolution", () => {
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
  }, 180_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  beforeEach(async () => {
    // Wipe the graph and the audit log so each test starts clean.
    await client.unsafeWrite(async (tx) => {
      await tx.run("MATCH (n) DETACH DELETE n");
    });
    await sql`TRUNCATE kg_audit_log`;
  });

  // Helper — only run the person.email key so other defaults don't interfere
  // when the test seeds only Person nodes.
  const personEmailKeyOnly = DEFAULT_IDENTITY_KEYS.filter(
    (k) => k.label === "person.email",
  );

  it("matches two Person nodes by email — creates one SAME_AS edge", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: 'p-1', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-2', type: 'Person', email: 'A@X.com', is_stub: false})`,
      );
    });

    const res = await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: personEmailKeyOnly },
    );

    expect(res.totalLinks).toBe(1);
    expect(res.byKey).toHaveLength(1);
    expect(res.byKey[0].key.label).toBe("person.email");
    expect(res.byKey[0].candidateGroups).toBe(1);
    expect(res.byKey[0].pairsLinked).toBe(1);

    const edge = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (a {id: 'p-1'})-[r:SAME_AS]->(b {id: 'p-2'}) RETURN r.confidence AS conf, r.reason AS reason`,
      );
      return r.records[0];
    });
    expect(edge.get("conf")).toBeCloseTo(0.98, 5);
    expect(edge.get("reason")).toMatch(/deterministic-ER: matched person\.email=/);
  });

  it("ignores Person nodes with null email", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: 'p-1', type: 'Person', email: 'foo@bar.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-2', type: 'Person', email: 'foo@bar.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-3', type: 'Person', is_stub: false})`,
      );
    });

    const res = await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: personEmailKeyOnly },
    );

    expect(res.byKey[0].candidateGroups).toBe(1);
    expect(res.byKey[0].pairsLinked).toBe(1);
    expect(res.totalLinks).toBe(1);
  });

  it("groups of 3+ link all to the canonical node", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: 'p-1', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-2', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-3', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
    });

    const res = await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: personEmailKeyOnly },
    );

    expect(res.byKey[0].candidateGroups).toBe(1);
    expect(res.byKey[0].pairsLinked).toBe(2);

    const count = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (a {id: 'p-1'})-[r:SAME_AS]->(b) WHERE b.id IN ['p-2','p-3'] RETURN count(r) AS c`,
      );
      return r.records[0].get("c") as number;
    });
    expect(count).toBe(2);
  });

  it("respects maxLinksPerKey", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: 'p-1', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-2', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-3', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
    });

    const res = await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: personEmailKeyOnly, maxLinksPerKey: 1 },
    );

    expect(res.byKey[0].pairsLinked).toBe(1);

    const count = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH ()-[r:SAME_AS]->() RETURN count(r) AS c`,
      );
      return r.records[0].get("c") as number;
    });
    expect(count).toBe(1);
  });

  it("dryRun does not write edges", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: 'p-1', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-2', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
    });

    const res = await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: personEmailKeyOnly, dryRun: true },
    );

    expect(res.byKey[0].pairsLinked).toBe(1);
    expect(res.byKey[0].pairsAlreadyExisted).toBe(0);

    const count = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH ()-[r:SAME_AS]->() RETURN count(r) AS c`,
      );
      return r.records[0].get("c") as number;
    });
    expect(count).toBe(0);
  });

  it("skips stub nodes", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: 'p-1', type: 'Person', email: 'a@x.com', is_stub: true})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-2', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
    });

    const res = await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: personEmailKeyOnly },
    );

    expect(res.byKey[0].candidateGroups).toBe(0);
    expect(res.byKey[0].pairsLinked).toBe(0);
  });

  it("rejects an unsafe property name", async () => {
    const evilKey: IdentityKey = {
      entityType: "Person",
      property: "foo; DETACH DELETE n;",
      label: "evil",
      normalize: (v) => (typeof v === "string" ? v : null),
      confidence: 0.99,
    };
    await expect(
      resolveDeterministic(
        { client, sql, ctx: adminCtx },
        { keys: [evilKey] },
      ),
    ).rejects.toThrow(/unsafe property name/);
  });

  it("writes a single summary audit entry", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: 'p-1', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-2', type: 'Person', email: 'a@x.com', is_stub: false})`,
      );
    });

    await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: personEmailKeyOnly },
    );

    const rows = await sql`
      SELECT result_summary, success FROM kg_audit_log
      WHERE tool = 'resolveDeterministic'
      ORDER BY id DESC`;
    expect(rows.length).toBe(1);
    expect(rows[0].success).toBe(true);
    const summary = rows[0].result_summary as {
      totalLinks: number;
      totalAlreadyExisted: number;
      perKey: Array<{ label: string }>;
    };
    expect(summary.totalLinks).toBe(1);
    expect(summary.perKey[0].label).toBe("person.email");
  });

  it("normalizer handles non-string values gracefully (returns null)", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: 'p-1', type: 'Person', email: 42, is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Person {id: 'p-2', type: 'Person', email: 'real@x.com', is_stub: false})`,
      );
    });

    const res = await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: personEmailKeyOnly },
    );

    expect(res.byKey[0].candidateGroups).toBe(0);
    expect(res.byKey[0].pairsLinked).toBe(0);
  });

  it("Organization domain normalization strips https:// and www.", async () => {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Organization {id: 'o-1', type: 'Organization', domain: 'https://www.acme.com', is_stub: false})`,
      );
      await tx.run(
        `CREATE (:Organization {id: 'o-2', type: 'Organization', domain: 'acme.com', is_stub: false})`,
      );
    });

    const orgDomainKey = DEFAULT_IDENTITY_KEYS.filter(
      (k) => k.label === "organization.domain",
    );
    const res = await resolveDeterministic(
      { client, sql, ctx: adminCtx },
      { keys: orgDomainKey },
    );

    expect(res.byKey[0].candidateGroups).toBe(1);
    expect(res.byKey[0].pairsLinked).toBe(1);

    const edge = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (:Organization {id: 'o-1'})-[r:SAME_AS]->(:Organization {id: 'o-2'}) RETURN r.confidence AS conf`,
      );
      return r.records[0];
    });
    expect(edge.get("conf")).toBeCloseTo(0.95, 5);
  });
});
