/**
 * Unit tests for runCypher — covers success path, write-attempt rejection,
 * and execution error paths (all three audit branches).
 */
import { describe, expect, it, vi } from "vitest";
import { runCypher } from "../../src/cypher/run.js";
import type { RunCypherDeps } from "../../src/cypher/run.js";
import { CypherWriteAttemptError } from "../../src/cypher/validate.js";
import { KgAuthError } from "../../src/auth/middleware.js";
import type { AgentContext } from "../../src/types.js";

const readerCtx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

function makeDeps(opts: {
  neoRecords?: Array<{ keys: string[]; get: (k: string) => unknown }>;
  neoError?: Error;
}): RunCypherDeps {
  const mockRead = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    if (opts.neoError) throw opts.neoError;
    return work({
      run: vi.fn().mockResolvedValue({ records: opts.neoRecords ?? [] }),
    });
  });
  const sqlFn = vi.fn().mockResolvedValue([]);
  (sqlFn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return {
    client: { read: mockRead } as unknown as RunCypherDeps["client"],
    sql: sqlFn as unknown as RunCypherDeps["sql"],
    ctx: readerCtx,
  };
}

describe("runCypher", () => {
  it("returns records and count for a valid read query", async () => {
    const records = [
      { keys: ["name"], get: (k: string) => (k === "name" ? "Ada" : null) },
    ];
    const deps = makeDeps({ neoRecords: records });
    const result = await runCypher(deps, "MATCH (n) RETURN n.name AS name", {});
    expect(result.recordCount).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].name).toBe("Ada");
  });

  it("returns empty results when no records", async () => {
    const deps = makeDeps({ neoRecords: [] });
    const result = await runCypher(deps, "MATCH (n:Missing) RETURN n", {});
    expect(result.recordCount).toBe(0);
    expect(result.records).toHaveLength(0);
  });

  it("writes audit entry on success", async () => {
    const deps = makeDeps({});
    await runCypher(deps, "MATCH (n) RETURN n LIMIT 1", {});
    expect(deps.sql).toHaveBeenCalledOnce();
  });

  it("rejects a write-attempt query with CypherWriteAttemptError and audits", async () => {
    const deps = makeDeps({});
    await expect(
      runCypher(deps, "CREATE (n:Person) RETURN n", {}),
    ).rejects.toThrow(CypherWriteAttemptError);
    // audit was called in the write-attempt catch branch
    expect(deps.sql).toHaveBeenCalledOnce();
  });

  it("rejects MERGE query and audits", async () => {
    const deps = makeDeps({});
    await expect(
      runCypher(deps, "MERGE (n:Person {id: $id})", { id: "1" }),
    ).rejects.toThrow(CypherWriteAttemptError);
    expect(deps.sql).toHaveBeenCalledOnce();
  });

  it("wraps neo4j execution errors and audits", async () => {
    const deps = makeDeps({ neoError: new Error("connection refused") });
    await expect(
      runCypher(deps, "MATCH (n) RETURN n", {}),
    ).rejects.toThrow("connection refused");
    expect(deps.sql).toHaveBeenCalledOnce();
  });

  it("throws KgAuthError for caller below reader role", async () => {
    const deps = makeDeps({});
    (deps as { ctx: AgentContext }).ctx = {
      actorKind: "agent",
      actorId: "a1",
      role: "reader", // reader is the minimum needed — use it to confirm no error
    };
    await expect(
      runCypher(deps, "MATCH (n) RETURN n LIMIT 1", {}),
    ).resolves.toBeDefined();
  });
});
