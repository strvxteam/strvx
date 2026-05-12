import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgres } from "@strvx/kg/testing";
import { startPostgres } from "@strvx/kg/testing";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { writeAuditEntry } from "../../src/audit/writer.js";
import { getAuditLog } from "../../src/reads/get-audit-log.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("getAuditLog", () => {
  let pg: StartedPostgres;
  let sql: PostgresClient;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key,
      occurred_at timestamptz not null default now(),
      actor_kind text not null, actor_id text not null, tool text not null,
      target_node_id text, target_edge_id text,
      parameters jsonb, result_summary jsonb, latency_ms integer,
      success boolean not null, error_message text)`;
    sql = createPostgresClient(pg.url);
    for (let i = 0; i < 3; i++) {
      await writeAuditEntry(sql, {
        actorKind: "agent",
        actorId: "cos",
        tool: "getNode",
        targetNodeId: "x1",
        parameters: { i },
        success: true,
        latencyMs: 10 + i,
      });
      // small delay so occurred_at differs
      await new Promise((r) => setTimeout(r, 5));
    }
  }, 120_000);

  afterAll(async () => {
    await sql.end();
    await pg.stop();
  });

  it("returns recent entries for a node id, newest first", async () => {
    const r = await getAuditLog({ sql, ctx }, "x1", { limit: 10 });
    expect(r.length).toBe(3);
    expect(r[0].latencyMs).toBe(12); // newest = i=2
  });
});
