"use client";

import { useRealtimeRefresh } from "@/lib/use-realtime";

const WATCHED_TABLES = [
  "interactions",
  "next_actions",
  "engagements",
  "contacts",
  "companies",
  "stage_history",
  "tasks",
  "task_assignees",
  "calendar_events",
  "projects",
  "invoices",
  "expenses",
  "goals",
  "documents",
  // /development live sync
  "dev_repos",
  "dev_vercel_projects",
  "dev_supabase_projects",
  "monitored_sites",
  "uptime_checks",
  "vercel_deploy_cache",
  "github_pr_cache",
  "github_ci_cache",
];

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeRefresh(WATCHED_TABLES);
  return <>{children}</>;
}
