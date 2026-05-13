"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";

type Status = { running: boolean; kind: string | null };

type CosRunPayload = {
  id: string;
  status: string;
  kind: string;
  thread_id: string | null;
};

/**
 * Subscribe to `cos_runs` rows for a specific threadId.
 *
 * Returns whether any run for the thread is currently "running" and the
 * kind of the most-recent active run. Implemented as a focused Supabase
 * Realtime subscription so the agent-thinking indicator updates in real
 * time without forcing a router refresh.
 */
export function useCosRunStatus(threadId: string | undefined | null): Status {
  const [status, setStatus] = useState<Status>({ running: false, kind: null });

  useEffect(() => {
    if (!threadId) {
      setStatus({ running: false, kind: null });
      return;
    }
    const supabase = createClient();
    if (!supabase) return;

    let cancelled = false;
    const activeRuns = new Map<string, string>(); // id → kind

    function apply() {
      if (cancelled) return;
      if (activeRuns.size === 0) {
        setStatus({ running: false, kind: null });
      } else {
        const last = Array.from(activeRuns.values()).pop() ?? null;
        setStatus({ running: true, kind: last });
      }
    }

    function handle(payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: CosRunPayload | null;
      old: CosRunPayload | null;
    }) {
      const row = payload.new ?? payload.old;
      if (!row || row.thread_id !== threadId) return;
      if (payload.eventType === "DELETE" || row.status !== "running") {
        activeRuns.delete(row.id);
      } else {
        activeRuns.set(row.id, row.kind);
      }
      apply();
    }

    const channel = supabase
      .channel(`cos-runs-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cos_runs",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload: unknown) =>
          handle(
            payload as {
              eventType: "INSERT" | "UPDATE" | "DELETE";
              new: CosRunPayload | null;
              old: CosRunPayload | null;
            }
          )
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  return status;
}
