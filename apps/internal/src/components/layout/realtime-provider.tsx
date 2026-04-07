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
];

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeRefresh(WATCHED_TABLES);
  return <>{children}</>;
}
