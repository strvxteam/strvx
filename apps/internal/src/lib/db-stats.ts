import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// ── Panel 1: health ─────────────────────────────────────

export interface DbHealth {
  reachable: boolean;
  pingMs: number | null;
  totalSizeBytes: number;
  totalSizePretty: string;
  activeConnections: number;
  errorMessage: string | null;
}

export async function getDbHealth(): Promise<DbHealth> {
  const start = Date.now();
  try {
    const row = await db.execute<{
      size_bytes: string;
      size_pretty: string;
      active_connections: string;
    }>(sql`
      SELECT
        pg_database_size(current_database()) AS size_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS size_pretty,
        (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS active_connections
    `);
    const r = row[0];
    return {
      reachable: true,
      pingMs: Date.now() - start,
      totalSizeBytes: Number(r.size_bytes),
      totalSizePretty: String(r.size_pretty),
      activeConnections: Number(r.active_connections),
      errorMessage: null,
    };
  } catch (e) {
    return {
      reachable: false,
      pingMs: null,
      totalSizeBytes: 0,
      totalSizePretty: "?",
      activeConnections: 0,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

// ── Panel 2: top 10 tables ──────────────────────────────

export interface TableStats {
  schema: string;
  name: string;
  rows: number;
  totalSizeBytes: number;
  totalSizePretty: string;
  indexSizePretty: string;
  lastVacuum: string | null;
  lastAutovacuum: string | null;
}

export async function getTopTables(limit = 10): Promise<TableStats[]> {
  const rows = await db.execute<{
    schema: string;
    name: string;
    rows: string;
    total_size_bytes: string;
    total_size_pretty: string;
    index_size_pretty: string;
    last_vacuum: string | null;
    last_autovacuum: string | null;
  }>(sql`
    SELECT
      s.schemaname AS schema,
      s.relname AS name,
      s.n_live_tup AS rows,
      pg_total_relation_size(s.relid) AS total_size_bytes,
      pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size_pretty,
      pg_size_pretty(pg_indexes_size(s.relid)) AS index_size_pretty,
      s.last_vacuum AS last_vacuum,
      s.last_autovacuum AS last_autovacuum
    FROM pg_stat_user_tables s
    WHERE s.schemaname NOT IN ('pg_catalog','information_schema')
    ORDER BY pg_total_relation_size(s.relid) DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    schema: r.schema,
    name: r.name,
    rows: Number(r.rows),
    totalSizeBytes: Number(r.total_size_bytes),
    totalSizePretty: r.total_size_pretty,
    indexSizePretty: r.index_size_pretty,
    lastVacuum: r.last_vacuum,
    lastAutovacuum: r.last_autovacuum,
  }));
}

// ── Panel 3: migration status ───────────────────────────

export interface MigrationStatus {
  filename: string;
  bytes: number;
}

// Hardcoded list kept in sync with packages/db/drizzle/*.sql.
// Updated when a new migration is added; a tiny price for never shipping
// filesystem scans into the serverless runtime.
const MIGRATION_FILENAMES: string[] = [
  "0000_sweet_emma_frost.sql",
  "0001_loud_jazinda.sql",
  "0002_dev_ops.sql",
  "0003_user_recents.sql",
  "0004_user_pins.sql",
  "0005_dev_sync.sql",
  "0006_dev_vercel_projects.sql",
];

export async function getMigrationStatus(): Promise<MigrationStatus[]> {
  // Best-effort: try to read the dir (works locally / in Vercel if files copied);
  // fall back to the hardcoded list in prod.
  try {
    const dir = join(process.cwd(), "..", "..", "packages", "db", "drizzle");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    if (files.length > 0) {
      return files.map((f) => ({ filename: f, bytes: 0 }));
    }
  } catch {
    /* not readable in serverless; fall through */
  }
  return MIGRATION_FILENAMES.map((filename) => ({ filename, bytes: 0 }));
}

// ── Panel 4: recent activity ────────────────────────────

export interface ActivityRow {
  query: string;
  calls: number;
  totalTimeMs: number;
  meanTimeMs: number;
  rows: number;
}

export async function getRecentActivity(limit = 10): Promise<
  { enabled: true; rows: ActivityRow[] } | { enabled: false; reason: string }
> {
  try {
    const exists = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      ) AS exists
    `);
    if (!exists[0]?.exists) {
      return { enabled: false, reason: "pg_stat_statements extension not enabled" };
    }
    const rows = await db.execute<{
      query: string;
      calls: string;
      total_exec_time: string;
      mean_exec_time: string;
      rows: string;
    }>(sql`
      SELECT
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        rows
      FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
        AND query NOT ILIKE '%pg_stat_user_tables%'
      ORDER BY total_exec_time DESC
      LIMIT ${limit}
    `);
    return {
      enabled: true,
      rows: rows.map((r) => ({
        query: r.query.length > 200 ? r.query.slice(0, 200) + "…" : r.query,
        calls: Number(r.calls),
        totalTimeMs: Number(r.total_exec_time),
        meanTimeMs: Number(r.mean_exec_time),
        rows: Number(r.rows),
      })),
    };
  } catch (e) {
    return {
      enabled: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}
