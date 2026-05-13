/**
 * Tables the agent surfaces subscribe to via Supabase Realtime.
 * Imported by RealtimeProvider to extend its subscription list.
 */
export const AGENT_REALTIME_TABLES = [
  "email_threads",
  "email_messages",
  "email_drafts",
  "scheduling_proposals",
  "cos_runs",
  "agent_classifications",
  "follow_up_watchers",
] as const;
