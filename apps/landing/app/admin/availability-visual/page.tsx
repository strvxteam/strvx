"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberBusy = Record<string, string>; // name → "free" | "BUSY (...)"

type SlotDetail = {
  start: string;
  startPacific: string;
  availableCount: number;
  perMember: MemberBusy;
};

type DebugResponse = {
  summary: {
    membersQueried: number;
    minRequired: number;
    totalSlotsAvailable: number;
    busyMapSizes: Record<string, number>;
  };
  members: { name: string; email: string; status: string; totalBusySlotsAfterBuffer?: number }[];
  sampleSlots: SlotDetail[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PT = "America/Los_Angeles";
const HOURS = Array.from({ length: 24 }, (_, i) => 9 + i * 0.5).filter(h => h < 21); // 9:00–20:30
const MEMBERS = ["Alex", "Nick"];

function toPacificDateKey(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: PT });
}

function getWeekDateKeys(weekOffset: number): string[] {
  const now = new Date();
  const base = new Date(now.getTime() + (1 + weekOffset * 7) * 86400000);
  return Array.from({ length: 7 }, (_, i) =>
    toPacificDateKey(new Date(base.getTime() + i * 86400000))
  );
}

function formatDayHeader(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

function formatHour(h: number) {
  const hours = Math.floor(h);
  const mins = h % 1 === 0.5 ? "30" : "00";
  const ampm = hours < 12 ? "AM" : "PM";
  const displayH = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayH}:${mins} ${ampm}`;
}

function parseSlotHour(pacificStr: string): number {
  // e.g. "Mon, Mar 30, 9:30 AM" → 9.5
  const timeMatch = pacificStr.match(/(\d+):(\d+)\s+(AM|PM)$/);
  if (!timeMatch) return -1;
  let h = parseInt(timeMatch[1]);
  const m = parseInt(timeMatch[2]);
  const ampm = timeMatch[3];
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h + m / 60;
}

// ── Grid ──────────────────────────────────────────────────────────────────────

function AvailabilityGrid({ secret }: { secret: string }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<DebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<SlotDetail | null>(null);

  const weekKeys = getWeekDateKeys(weekOffset);

  const fetchData = useCallback(async (offset: number) => {
    setLoading(true);
    setError(null);
    setData(null);
    const keys = getWeekDateKeys(offset);
    const start = keys[0] + "T07:00:00Z"; // approx midnight PT
    const end = keys[6] + "T07:00:00Z";
    try {
      const res = await fetch(
        `/api/debug/freebusy?secret=${secret}&start=${start}&end=${end}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => { fetchData(weekOffset); }, [weekOffset, fetchData]);

  // Build lookup: dateKey → hour → SlotDetail
  const slotLookup: Record<string, Record<number, SlotDetail>> = {};
  if (data) {
    for (const slot of data.sampleSlots) {
      const dateKey = new Date(slot.start).toLocaleDateString("en-CA", { timeZone: PT });
      const hour = parseSlotHour(slot.startPacific);
      if (!slotLookup[dateKey]) slotLookup[dateKey] = {};
      slotLookup[dateKey][hour] = slot;
    }
  }

  const memberNames = data?.members.map(m => m.name) ?? MEMBERS;
  const minRequired = data?.summary.minRequired ?? 2;

  function cellColor(slot: SlotDetail | undefined): string {
    if (!slot) return "bg-[#f3f4f6]";
    const count = slot.availableCount;
    if (count >= memberNames.length) return "bg-emerald-100 border-emerald-200";
    if (count >= minRequired) return "bg-sky-100 border-sky-200";
    if (count > 0) return "bg-amber-50 border-amber-100";
    return "bg-red-50 border-red-100";
  }

  function cellLabel(slot: SlotDetail | undefined): string {
    if (!slot) return "";
    return memberNames
      .map(n => (slot.perMember[n] === "free" ? n[0] : "·"))
      .join("");
  }

  const weekLabel = (() => {
    const first = weekKeys[0].split("-");
    const last = weekKeys[6].split("-");
    const fDate = new Date(+first[0], +first[1]-1, +first[2]);
    const lDate = new Date(+last[0], +last[1]-1, +last[2]);
    return `${fDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${lDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  })();

  return (
    <div className="min-h-screen bg-[#f9f9f9] p-6 font-sans">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-[#999] mb-1">strvx admin</p>
          <h1 className="text-2xl font-bold text-[#0a0a0a]">Availability Visual</h1>
        </div>

        {/* Summary bar */}
        {data && (
          <div className="flex flex-wrap gap-4 mb-5 bg-white border border-[#e5e5e5] rounded-xl p-4">
            <div>
              <p className="text-[10px] text-[#999] uppercase tracking-widest mb-0.5">Members queried</p>
              <p className="text-sm font-semibold text-[#0a0a0a]">{data.summary.membersQueried}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#999] uppercase tracking-widest mb-0.5">Min required</p>
              <p className="text-sm font-semibold text-[#0a0a0a]">{data.summary.minRequired}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#999] uppercase tracking-widest mb-0.5">Available slots this week</p>
              <p className="text-sm font-semibold text-[#0a0a0a]">{data.summary.totalSlotsAvailable}</p>
            </div>
            {Object.entries(data.summary.busyMapSizes).map(([name, count]) => (
              <div key={name}>
                <p className="text-[10px] text-[#999] uppercase tracking-widest mb-0.5">{name} busy blocks</p>
                <p className={`text-sm font-semibold ${count === 0 ? "text-amber-500" : "text-[#0a0a0a]"}`}>
                  {count} {count === 0 ? "⚠ empty calendar" : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Member status */}
        {data && (
          <div className="flex flex-wrap gap-3 mb-5">
            {data.members.map(m => (
              <div key={m.name} className="bg-white border border-[#e5e5e5] rounded-lg px-3 py-2 text-xs">
                <span className="font-semibold text-[#0a0a0a]">{m.name}</span>
                <span className="text-[#999] ml-1">{m.email}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  m.status === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                }`}>{m.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 mb-4 text-xs">
          {[
            { color: "bg-emerald-100 border border-emerald-200", label: "All free" },
            { color: "bg-sky-100 border border-sky-200", label: `≥${minRequired} free (bookable)` },
            { color: "bg-amber-50 border border-amber-100", label: "Some free (below min)" },
            { color: "bg-red-50 border border-red-100", label: "None free" },
            { color: "bg-[#f3f4f6]", label: "No data / outside hours" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${color}`} />
              <span className="text-[#666]">{label}</span>
            </div>
          ))}
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
            disabled={weekOffset === 0 || loading}
            className="px-3 py-1.5 rounded-lg border border-[#e5e5e5] text-sm font-medium text-[#0a0a0a] disabled:opacity-40 hover:bg-[#f5f5f5] transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm font-semibold text-[#0a0a0a]">{weekLabel}</span>
          <button
            onClick={() => setWeekOffset(w => Math.min(3, w + 1))}
            disabled={weekOffset >= 3 || loading}
            className="px-3 py-1.5 rounded-lg border border-[#e5e5e5] text-sm font-medium text-[#0a0a0a] disabled:opacity-40 hover:bg-[#f5f5f5] transition-colors"
          >
            Next →
          </button>
        </div>

        {/* Grid */}
        {loading && (
          <div className="flex items-center justify-center py-24 bg-white rounded-xl border border-[#e5e5e5]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-[#e5e5e5] border-t-[#0a0a0a] rounded-full animate-spin" />
              <p className="text-sm text-[#999]">Fetching calendar data…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
        )}

        {!loading && !error && data && (
          <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="w-16 px-2 py-2 text-left text-[#999] font-medium border-b border-r border-[#f0f0f0] sticky left-0 bg-white z-10">
                    PT
                  </th>
                  {weekKeys.map(dateKey => {
                    const { weekday, date } = formatDayHeader(dateKey);
                    const hasAny = Object.values(slotLookup[dateKey] ?? {}).some(s => s.availableCount >= minRequired);
                    return (
                      <th key={dateKey} className="px-2 py-2 text-center border-b border-r border-[#f0f0f0] font-medium min-w-[90px]">
                        <div className={hasAny ? "text-[#0a0a0a]" : "text-[#bbb]"}>{weekday}</div>
                        <div className={`text-[10px] font-normal ${hasAny ? "text-[#666]" : "text-[#ccc]"}`}>{date}</div>
                        {hasAny && <div className="w-1 h-1 rounded-full bg-[#0a0a0a] mx-auto mt-0.5" />}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour} className="hover:bg-[#fafafa]">
                    <td className="px-2 py-0.5 text-[#999] border-r border-[#f0f0f0] sticky left-0 bg-white whitespace-nowrap">
                      {hour % 1 === 0 ? formatHour(hour) : <span className="text-[#ccc]">{formatHour(hour)}</span>}
                    </td>
                    {weekKeys.map(dateKey => {
                      const slot = slotLookup[dateKey]?.[hour];
                      return (
                        <td
                          key={dateKey}
                          className={`px-1 py-0.5 border-r border-b border-[#f5f5f5] cursor-default transition-opacity ${cellColor(slot)}`}
                          onMouseEnter={() => slot && setHoveredSlot(slot)}
                          onMouseLeave={() => setHoveredSlot(null)}
                        >
                          {slot ? (
                            <div className="text-center font-mono tracking-widest text-[10px] opacity-60">
                              {cellLabel(slot)}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Hover tooltip */}
        {hoveredSlot && (
          <div className="fixed bottom-6 right-6 bg-[#0a0a0a] text-white rounded-xl px-4 py-3 text-xs shadow-xl max-w-xs z-50">
            <p className="font-semibold mb-1.5">{hoveredSlot.startPacific}</p>
            {Object.entries(hoveredSlot.perMember).map(([name, status]) => (
              <div key={name} className="flex items-center gap-2 mb-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${status === "free" ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className={status === "free" ? "text-white" : "text-[#888]"}>{name}</span>
                {status !== "free" && <span className="text-[#555] truncate">busy</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function PageContent() {
  const params = useSearchParams();
  const secret = params.get("secret") ?? "";

  if (!secret) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center">
        <div className="bg-white border border-[#e5e5e5] rounded-2xl p-8 text-center max-w-sm">
          <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Admin access required</p>
          <p className="text-xs text-[#999]">Add <code className="bg-[#f3f4f6] px-1 rounded">?secret=YOUR_ADMIN_SECRET</code> to the URL.</p>
        </div>
      </div>
    );
  }

  return <AvailabilityGrid secret={secret} />;
}

export default function AvailabilityVisualPage() {
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  );
}
