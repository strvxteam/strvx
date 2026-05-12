import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgres } from "@strvx/kg/testing";
import { startPostgres } from "@strvx/kg/testing";
import { writeAuditEntry } from "../../src/audit/writer.js";
import { createPostgresClient } from "../../src/client/postgres.js";

describe("writeAuditEntry", () => {
  let pg: StartedPostgres;

  beforeAll(async () => {
    pg = await startPostgres();
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
    await client.end();
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
    await client.end();
  });
});
