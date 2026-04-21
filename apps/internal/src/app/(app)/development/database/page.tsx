import type { Metadata } from "next";
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
  const [health, tables, migrations, activity] = await Promise.all([
    getDbHealth(),
    getTopTables(10),
    getMigrationStatus(),
    getRecentActivity(10),
  ]);

  return (
    <DatabaseClient
      health={health}
      tables={tables}
      migrations={migrations}
      activity={activity}
    />
  );
}
