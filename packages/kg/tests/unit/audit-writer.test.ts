import { describe, expect, it, vi } from "vitest";
import { writeAuditEntry } from "../../src/audit/writer.js";
import type { AuditEntry } from "../../src/audit/writer.js";
import type { PostgresClient } from "../../src/client/postgres.js";

function makeSql(impl?: () => unknown): PostgresClient {
  const sql = vi.fn(impl ?? (() => Promise.resolve([])));
  (sql as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return sql as unknown as PostgresClient;
}

describe("writeAuditEntry", () => {
  it("inserts a successful entry with all optional fields", async () => {
    const sql = makeSql();
    const entry: AuditEntry = {
      actorKind: "agent",
      actorId: "agent:cos",
      tool: "getNode",
      targetNodeId: "n1",
      targetEdgeId: "e1",
      parameters: { id: "n1" },
      resultSummary: { found: true },
      latencyMs: 42,
      success: true,
    };
    await expect(writeAuditEntry(sql, entry)).resolves.toBeUndefined();
    expect(sql).toHaveBeenCalledOnce();
  });

  it("inserts a failed entry with errorMessage", async () => {
    const sql = makeSql();
    const entry: AuditEntry = {
      actorKind: "user",
      actorId: "user:1",
      tool: "runCypher",
      success: false,
      errorMessage: "forbidden keyword",
    };
    await expect(writeAuditEntry(sql, entry)).resolves.toBeUndefined();
    expect(sql).toHaveBeenCalledOnce();
  });

  it("inserts a system entry with minimal required fields", async () => {
    const sql = makeSql();
    const entry: AuditEntry = {
      actorKind: "system",
      actorId: "system",
      tool: "ingest",
      success: true,
    };
    await expect(writeAuditEntry(sql, entry)).resolves.toBeUndefined();
  });

  it("propagates SQL errors", async () => {
    const sql = makeSql(() => { throw new Error("db down"); });
    const entry: AuditEntry = {
      actorKind: "agent",
      actorId: "agent:cos",
      tool: "getNode",
      success: true,
    };
    await expect(writeAuditEntry(sql, entry)).rejects.toThrow("db down");
  });
});
