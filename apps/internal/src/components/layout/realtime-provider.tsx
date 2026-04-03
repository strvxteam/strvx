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
  "prospects",
  "prospect_touches",
  "industries",
  "invoices",
  "expenses",
  "goals",
  "marketing_posts",
  "documents",
];

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeRefresh(WATCHED_TABLES);
  return <>{children}</>;
}
