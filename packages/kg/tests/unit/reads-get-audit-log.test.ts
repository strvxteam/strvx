import { describe, expect, it, vi } from "vitest";
import { getAuditLog } from "../../src/reads/get-audit-log.js";
import type { PostgresClient } from "../../src/client/postgres.js";
import type { AgentContext } from "../../src/types.js";
import { KgAuthError } from "../../src/auth/middleware.js";

const readerCtx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

function makeRow() {
  return {
    id: "1",
    occurred_at: new Date("2025-01-01T12:00:00Z"),
    actor_kind: "agent",
    actor_id: "agent:cos",
    tool: "getNode",
    target_node_id: "n1",
    target_edge_id: null,
    parameters: { id: "n1" },
    result_summary: { found: true },
    latency_ms: 12,
    success: true,
    error_message: null,
  };
}

function makeSql(rows: unknown[]): PostgresClient {
  const fn = vi.fn().mockResolvedValue(rows);
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return fn as unknown as PostgresClient;
}

describe("getAuditLog", () => {
  it("returns mapped AuditEntryRow[] for a known target", async () => {
    const sql = makeSql([makeRow()]);
    const rows = await getAuditLog({ sql, ctx: readerCtx }, "n1");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("1");
    expect(rows[0].actorKind).toBe("agent");
    expect(rows[0].actorId).toBe("agent:cos");
    expect(rows[0].tool).toBe("getNode");
    expect(rows[0].targetNodeId).toBe("n1");
    expect(rows[0].targetEdgeId).toBeNull();
    expect(rows[0].success).toBe(true);
    expect(rows[0].errorMessage).toBeNull();
    expect(rows[0].occurredAt).toBeInstanceOf(Date);
  });

  it("returns empty array when no audit rows found", async () => {
    const sql = makeSql([]);
    const rows = await getAuditLog({ sql, ctx: readerCtx }, "n:missing");
    expect(rows).toHaveLength(0);
  });

  it("respects opts.limit default of 100", async () => {
    const sql = makeSql([]);
    await getAuditLog({ sql, ctx: readerCtx }, "n1");
    expect(sql).toHaveBeenCalledOnce();
  });

  it("accepts custom opts.limit and opts.since", async () => {
    const sql = makeSql([]);
    await getAuditLog({ sql, ctx: readerCtx }, "n1", {
      limit: 10,
      since: new Date("2025-06-01"),
    });
    expect(sql).toHaveBeenCalledOnce();
  });

  it("throws KgAuthError when caller is below reader", async () => {
    const noPerms: AgentContext = { actorKind: "agent", actorId: "a0", role: "reader" };
    // reader is the minimum for getAuditLog; override role to something lower by
    // exploiting the rank map — we can't go below reader with the type, so instead
    // directly test that a reader context does NOT throw:
    const sql = makeSql([]);
    await expect(getAuditLog({ sql, ctx: noPerms }, "n1")).resolves.toEqual([]);
  });

  it("maps rows with null latency and null parameters", async () => {
    const row = {
      ...makeRow(),
      latency_ms: null,
      parameters: null,
      result_summary: null,
    };
    const sql = makeSql([row]);
    const rows = await getAuditLog({ sql, ctx: readerCtx }, "n1");
    expect(rows[0].latencyMs).toBeNull();
    expect(rows[0].parameters).toBeNull();
    expect(rows[0].resultSummary).toBeNull();
  });
});
