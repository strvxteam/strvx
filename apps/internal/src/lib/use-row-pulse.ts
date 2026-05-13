"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";

/**
 * Subscribe to UPDATE events on a single row of a Supabase table and
 * return a "pulse" flag that flips true for ~`flashMs` ms each time
 * the row changes. The full-page RealtimeProvider also triggers a
 * router.refresh on the same event, but this hook lets a specific
 * component show a per-row visual cue without waiting for the
 * refresh to repaint.
 *
 * The subscription targets the row by primary key via the
 * `filter: <pk>=eq.<rowId>` parameter, so noise from unrelated rows
 * is filtered at the realtime layer rather than on the client.
 */
export function useRowPulse(args: {
  table: string;
  rowId: string | undefined | null;
  /** Primary key column name on the table. Defaults to "id". */
  pkColumn?: string;
  /** How long the pulse stays true after each update. Default 1200ms. */
  flashMs?: number;
}): { pulse: boolean } {
  const [pulse, setPulse] = useState(false);
  const pkColumn = args.pkColumn ?? "id";
  const flashMs = args.flashMs ?? 1200;
  const rowId = args.rowId ?? null;
  const table = args.table;

  useEffect(() => {
    if (!rowId) return;
    const supabase = createClient();
    if (!supabase) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel(`row-pulse-${table}-${rowId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table,
          filter: `${pkColumn}=eq.${rowId}`,
        },
        () => {
          if (cancelled) return;
          setPulse(true);
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            if (!cancelled) setPulse(false);
          }, flashMs);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [table, rowId, pkColumn, flashMs]);

  return { pulse };
}
