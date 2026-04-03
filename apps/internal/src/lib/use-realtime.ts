"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "./supabase/client";

/**
 * Subscribe to Supabase Realtime changes on a table.
 * When a change is detected, triggers a Next.js router refresh
 * to re-fetch server components with fresh data.
 */
export function useRealtimeRefresh(tables: string[]): { connected: boolean } {
  const router = useRouter();
  const mountedRef = useRef(true);
  const [connected, setConnected] = useState(true);
  const tablesKey = tables.join(",");

  useEffect(() => {
    mountedRef.current = true;
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase.channel("realtime-refresh");
    const tableList = tablesKey.split(",");

    for (const table of tableList) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (mountedRef.current) {
            router.refresh();
          }
        }
      );
    }

    channel.subscribe((status: string) => {
      if (!mountedRef.current) return;

      if (status === "SUBSCRIBED") {
        setConnected(true);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Only show disconnect after a delay to avoid flash on initial load
        setTimeout(() => {
          if (mountedRef.current) setConnected(false);
        }, 3000);
        // Retry connection
        setTimeout(() => {
          if (mountedRef.current) channel.subscribe();
        }, 5000);
      }
    });

    return () => {
      mountedRef.current = false;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [router, tablesKey]);

  return { connected };
}
