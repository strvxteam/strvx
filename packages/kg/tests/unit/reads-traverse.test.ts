import { describe, expect, it, vi } from "vitest";
import { traverse } from "../../src/reads/traverse.js";
import type { AgentContext } from "../../src/types.js";
import type { Neo4jClient } from "../../src/client/neo4j.js";
import type { PostgresClient } from "../../src/client/postgres.js";

const readerCtx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

function provProps() {
  return {
    prov_source_type: "postgres",
    prov_source_id: "pg:1",
    prov_source_record_id: "1",
    prov_extraction_method: "cdc",
    prov_extracted_at: new Date().toISOString(),
    prov_last_validated_at: new Date().toISOString(),
    prov_validation_count: 1,
    prov_confidence: 0.9,
    prov_trust_score: 0.9,
    prov_created_by: "cdc",
  };
}

function makeSql() {
  const fn = vi.fn().mockResolvedValue([]);
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return fn as unknown as PostgresClient;
}

/**
 * Build a neo4j client mock.
 * If twoCalls=true, the second tx.run (for resolving from/to) returns fromTo rows.
 */
function makeNeoClient(
  firstRunRecords: unknown[],
  fromToRows: Array<{ id: string; fromId: string; toId: string }> = [],
  throwError?: Error,
): Neo4jClient {
  const read = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    if (throwError) throw throwError;
    let callCount = 0;
    return work({
      run: vi.fn().mockImplementation(async () => {
        if (callCount === 0) {
          callCount++;
          return { records: firstRunRecords };
        }
        return {
          records: fromToRows.map((r) => ({
            get: (key: string) => {
              if (key === "id") return r.id;
              if (key === "fromId") return r.fromId;
              if (key === "toId") return r.toId;
            },
          })),
        };
      }),
    });
  });
  return { read } as unknown as Neo4jClient;
}

describe("traverse", () => {
  it("returns empty results when no records", async () => {
    const client = makeNeoClient([]);
    const result = await traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", {});
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("returns nodes and edges with from/to resolved", async () => {
    const nodeProps = { id: "pg:2", type: "Organization", name: "Acme", ...provProps() };
    const relProps = { id: "rel:1", ...provProps() };
    const record = {
      get: (key: string) => {
        if (key === "n") return { properties: nodeProps };
        if (key === "labels") return ["Organization"];
        if (key === "r") return [{ properties: relProps, type: "WORKS_AT" }];
      },
    };
    const client = makeNeoClient(
      [record],
      [{ id: "rel:1", fromId: "pg:1", toId: "pg:2" }],
    );
    const result = await traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", {
      direction: "outgoing",
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from).toBe("pg:1");
    expect(result.edges[0].to).toBe("pg:2");
  });

  it("handles 'incoming' direction", async () => {
    const client = makeNeoClient([]);
    const result = await traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", {
      direction: "incoming",
    });
    expect(result.nodes).toHaveLength(0);
  });

  it("handles 'any' direction (default)", async () => {
    const client = makeNeoClient([]);
    const result = await traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", {
      direction: "any",
    });
    expect(result.nodes).toHaveLength(0);
  });

  it("validates relationship type identifiers", async () => {
    const client = makeNeoClient([]);
    await expect(
      traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", {
        relationshipTypes: ["WORKS_AT; DROP TABLE"],
      }),
    ).rejects.toThrow("invalid relationship type identifier");
  });

  it("accepts valid relationship types", async () => {
    const client = makeNeoClient([]);
    await expect(
      traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", {
        relationshipTypes: ["WORKS_AT", "ASSIGNED_TO"],
      }),
    ).resolves.toBeDefined();
  });

  it("clamps maxDepth to [1, 4]", async () => {
    const client = makeNeoClient([]);
    // Depth 0 → clamped to 1, depth 99 → clamped to 4 — no error, just valid queries
    await expect(
      traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", { maxDepth: 0 }),
    ).resolves.toBeDefined();
    await expect(
      traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", { maxDepth: 99 }),
    ).resolves.toBeDefined();
  });

  it("writes audit entry on error and rethrows", async () => {
    const client = makeNeoClient([], [], new Error("neo4j fail"));
    const sql = makeSql();
    await expect(
      traverse({ client, sql, ctx: readerCtx }, "pg:1", {}),
    ).rejects.toThrow("neo4j fail");
    expect(sql).toHaveBeenCalledOnce();
  });

  it("deduplicates edges that appear in multiple records", async () => {
    const nodeProps = { id: "pg:2", type: "Organization", name: "Acme", ...provProps() };
    const relProps = { id: "rel:1", ...provProps() };
    const record = {
      get: (key: string) => {
        if (key === "n") return { properties: nodeProps };
        if (key === "labels") return ["Organization"];
        if (key === "r") return [{ properties: relProps, type: "WORKS_AT" }];
      },
    };
    // Same record twice — edge should be deduped
    const client = makeNeoClient(
      [record, record],
      [{ id: "rel:1", fromId: "pg:1", toId: "pg:2" }],
    );
    const result = await traverse({ client, sql: makeSql(), ctx: readerCtx }, "pg:1", {});
    expect(result.edges).toHaveLength(1);
    expect(result.nodes).toHaveLength(1); // deduped by Map
  });
});
