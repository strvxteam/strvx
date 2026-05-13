import { and, eq, gte, sql } from "drizzle-orm";
import { db as defaultDb, cosRuns, mailboxOauthTokens } from "@strvx/db";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type AnalyticsSummary = {
  totalRuns: number;
  totalCostUsd: number;
  successRatePct: number; // 0..100
  p50DurationMs: number;
  p95DurationMs: number;
};

export type PerKindRow = {
  kind: string;
  runs: number;
  successRatePct: number;
  avgCostUsd: number;
  totalCostUsd: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  p50DurationMs: number;
  p95DurationMs: number;
};

export type DailyBucket = {
  /** ISO date YYYY-MM-DD */
  date: string;
  count: number;
};

export type PerKindSparkline = {
  kind: string;
  buckets: DailyBucket[];
};

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function fetchAnalyticsSummary(
  now: Date = new Date(),
  db: typeof defaultDb = defaultDb
): Promise<AnalyticsSummary> {
  const cutoff = new Date(now.getTime() - WINDOW_MS);

  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      totalCost: sql<number>`COALESCE(SUM(${cosRuns.costUsd}), 0)::float`,
      succeeded: sql<number>`SUM(CASE WHEN ${cosRuns.status} = 'succeeded' THEN 1 ELSE 0 END)::int`,
      p50: sql<number>`COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${cosRuns.durationMs}), 0)::float`,
      p95: sql<number>`COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${cosRuns.durationMs}), 0)::float`,
    })
    .from(cosRuns)
    .where(gte(cosRuns.startedAt, cutoff));

  const r = rows[0] ?? {
    total: 0,
    totalCost: 0,
    succeeded: 0,
    p50: 0,
    p95: 0,
  };
  const total = num(r.total);
  const succeeded = num(r.succeeded);
  return {
    totalRuns: total,
    totalCostUsd: num(r.totalCost),
    successRatePct: total === 0 ? 0 : (succeeded / total) * 100,
    p50DurationMs: Math.round(num(r.p50)),
    p95DurationMs: Math.round(num(r.p95)),
  };
}

export async function fetchAnalyticsPerKind(
  now: Date = new Date(),
  db: typeof defaultDb = defaultDb
): Promise<PerKindRow[]> {
  const cutoff = new Date(now.getTime() - WINDOW_MS);

  const rows = await db
    .select({
      kind: cosRuns.kind,
      runs: sql<number>`count(*)::int`,
      succeeded: sql<number>`SUM(CASE WHEN ${cosRuns.status} = 'succeeded' THEN 1 ELSE 0 END)::int`,
      avgCost: sql<number>`COALESCE(AVG(${cosRuns.costUsd}), 0)::float`,
      totalCost: sql<number>`COALESCE(SUM(${cosRuns.costUsd}), 0)::float`,
      avgInput: sql<number>`COALESCE(AVG(${cosRuns.inputTokens}), 0)::float`,
      avgOutput: sql<number>`COALESCE(AVG(${cosRuns.outputTokens}), 0)::float`,
      p50: sql<number>`COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${cosRuns.durationMs}), 0)::float`,
      p95: sql<number>`COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${cosRuns.durationMs}), 0)::float`,
    })
    .from(cosRuns)
    .where(gte(cosRuns.startedAt, cutoff))
    .groupBy(cosRuns.kind);

  return rows.map((r) => {
    const runs = num(r.runs);
    const succeeded = num(r.succeeded);
    return {
      kind: r.kind as string,
      runs,
      successRatePct: runs === 0 ? 0 : (succeeded / runs) * 100,
      avgCostUsd: num(r.avgCost),
      totalCostUsd: num(r.totalCost),
      avgInputTokens: Math.round(num(r.avgInput)),
      avgOutputTokens: Math.round(num(r.avgOutput)),
      p50DurationMs: Math.round(num(r.p50)),
      p95DurationMs: Math.round(num(r.p95)),
    };
  });
}

export type PerMailboxRow = {
  mailboxId: string;
  email: string;
  runs: number;
  succeeded: number;
  costUsd: number;
  /** 14-element array, oldest → newest, daily run counts. */
  dailyCounts: number[];
};

/**
 * Per-mailbox analytics for the rolling 30-day window. Returns one row
 * per active mailbox; mailboxes with zero runs in the window are still
 * included (so the UI surfaces newly-connected mailboxes).
 *
 * Joins cos_runs (via mailbox_id) → mailbox_oauth_tokens, then folds
 * the last 14 days of run counts into a sparkline array.
 */
export async function fetchAnalyticsPerMailbox(
  now: Date = new Date(),
  db: typeof defaultDb = defaultDb,
  days = 30
): Promise<PerMailboxRow[]> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const sparklineDays = 14;
  const sparklineCutoff = new Date(
    now.getTime() - sparklineDays * 24 * 60 * 60 * 1000
  );

  // 1) Active mailboxes — always include even if no runs.
  const mailboxes = await db
    .select({
      id: mailboxOauthTokens.id,
      email: mailboxOauthTokens.email,
    })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, true));

  if (mailboxes.length === 0) return [];

  // 2) Aggregate runs/succeeded/cost per mailbox over the 30-day window.
  const aggRows = await db
    .select({
      mailboxId: cosRuns.mailboxId,
      runs: sql<number>`count(*)::int`,
      succeeded: sql<number>`SUM(CASE WHEN ${cosRuns.status} = 'succeeded' THEN 1 ELSE 0 END)::int`,
      totalCost: sql<number>`COALESCE(SUM(${cosRuns.costUsd}), 0)::float`,
    })
    .from(cosRuns)
    .where(gte(cosRuns.startedAt, cutoff))
    .groupBy(cosRuns.mailboxId);

  const aggByMailbox = new Map<
    string,
    { runs: number; succeeded: number; totalCost: number }
  >();
  for (const r of aggRows) {
    if (!r.mailboxId) continue;
    aggByMailbox.set(r.mailboxId, {
      runs: num(r.runs),
      succeeded: num(r.succeeded),
      totalCost: num(r.totalCost),
    });
  }

  // 3) Daily counts for sparklines (last 14 days), per mailbox per day.
  const sparkRows = await db
    .select({
      mailboxId: cosRuns.mailboxId,
      day: sql<string>`to_char(date_trunc('day', ${cosRuns.startedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(cosRuns)
    .where(and(gte(cosRuns.startedAt, sparklineCutoff)))
    .groupBy(
      cosRuns.mailboxId,
      sql`date_trunc('day', ${cosRuns.startedAt})`
    );

  // Build a 14-day scaffold (oldest → newest).
  const scaffold: string[] = [];
  const startDay = new Date(sparklineCutoff);
  startDay.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(now);
  endDay.setUTCHours(0, 0, 0, 0);
  for (
    let d = new Date(startDay);
    d.getTime() <= endDay.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    scaffold.push(d.toISOString().slice(0, 10));
  }

  const sparkByMailbox = new Map<string, Map<string, number>>();
  for (const r of sparkRows) {
    if (!r.mailboxId) continue;
    if (!sparkByMailbox.has(r.mailboxId))
      sparkByMailbox.set(r.mailboxId, new Map());
    sparkByMailbox.get(r.mailboxId)!.set(r.day as string, num(r.count));
  }

  return mailboxes
    .map((m) => {
      const agg = aggByMailbox.get(m.id);
      const spark = sparkByMailbox.get(m.id);
      const dailyCounts = scaffold.map((date) => spark?.get(date) ?? 0);
      return {
        mailboxId: m.id,
        email: m.email,
        runs: agg?.runs ?? 0,
        succeeded: agg?.succeeded ?? 0,
        costUsd: agg?.totalCost ?? 0,
        dailyCounts,
      };
    })
    .sort((a, b) => b.runs - a.runs || a.email.localeCompare(b.email));
}

export async function fetchAnalyticsSparklines(
  now: Date = new Date(),
  db: typeof defaultDb = defaultDb
): Promise<PerKindSparkline[]> {
  const cutoff = new Date(now.getTime() - WINDOW_MS);

  const rows = await db
    .select({
      kind: cosRuns.kind,
      day: sql<string>`to_char(date_trunc('day', ${cosRuns.startedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(cosRuns)
    .where(and(gte(cosRuns.startedAt, cutoff)))
    .groupBy(
      cosRuns.kind,
      sql`date_trunc('day', ${cosRuns.startedAt})`
    )
    .orderBy(
      cosRuns.kind,
      sql`date_trunc('day', ${cosRuns.startedAt})`
    );

  // Build the full date scaffold so each sparkline has 30 buckets.
  const scaffold: string[] = [];
  const start = new Date(cutoff);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    scaffold.push(d.toISOString().slice(0, 10));
  }

  const byKind = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const kind = r.kind as string;
    if (!byKind.has(kind)) byKind.set(kind, new Map());
    byKind.get(kind)!.set(r.day as string, num(r.count));
  }

  return Array.from(byKind.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, daily]) => ({
      kind,
      buckets: scaffold.map((date) => ({
        date,
        count: daily.get(date) ?? 0,
      })),
    }));
}
