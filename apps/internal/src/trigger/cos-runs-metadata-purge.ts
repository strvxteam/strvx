import { sql } from "drizzle-orm";
import { schedules, logger } from "./client";
import { db as defaultDb, cosRuns } from "@strvx/db";
import { reportTaskError } from "./_sentry";

export type RunMetadataPurgeArgs = {
  db?: typeof defaultDb;
  /**
   * Override "now" for tests. Combined with `retentionDays` to compute the
   * UPDATE cutoff.
   */
  now?: Date;
  retentionDays?: number;
};

export type RunMetadataPurgeResult = {
  rowCount: number;
};

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Strip metadata jsonb from cos_runs older than `retentionDays`.
 *
 * Note: `cos_runs` has `started_at` (the canonical timestamp) but no
 * dedicated `created_at` column, so we age out on `started_at`. For long-
 * running runs this is identical to "when the row was created".
 *
 * Idempotent — rows already at '{}'::jsonb are filtered out by the
 * `metadata != '{}'::jsonb` predicate, so a second run on the same window
 * is a no-op.
 */
export async function runCosRunsMetadataPurge(
  args: RunMetadataPurgeArgs = {}
): Promise<RunMetadataPurgeResult> {
  const db = args.db ?? defaultDb;
  const retentionDays = args.retentionDays ?? DEFAULT_RETENTION_DAYS;

  // We use parameterised SQL rather than NOW()/INTERVAL so the same query
  // path is exercised in tests where the caller injects a fixed `now`.
  const cutoff = args.now
    ? new Date(args.now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
    : null;

  const result = cutoff
    ? await db.execute(sql`
        UPDATE ${cosRuns}
        SET metadata = '{}'::jsonb
        WHERE ${cosRuns.startedAt} < ${cutoff}
          AND metadata != '{}'::jsonb
      `)
    : await db.execute(sql`
        UPDATE ${cosRuns}
        SET metadata = '{}'::jsonb
        WHERE ${cosRuns.startedAt} < NOW() - INTERVAL '${sql.raw(String(retentionDays))} days'
          AND metadata != '{}'::jsonb
      `);

  // postgres-js returns the underlying result as an array-like with .count
  // (rows affected for UPDATE). Drizzle's typing is loose here, so we
  // narrow defensively.
  const rowCount = extractRowCount(result);

  logger.info("cos-runs-metadata-purge: purged metadata", {
    rowCount,
    retentionDays,
  });

  return { rowCount };
}

function extractRowCount(result: unknown): number {
  if (result && typeof result === "object") {
    const r = result as { count?: unknown; rowCount?: unknown };
    if (typeof r.count === "number") return r.count;
    if (typeof r.rowCount === "number") return r.rowCount;
  }
  if (Array.isArray(result)) return result.length;
  return 0;
}

export const cosRunsMetadataPurge = schedules.task({
  id: "cos-runs.metadata-purge",
  cron: "0 3 * * *",
  run: async () => {
    try {
      const result = await runCosRunsMetadataPurge({});
      logger.info("cos-runs.metadata-purge tick", {
        rowCount: result.rowCount,
      });
      return result;
    } catch (err) {
      reportTaskError("cos-runs.metadata-purge", err);
      throw err;
    }
  },
});
