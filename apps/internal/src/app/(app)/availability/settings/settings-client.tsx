"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Owner = "alex" | "nick" | "team" | "skip";

type CalendarItem = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  mappedOwner: Owner | null;
  mappedLabel: string | null;
};

const OWNER_OPTIONS: { value: Owner; label: string; color: string }[] = [
  { value: "alex", label: "Alex", color: "#1a73e8" },
  { value: "nick", label: "Nick", color: "#0f9d58" },
  { value: "team", label: "Team (both)", color: "#555" },
  { value: "skip", label: "Hide", color: "#aaa" },
];

export function CalendarSettingsClient() {
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchCalendars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/availability/calendars");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { calendars: CalendarItem[] };
      setCalendars(data.calendars);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendars();
  }, [fetchCalendars]);

  const unsubscribe = useCallback(
    async (calendarId: string, summary: string) => {
      if (
        !confirm(
          `Unsubscribe strvxteam@gmail.com from "${summary}"?\n\nThis removes the calendar from strvxteam's Google account entirely — it will no longer appear on this Calendars page or contribute events. The calendar itself is NOT deleted; only the strvxteam subscription.`,
        )
      ) {
        return;
      }
      setSavingId(calendarId);
      try {
        const res = await fetch(
          `/api/availability/calendars?calendarId=${encodeURIComponent(calendarId)}&unsubscribe=1`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string; connectUrl?: string }
            | null;
          if (body?.connectUrl) {
            toast.error(body.error ?? "Reconnect strvxteam to enable removal");
            window.location.href = body.connectUrl;
            return;
          }
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        setCalendars((prev) => prev.filter((c) => c.id !== calendarId));
        toast.success(`Removed "${summary}"`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Remove failed");
      } finally {
        setSavingId(null);
      }
    },
    [],
  );

  const saveMapping = useCallback(
    async (calendarId: string, owner: Owner | null) => {
      setSavingId(calendarId);
      try {
        if (owner === null) {
          const res = await fetch(
            `/api/availability/calendars?calendarId=${encodeURIComponent(calendarId)}`,
            { method: "DELETE" },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setCalendars((prev) =>
            prev.map((c) =>
              c.id === calendarId ? { ...c, mappedOwner: null, mappedLabel: null } : c,
            ),
          );
          toast.success("Mapping cleared");
        } else {
          const res = await fetch("/api/availability/calendars", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ calendarId, owner }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `HTTP ${res.status}`);
          }
          setCalendars((prev) =>
            prev.map((c) => (c.id === calendarId ? { ...c, mappedOwner: owner } : c)),
          );
          toast.success(`Mapped to ${owner}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSavingId(null);
      }
    },
    [],
  );

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/availability"
            className="flex items-center gap-1 text-[13px] text-[#555] hover:text-[#111]"
          >
            <ChevronLeft size={14} /> Availability
          </Link>
          <span className="text-[#ccc]">/</span>
          <h1 className="text-xl font-semibold">Calendar Mappings</h1>
        </div>
        <button
          onClick={fetchCalendars}
          disabled={loading}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e0e0e0] text-[#888] transition-colors hover:bg-[#f5f5f5] disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <p className="mb-4 max-w-3xl text-[13px] text-[#555]">
        Every calendar visible to <span className="font-mono">strvxteam@gmail.com</span>{" "}
        is listed below. The system auto-classifies calendars by email-id alias
        or by name (e.g. &quot;Alex Tutoring&quot; → Alex), but side calendars
        with opaque ids and generic names default to <em>Hide</em>. Assign
        them to the right person here so their events show up under the
        correct column on{" "}
        <Link href="/availability" className="text-[#1a73e8] hover:underline">
          /availability
        </Link>
        .
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto rounded-lg border border-[#e0e0e0] bg-white">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-[#fafafa]">
            <tr>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Calendar
              </th>
              <th className="w-32 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Access
              </th>
              <th className="w-56 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Mapped to
              </th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {calendars.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#999]">
                  No calendars visible to strvxteam@gmail.com.
                </td>
              </tr>
            )}
            {calendars.map((c) => (
              <tr key={c.id} className="border-t border-[#f0f0f0]">
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-[#111]">
                      {c.summary}
                      {c.primary && (
                        <span className="ml-2 rounded bg-[#e8f0fe] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1a73e8]">
                          primary
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 font-mono text-[10.5px] text-[#888]">
                      {c.id}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#555]">{c.accessRole}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={c.mappedOwner ?? ""}
                      onChange={(e) =>
                        saveMapping(c.id, (e.target.value || null) as Owner | null)
                      }
                      disabled={savingId === c.id}
                      className="w-40 rounded-[6px] border border-[#e0e0e0] bg-white px-2 py-1 text-[12px] text-[#111] outline-none focus:border-[#1a73e8] disabled:opacity-50"
                    >
                      <option value="">(auto)</option>
                      {OWNER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {savingId === c.id && (
                      <RefreshCw size={12} className="animate-spin text-[#aaa]" />
                    )}
                  </div>
                </td>
                <td className="px-2 py-3 text-right">
                  {c.primary ? (
                    <span title="Can't unsubscribe from a primary calendar" className="opacity-30">
                      <Trash2 size={14} className="text-[#aaa]" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => unsubscribe(c.id, c.summary)}
                      disabled={savingId === c.id}
                      className="rounded p-1 text-[#bbb] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      title={`Unsubscribe strvxteam from "${c.summary}"`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
