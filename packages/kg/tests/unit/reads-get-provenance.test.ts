/**
 * Unit tests for getProvenance — covers the 3 branches:
 *   1. node found → return node provenance
 *   2. node not found, edge found → return edge provenance
 *   3. neither found → return null
 *   4. error path → audit + rethrow
 */
import { describe, expect, it, vi } from "vitest";
import { getProvenance } from "../../src/reads/get-provenance.js";
import type { ReadDeps } from "../../src/reads/get-node.js";
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

/**
 * Build deps where Neo4j read tx.run() can return different results per call.
 * callResponses[0] → first tx.run call (node match), callResponses[1] → second (edge match).
 */
function makeDeps(callResponses: Array<{ records: unknown[] }>): ReadDeps {
  let callCount = 0;
  const mockRead = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    return work({
      run: vi.fn().mockImplementation(async () => {
        const res = callResponses[callCount] ?? { records: [] };
        callCount++;
        return res;
      }),
    });
  });

  const sqlFn = vi.fn().mockResolvedValue([]);
  (sqlFn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;

  return {
    client: { read: mockRead } as unknown as ReadDeps["client"],
    sql: sqlFn as unknown as ReadDeps["sql"],
    ctx: readerCtx,
  };
}

describe("getProvenance", () => {
  it("returns provenance when a node with the id exists", async () => {
    const props = provProps();
    const deps = makeDeps([
      { records: [{ get: () => props }] }, // node match
    ]);
    const prov = await getProvenance(deps, "pg:1");
    expect(prov?.source_type).toBe("postgres");
    expect(prov?.confidence).toBe(0.9);
  });

  it("falls through to edge match when node not found", async () => {
    const props = provProps();
    const deps = makeDeps([
      { records: [] },                                // no node
      { records: [{ get: () => props }] },            // edge found
    ]);
    const prov = await getProvenance(deps, "rel:1");
    expect(prov?.source_type).toBe("postgres");
  });

  it("returns null when neither node nor edge found", async () => {
    const deps = makeDeps([
      { records: [] }, // no node
      { records: [] }, // no edge
    ]);
    const result = await getProvenance(deps, "ghost:1");
    expect(result).toBeNull();
  });

  it("writes audit entry on success", async () => {
    const deps = makeDeps([{ records: [] }, { records: [] }]);
    await getProvenance(deps, "ghost:1");
    expect(deps.sql).toHaveBeenCalledOnce();
  });

  it("writes audit entry on error and rethrows", async () => {
    const mockRead = vi.fn().mockRejectedValue(new Error("db error"));
    const sqlFn = vi.fn().mockResolvedValue([]);
    (sqlFn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
    const deps: ReadDeps = {
      client: { read: mockRead } as unknown as ReadDeps["client"],
      sql: sqlFn as unknown as ReadDeps["sql"],
      ctx: readerCtx,
    };
    await expect(getProvenance(deps, "pg:1")).rejects.toThrow("db error");
    expect(sqlFn).toHaveBeenCalledOnce();
  });
});
