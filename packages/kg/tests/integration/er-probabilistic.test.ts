import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import {
  createPostgresClient,
  type PostgresClient,
} from "../../src/client/postgres.js";
import { resolveProbabilistic } from "../../src/er/probabilistic.js";
import { MockLLMProvider } from "../../src/llm/index.js";
import type { AgentContext } from "../../src/types.js";
import { linkEntities } from "../../src/writes/links.js";

const adminCtx: AgentContext = {
  actorKind: "agent",
  actorId: "er-bot",
  role: "admin",
  sessionId: "sess-prob-er",
};

describe("resolveProbabilistic — probabilistic entity resolution", () => {
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
    // Apply the 0011 migration body inline.
    await pg.sql`CREATE TABLE kg_er_review_queue (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      candidate_a_id     text NOT NULL,
      candidate_b_id     text NOT NULL,
      entity_type        text NOT NULL,
      score              numeric(5,4) NOT NULL,
      method             text NOT NULL,
      features           jsonb NOT NULL DEFAULT '{}',
      status             text NOT NULL DEFAULT 'pending',
      decided_by         text,
      decided_at         timestamptz,
      created_at         timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT kg_er_review_queue_pair_method_unique
        UNIQUE (candidate_a_id, candidate_b_id, method)
    )`;
    await pg.sql`CREATE INDEX kg_er_review_queue_status_idx ON kg_er_review_queue (status)`;
    await pg.sql`CREATE INDEX kg_er_review_queue_created_idx ON kg_er_review_queue (created_at DESC)`;
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
    await client.unsafeWrite(async (tx) => {
      await tx.run("MATCH (n) DETACH DELETE n");
    });
    await sql`TRUNCATE kg_audit_log`;
    await sql`TRUNCATE kg_er_review_queue`;
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function seedPerson(
    id: string,
    name: string,
    extras: { email?: string | null; domain?: string | null } = {},
  ): Promise<void> {
    await client.unsafeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Person {id: $id, type: 'Person', name: $name, email: $email, domain: $domain, is_stub: false})`,
        {
          id,
          name,
          email: extras.email ?? null,
          domain: extras.domain ?? null,
        },
      );
    });
  }

  async function countSameAs(): Promise<number> {
    return client.read(async (tx) => {
      const r = await tx.run(
        "MATCH ()-[r:SAME_AS]->() RETURN count(r) AS c",
      );
      return r.records[0].get("c") as number;
    });
  }

  async function countQueue(): Promise<number> {
    const rows = await sql`SELECT count(*)::int AS c FROM kg_er_review_queue`;
    return rows[0].c as number;
  }

  // ── Tests ────────────────────────────────────────────────────────────────

  it("very similar names + matching domain → auto-merge", async () => {
    // JW("jonathan smith", "jonathon smith") ≈ 0.971 ≥ autoMergeThreshold.
    // Matching domain is a corroborating signal; not strictly required here.
    await seedPerson("p-1", "Jonathan Smith", { domain: "acme.com" });
    await seedPerson("p-2", "Jonathon Smith", { domain: "acme.com" });

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"] },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    expect(person.autoMerged).toBe(1);
    expect(person.queued).toBe(0);
    expect(await countSameAs()).toBe(1);
    expect(await countQueue()).toBe(0);
  });

  it("similar names + different emails → capped to review band, queued not merged", async () => {
    // JW("jonathan smith", "jonathon smith") ≈ 0.971 — would auto-merge on
    // names alone. Different emails cap the score at the review threshold so
    // the pair lands in kg_er_review_queue rather than getting a SAME_AS edge.
    await seedPerson("p-1", "Jonathan Smith", { email: "j.smith@x.com" });
    await seedPerson("p-2", "Jonathon Smith", { email: "jon.smith@y.com" });

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"] },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    expect(person.autoMerged).toBe(0);
    expect(person.queued).toBe(1);
    expect(await countSameAs()).toBe(0);

    const rows = await sql<
      Array<{ score: string; method: string; entity_type: string }>
    >`SELECT score::text AS score, method, entity_type FROM kg_er_review_queue`;
    expect(rows.length).toBe(1);
    expect(parseFloat(rows[0].score)).toBeCloseTo(0.85, 4);
    expect(rows[0].method).toBe("jaro_winkler");
    expect(rows[0].entity_type).toBe("Person");
  });

  it("very different names → dropped (no link, no queue)", async () => {
    await seedPerson("p-1", "Bob Smith");
    await seedPerson("p-2", "Xerxes Quinn");

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"] },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    // 'B' and 'X' are in different blocks → no pairs scored.
    expect(person.autoMerged).toBe(0);
    expect(person.queued).toBe(0);
    expect(await countSameAs()).toBe(0);
    expect(await countQueue()).toBe(0);
  });

  it("LLM tiebreaker: same_entity=true,confidence=0.95 boosts a 0.90 pair to auto-merge", async () => {
    // Names that score ~0.91 — close but not auto-merge — and no email/domain
    // attribute boost, so the score lands in the review band.
    await seedPerson("p-1", "Catherine Mendez");
    await seedPerson("p-2", "Cathrine Mendez");

    const llm = new MockLLMProvider({
      responses: [
        {
          kind: "json",
          data: {
            same_entity: true,
            confidence: 0.95,
            reasoning: "Same name, single typo.",
          },
        },
      ],
    });

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"], llm },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    expect(person.llmCalls).toBe(1);
    expect(person.autoMerged).toBe(1);
    expect(await countSameAs()).toBe(1);
    expect(await countQueue()).toBe(0);
  });

  it("LLM tiebreaker: same_entity=false,confidence=0.95 drops the pair", async () => {
    await seedPerson("p-1", "Catherine Mendez");
    await seedPerson("p-2", "Cathrine Mendez");

    const llm = new MockLLMProvider({
      responses: [
        {
          kind: "json",
          data: {
            same_entity: false,
            confidence: 0.95,
            reasoning: "Different people who share a surname.",
          },
        },
      ],
    });

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"], llm },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    expect(person.llmCalls).toBe(1);
    expect(person.autoMerged).toBe(0);
    expect(person.queued).toBe(0);
    expect(await countSameAs()).toBe(0);
    expect(await countQueue()).toBe(0);
  });

  it("respects maxLLMCalls cap", async () => {
    // Three borderline pairs all in the 'c' block.
    await seedPerson("p-1", "Catherine Mendez");
    await seedPerson("p-2", "Cathrine Mendez");
    await seedPerson("p-3", "Cathryn Mendez");

    const llm = new MockLLMProvider({
      responses: [
        // Both responses say NOT same → those two pairs drop.
        { kind: "json", data: { same_entity: false, confidence: 0.95, reasoning: "n/a" } },
        { kind: "json", data: { same_entity: false, confidence: 0.95, reasoning: "n/a" } },
      ],
    });

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"], llm, maxLLMCalls: 2 },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    expect(person.llmCalls).toBe(2);
    // The pair NOT touched by LLM keeps its original score and is queued.
    expect(person.queued).toBeGreaterThanOrEqual(1);
  });

  it("respects maxPairsPerBlock — large block sampled", async () => {
    // 50 'Alice <n>' nodes all in the 'a' block. Without a cap the worker
    // would score N*(N-1)/2 = 1225 pairs. With cap=10 we expect ≤ 10.
    for (let i = 1; i <= 50; i++) {
      await seedPerson(`p-a-${i.toString().padStart(2, "0")}`, `Alice ${i}`);
    }

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"], maxPairsPerBlock: 10 },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    expect(person.candidateNodes).toBe(50);
    expect(person.blocks).toBe(1);
    expect(person.pairsScored).toBeLessThanOrEqual(10);
  });

  it("dryRun does not write edges or queue rows", async () => {
    await seedPerson("p-1", "Jonathan Smith", { domain: "acme.com" });
    await seedPerson("p-2", "Jonathon Smith", { domain: "acme.com" });

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"], dryRun: true },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    expect(person.autoMerged).toBe(1); // reports would-be count
    expect(await countSameAs()).toBe(0);
    expect(await countQueue()).toBe(0);
  });

  it("skips pairs that already have a SAME_AS edge", async () => {
    await seedPerson("p-1", "Jonathan Smith", { domain: "acme.com" });
    await seedPerson("p-2", "Jonathon Smith", { domain: "acme.com" });

    // Pre-link via the public writer.
    await linkEntities(
      { client, sql, ctx: adminCtx },
      { aId: "p-1", bId: "p-2", reason: "pre-existing link for test" },
    );
    expect(await countSameAs()).toBe(1);

    const res = await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"] },
    );

    const person = res.byEntityType.find((p) => p.entityType === "Person")!;
    expect(person.autoMerged).toBe(0);
    expect(person.queued).toBe(0);
    expect(await countSameAs()).toBe(1); // unchanged
    expect(await countQueue()).toBe(0);
  });

  it("writes a single summary audit entry tool=resolveProbabilistic", async () => {
    await seedPerson("p-1", "Jonathan Smith", { domain: "acme.com" });
    await seedPerson("p-2", "Jonathon Smith", { domain: "acme.com" });

    await resolveProbabilistic(
      { client, sql, ctx: adminCtx },
      { entityTypes: ["Person"] },
    );

    const rows = await sql<
      Array<{ result_summary: Record<string, unknown>; success: boolean }>
    >`SELECT result_summary, success FROM kg_audit_log
      WHERE tool = 'resolveProbabilistic' ORDER BY id DESC`;
    expect(rows.length).toBe(1);
    expect(rows[0].success).toBe(true);
    const summary = rows[0].result_summary as {
      totals: { autoMerged: number; queued: number };
      byEntityType: Array<{ entityType: string; autoMerged: number }>;
    };
    expect(summary.totals.autoMerged).toBe(1);
    expect(summary.byEntityType[0].entityType).toBe("Person");
  });
});
