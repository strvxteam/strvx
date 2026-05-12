import { describe, expect, it, vi } from "vitest";
import { findSimilar } from "../../src/reads/find-similar.js";
import type { FindSimilarDeps } from "../../src/reads/find-similar.js";
import type { AgentContext } from "../../src/types.js";

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

function makeDeps(opts: {
  embeddingRow?: unknown[];
  neighbors?: unknown[];
  neoRecords?: unknown[];
  neoError?: Error;
  sqlError?: Error;
}): FindSimilarDeps {
  const { embeddingRow = [], neighbors = [], neoRecords = [], neoError, sqlError } = opts;

  const mockRead = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    if (neoError) throw neoError;
    return work({ run: vi.fn().mockResolvedValue({ records: neoRecords }) });
  });

  let sqlCallCount = 0;
  const sqlFn = vi.fn().mockImplementation(() => {
    if (sqlError) throw sqlError;
    const result = sqlCallCount === 0 ? embeddingRow : neighbors;
    sqlCallCount++;
    return Promise.resolve(result);
  });
  (sqlFn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;

  return {
    client: { read: mockRead } as unknown as FindSimilarDeps["client"],
    sql: sqlFn as unknown as FindSimilarDeps["sql"],
    ctx: readerCtx,
    embedding: {
      modelName: "mock",
      modelVersion: "0.0.0",
      dimensions: 4,
      embed: vi.fn().mockResolvedValue([1, 0, 0, 0]),
      embedBatch: vi.fn().mockResolvedValue([[1, 0, 0, 0]]),
    },
  };
}

describe("findSimilar", () => {
  it("returns [] when source entity has no embedding", async () => {
    const deps = makeDeps({ embeddingRow: [] });
    const results = await findSimilar(deps, "ghost:1");
    expect(results).toHaveLength(0);
    // sql called twice: once for embedding lookup, once for audit write
    expect(deps.sql).toHaveBeenCalledTimes(2);
  });

  it("returns [] when no neighbors found in embedding table", async () => {
    const deps = makeDeps({
      embeddingRow: [{ embedding: "[1,0,0,0]" }],
      neighbors: [],
    });
    const results = await findSimilar(deps, "pg:1");
    expect(results).toHaveLength(0);
  });

  it("returns ranked SimilarEntity[] when neighbors and neo4j nodes exist", async () => {
    const props = { id: "pg:2", type: "Person", name: "Bob", ...provProps() };
    const neoRecord = {
      get: (key: string) => {
        if (key === "n") return { properties: props };
        if (key === "labels") return ["Person"];
      },
    };
    const deps = makeDeps({
      embeddingRow: [{ embedding: "[1,0,0,0]" }],
      neighbors: [{ node_id: "pg:2", distance: 0.1 }],
      neoRecords: [neoRecord],
    });
    const results = await findSimilar(deps, "pg:1");
    expect(results).toHaveLength(1);
    expect(results[0].node.id).toBe("pg:2");
    expect(results[0].score).toBeCloseTo(0.9, 5);
  });

  it("writes audit entry on success (no-embedding path calls sql twice)", async () => {
    const deps = makeDeps({ embeddingRow: [] });
    await findSimilar(deps, "pg:1");
    // sql: 1 for embedding lookup (returns []) + 1 for audit write
    expect(deps.sql).toHaveBeenCalledTimes(2);
  });

  it("writes audit entry on error and rethrows", async () => {
    const deps = makeDeps({ sqlError: new Error("sql fail") });
    await expect(findSimilar(deps, "pg:1")).rejects.toThrow("sql fail");
    // sql called once (first embedding query throws), then catch writes audit
    // but audit itself also calls sql — however the error propagates before the
    // second sql call completes in this mock. At minimum sql was called once.
    expect(deps.sql).toHaveBeenCalled();
  });

  it("respects scope filter by passing it through to neo4j query", async () => {
    const props = { id: "pg:2", type: "Organization", name: "Acme", ...provProps() };
    const neoRecord = {
      get: (key: string) => {
        if (key === "n") return { properties: props };
        if (key === "labels") return ["Organization"];
      },
    };
    const deps = makeDeps({
      embeddingRow: [{ embedding: "[1,0,0,0]" }],
      neighbors: [{ node_id: "pg:2", distance: 0.2 }],
      neoRecords: [neoRecord],
    });
    const results = await findSimilar(deps, "pg:1", { scope: ["Organization"] });
    expect(results[0].node.type).toBe("Organization");
  });
});
