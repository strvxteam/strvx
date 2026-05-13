import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import { runCosRunsMetadataPurge } from "./cos-runs-metadata-purge";

const NOW = new Date("2026-05-12T03:00:00Z");

type CapturedQuery = {
  sqlText: string;
  args: unknown[];
};

function makeMockDb(rowCount: number) {
  const captured: CapturedQuery[] = [];

  const execute = vi.fn().mockImplementation(async (query: unknown) => {
    // Drizzle's sql template builder exposes a `.queryChunks` array. We
    // walk it and pull string content from a handful of node shapes
    // (StringChunk, Param, raw) so the test can grep without depending on
    // private drizzle helpers.
    const chunks = (query as { queryChunks?: unknown[] }).queryChunks;
    const text = Array.isArray(chunks)
      ? chunks
          .map((c) => stringifyChunk(c))
          .join(" ")
      : String(query);
    captured.push({ sqlText: text, args: [] });
    return { count: rowCount };
  });

  return {
    db: { execute } as unknown as typeof DbType,
    captured,
    execute,
  };
}

function stringifyChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) return "";
  if (typeof chunk === "string") return chunk;
  if (typeof chunk === "number" || typeof chunk === "boolean") return String(chunk);
  if (typeof chunk !== "object") return "";
  const obj = chunk as Record<string, unknown>;
  // StringChunk has .value: string[]
  if (Array.isArray(obj.value)) return obj.value.join("");
  if (typeof obj.value === "string") return obj.value;
  // Recursive shapes (SQL composed).
  if (Array.isArray(obj.queryChunks)) {
    return obj.queryChunks.map((c) => stringifyChunk(c)).join(" ");
  }
  return "";
}

describe("runCosRunsMetadataPurge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits an UPDATE that strips metadata older than 30 days", async () => {
    const fix = makeMockDb(7);
    const result = await runCosRunsMetadataPurge({ db: fix.db, now: NOW });
    expect(result.rowCount).toBe(7);
    expect(fix.execute).toHaveBeenCalledTimes(1);
    const sqlText = fix.captured[0].sqlText.toUpperCase();
    expect(sqlText).toContain("UPDATE");
    expect(sqlText).toContain("METADATA = '{}'::JSONB");
    expect(sqlText).toContain("METADATA != '{}'::JSONB");
  });

  it("honours a custom retentionDays override", async () => {
    const fix = makeMockDb(0);
    const result = await runCosRunsMetadataPurge({
      db: fix.db,
      now: NOW,
      retentionDays: 7,
    });
    expect(result.rowCount).toBe(0);
    expect(fix.execute).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when nothing matches (idempotent re-run)", async () => {
    const fix = makeMockDb(0);
    const result = await runCosRunsMetadataPurge({ db: fix.db, now: NOW });
    expect(result.rowCount).toBe(0);
  });

  it("uses NOW()/INTERVAL when no `now` is provided", async () => {
    const fix = makeMockDb(3);
    await runCosRunsMetadataPurge({ db: fix.db });
    const sqlText = fix.captured[0].sqlText.toUpperCase().replace(/\s+/g, " ");
    expect(sqlText).toContain("NOW()");
    expect(sqlText).toContain("INTERVAL");
    expect(sqlText).toContain("30");
    expect(sqlText).toContain("DAYS");
  });
});
