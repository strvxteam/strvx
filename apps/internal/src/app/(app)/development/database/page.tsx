import type { Metadata } from "next";
import { db } from "@/lib/db";
import { devSupabaseProjects, devRepos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getDbHealth,
  getTopTables,
  getMigrationStatus,
  getRecentActivity,
} from "@/lib/db-stats";
import DatabaseClient from "./database-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata: Metadata = { title: "Database" };

export default async function DatabasePage() {
  const [health, tables, migrations, activity, sbRows] = await Promise.all([
    getDbHealth(),
    getTopTables(10),
    getMigrationStatus(),
    getRecentActivity(10),
    db
      .select({
        id: devSupabaseProjects.id,
        projectRef: devSupabaseProjects.projectRef,
        name: devSupabaseProjects.name,
        region: devSupabaseProjects.region,
        status: devSupabaseProjects.status,
        dbVersion: devSupabaseProjects.dbVersion,
        sizeBytes: devSupabaseProjects.sizeBytes,
        activeConnections: devSupabaseProjects.activeConnections,
        lastRefreshedAt: devSupabaseProjects.lastRefreshedAt,
        lastRefreshError: devSupabaseProjects.lastRefreshError,
        repoName: devRepos.name,
      })
      .from(devSupabaseProjects)
      .leftJoin(devRepos, eq(devRepos.id, devSupabaseProjects.devRepoId))
      .orderBy(devSupabaseProjects.name),
  ]);

  const supabaseProjects = sbRows.map((r) => ({
    id: r.id,
    projectRef: r.projectRef,
    name: r.name,
    region: r.region,
    status: r.status,
    dbVersion: r.dbVersion,
    sizeBytes: r.sizeBytes ? Number(r.sizeBytes) : null,
    activeConnections: r.activeConnections,
    lastRefreshedAt: r.lastRefreshedAt?.toISOString() ?? null,
    lastRefreshError: r.lastRefreshError,
    repoName: r.repoName,
  }));

  return (
    <DatabaseClient
      health={health}
      tables={tables}
      migrations={migrations}
      activity={activity}
      supabaseProjects={supabaseProjects}
    />
  );
}
