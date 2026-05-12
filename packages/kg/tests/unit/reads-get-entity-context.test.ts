import { describe, expect, it, vi } from "vitest";
import { getEntityContext } from "../../src/reads/get-entity-context.js";
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

function makeNeoRead(records: unknown[]) {
  return vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
    work({ run: vi.fn().mockResolvedValue({ records }) }),
  );
}

describe("getEntityContext", () => {
  it("returns empty context when entity not found", async () => {
    const client = { read: makeNeoRead([]) } as unknown as Neo4jClient;
    const ctx = await getEntityContext({ client, sql: makeSql(), ctx: readerCtx }, "ghost:1");
    expect(ctx.center).toBeNull();
    expect(ctx.nodes).toHaveLength(0);
    expect(ctx.edges).toHaveLength(0);
  });

  it("returns empty context when center record is falsy", async () => {
    const record = {
      get: (key: string) => {
        if (key === "center") return null; // falsy center
        if (key === "centerLabels") return [];
        if (key === "neighbors") return [];
        if (key === "neighborLabels") return [];
        if (key === "paths") return [];
      },
    };
    const client = { read: makeNeoRead([record]) } as unknown as Neo4jClient;
    const ctx = await getEntityContext({ client, sql: makeSql(), ctx: readerCtx }, "ghost:1");
    expect(ctx.center).toBeNull();
  });

  it("returns center + neighbors + edges from neo4j result", async () => {
    const centerProps = { id: "pg:1", type: "Person", name: "Ada", ...provProps() };
    const neighborProps = { id: "pg:2", type: "Organization", name: "Acme", ...provProps() };
    const relProps = {
      id: "rel:1",
      ...provProps(),
    };
    const record = {
      get: (key: string) => {
        if (key === "center") return { properties: centerProps };
        if (key === "centerLabels") return ["Person"];
        if (key === "neighbors") return [{ properties: neighborProps }];
        if (key === "neighborLabels") return [["Organization"]];
        if (key === "paths") return [{
          segments: [{
            start: { properties: { id: "pg:1" } },
            relationship: { type: "WORKS_AT", properties: relProps },
            end: { properties: { id: "pg:2" } },
          }],
        }];
      },
    };
    const client = { read: makeNeoRead([record]) } as unknown as Neo4jClient;
    const result = await getEntityContext(
      { client, sql: makeSql(), ctx: readerCtx },
      "pg:1",
    );
    expect(result.center?.id).toBe("pg:1");
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].type).toBe("WORKS_AT");
  });

  it("deduplicates edges that appear in multiple path segments", async () => {
    const centerProps = { id: "pg:1", type: "Person", name: "Ada", ...provProps() };
    const neighborProps = { id: "pg:2", type: "Organization", name: "Acme", ...provProps() };
    const relProps = { id: "rel:1", ...provProps() };
    const segment = {
      start: { properties: { id: "pg:1" } },
      relationship: { type: "WORKS_AT", properties: relProps },
      end: { properties: { id: "pg:2" } },
    };
    const record = {
      get: (key: string) => {
        if (key === "center") return { properties: centerProps };
        if (key === "centerLabels") return ["Person"];
        if (key === "neighbors") return [{ properties: neighborProps }];
        if (key === "neighborLabels") return [["Organization"]];
        // Two paths, both referencing the same relationship
        if (key === "paths") return [
          { segments: [segment] },
          { segments: [segment] },
        ];
      },
    };
    const client = { read: makeNeoRead([record]) } as unknown as Neo4jClient;
    const result = await getEntityContext({ client, sql: makeSql(), ctx: readerCtx }, "pg:1");
    expect(result.edges).toHaveLength(1); // deduped
  });

  it("writes audit entry on error and rethrows", async () => {
    const mockRead = vi.fn().mockRejectedValue(new Error("neo4j fail"));
    const sql = makeSql();
    await expect(
      getEntityContext({ client: { read: mockRead } as unknown as Neo4jClient, sql, ctx: readerCtx }, "pg:1"),
    ).rejects.toThrow("neo4j fail");
    expect(sql).toHaveBeenCalledOnce();
  });

  it("handles null/undefined neighbors gracefully", async () => {
    const centerProps = { id: "pg:1", type: "Person", name: "Ada", ...provProps() };
    const record = {
      get: (key: string) => {
        if (key === "center") return { properties: centerProps };
        if (key === "centerLabels") return ["Person"];
        if (key === "neighbors") return [null]; // null neighbor
        if (key === "neighborLabels") return [["Person"]];
        if (key === "paths") return [];
      },
    };
    const client = { read: makeNeoRead([record]) } as unknown as Neo4jClient;
    const result = await getEntityContext({ client, sql: makeSql(), ctx: readerCtx }, "pg:1");
    // null neighbors are skipped
    expect(result.nodes).toHaveLength(1); // only center
  });
});
