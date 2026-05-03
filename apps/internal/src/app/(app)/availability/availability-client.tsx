"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Video,
  WifiOff,
  Link2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createInternalBookingLink } from "@/app/actions";
import type { TeamAvailabilityResponse, TeamMemberAvailability, MemberEvent } from "@/app/api/availability/team/route";

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64; // px per hour
const GRID_START = 8;   // 8 AM Pacific
const GRID_END = 23;    // 11 PM Pacific
const TOTAL_HOURS = GRID_END - GRID_START;
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const TIME_COL_WIDTH = 52;
const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => GRID_START + i);

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekStart(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); // Monday
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getPacificDecimalHour(isoString: string): number {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h + m / 60;
}

function getPacificDateStr(isoString: string): string {
  // Returns "YYYY-MM-DD" in Pacific time
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
    new Date(isoString),
  );
}

function formatEventTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatHour(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}${ampm}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const s = `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}`;
  const e = `${MONTHS[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  return `${s} – ${e}`;
}

function getCurrentPacificHour(): number {
  return getPacificDecimalHour(new Date().toISOString());
}

// ── EventBlock ────────────────────────────────────────────────────────────────

function EventBlock({
  event,
  color,
  memberName,
}: {
  event: MemberEvent;
  color: string;
  memberName: string;
}) {
  const startH = getPacificDecimalHour(event.start);
  const endH = getPacificDecimalHour(event.end);

  const clampedStart = Math.max(startH, GRID_START);
  const clampedEnd = Math.min(endH, GRID_END);
  if (clampedEnd <= clampedStart) return null;

  const top = (clampedStart - GRID_START) * HOUR_HEIGHT;
  const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 18);
  const isShort = height < 36;

  const tooltipText = `${memberName}: ${event.title}\n${formatEventTime(event.start)} – ${formatEventTime(event.end)}`;

  return (
    <div
      title={tooltipText}
      className="absolute left-[1px] right-[1px] overflow-hidden rounded cursor-default select-none"
      style={{
        top,
        height,
        backgroundColor: color + "22",
        borderLeft: `3px solid ${color}`,
      }}
    >
      {!isShort && (
        <div className="px-1 pt-0.5">
          <p
            className="text-[10px] font-semibold leading-tight truncate"
            style={{ color }}
          >
            {event.title}
          </p>
          {height >= 52 && (
            <p className="text-[9px] leading-tight opacity-70 truncate" style={{ color }}>
              {formatEventTime(event.start)}
            </p>
          )}
        </div>
      )}
      {event.meetLink && !isShort && height >= 44 && (
        <a
          href={event.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-1 top-1 opacity-50 hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          title="Join meeting"
        >
          <Video size={10} style={{ color }} />
        </a>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AvailabilityClient() {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [data, setData] = useState<TeamAvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isCurrentWeek = isSameDay(weekStart, getWeekStart(today));

  const handleGenerateLink = useCallback(async () => {
    setGeneratingLink(true);
    setLinkCopied(false);
    try {
      const token = await createInternalBookingLink();
      const origin =
        typeof window !== "undefined" && window.location.hostname.includes("localhost")
          ? "http://localhost:3001"
          : "https://strvx.com";
      setShareLink(`${origin}/book/${token}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate link");
    } finally {
      setGeneratingLink(false);
    }
  }, []);

  const handleCopyLink = useCallback(() => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setLinkCopied(true);
      toast.success("Link copied");
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [shareLink]);

  // Scroll to ~8:30am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT * 0.5;
    }
  }, []);

  const fetchData = useCallback(async (ws: Date) => {
    setLoading(true);
    setError(null);
    try {
      const start = new Date(ws);
      start.setHours(0, 0, 0, 0);
      const end = addDays(start, 7);
      const res = await fetch(
        `/api/availability/team?start=${start.toISOString()}&end=${end.toISOString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(weekStart);
  }, [weekStart, fetchData]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const members = data?.members ?? [];
  const currentUserEmail = data?.currentUserEmail ?? null;

  // Build a lookup: dayStr → memberEmail → events[]
  const eventsByDayAndMember = new Map<string, Map<string, MemberEvent[]>>();
  members.forEach((member) => {
    member.events.forEach((evt) => {
      if (evt.isAllDay) return;
      const dayStr = getPacificDateStr(evt.start);
      if (!eventsByDayAndMember.has(dayStr)) {
        eventsByDayAndMember.set(dayStr, new Map());
      }
      const dayMap = eventsByDayAndMember.get(dayStr)!;
      if (!dayMap.has(member.email)) dayMap.set(member.email, []);
      dayMap.get(member.email)!.push(evt);
    });
  });

  // Each (event, day) gets a flag: isFirstDay marks the day where we render
  // the title; subsequent days within the visible span render as a continuation
  // (colored bar, no text) so multi-day events read as ONE bar visually.
  type AllDayCell = {
    event: MemberEvent;
    member: TeamMemberAvailability;
    isFirstDay: boolean;
  };
  const allDayByDay = new Map<string, AllDayCell[]>();
  members.forEach((member) => {
    member.events.forEach((evt) => {
      if (!evt.isAllDay) return;
      // Google Calendar all-day end dates are exclusive (end = day after last day),
      // so iterate [start, end) and add the event to each day in the span.
      const cursor = new Date(evt.start + "T00:00:00");
      const endDate = new Date(evt.end + "T00:00:00");
      let firstDay = true;
      while (cursor < endDate) {
        const dayStr = cursor.toLocaleDateString("en-CA");
        if (!allDayByDay.has(dayStr)) allDayByDay.set(dayStr, []);
        allDayByDay.get(dayStr)!.push({ event: evt, member, isFirstDay: firstDay });
        firstDay = false;
        cursor.setDate(cursor.getDate() + 1);
      }
    });
  });

  // Current time indicator
  const nowHour = getCurrentPacificHour();
  const showNowLine =
    isCurrentWeek && nowHour >= GRID_START && nowHour <= GRID_END;
  const nowTop = (nowHour - GRID_START) * HOUR_HEIGHT;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Availability</h1>

        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="flex items-center gap-3 mr-2">
            {members.map((m) => (
              <span key={m.email} className="flex items-center gap-1.5 text-[12px] font-medium text-[#555]">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                {m.name}
                {!m.connected && (
                  <span title="Calendar not connected"><WifiOff size={11} className="text-[#bbb]" /></span>
                )}
              </span>
            ))}
          </div>

          {/* Generate booking link */}
          <button
            onClick={handleGenerateLink}
            disabled={generatingLink}
            className="flex items-center gap-1.5 rounded-md border border-[#e0e0e0] bg-white px-2.5 py-1 text-[12px] font-medium text-[#333] transition-colors hover:bg-[#f5f5f5] disabled:opacity-50"
          >
            <Link2 size={13} strokeWidth={2} />
            {generatingLink ? "Generating..." : "Generate booking link"}
          </button>

          {/* Week navigation */}
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e0e0e0] text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart(today))}
            disabled={isCurrentWeek}
            className="rounded-md border border-[#e0e0e0] px-2.5 py-1 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e0e0e0] text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            <ChevronRight size={15} />
          </button>
          <span className="ml-1 text-[13px] font-medium text-[#444]">
            {formatWeekRange(weekStart)}
          </span>

          <button
            onClick={() => fetchData(weekStart)}
            disabled={loading}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md border border-[#e0e0e0] text-[#888] transition-colors hover:bg-[#f5f5f5] disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* ── Connect prompts for disconnected members ── */}
      {members.some((m) => !m.connected) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {members
            .filter((m) => !m.connected)
            .map((m) => (
              <div
                key={m.email}
                className="flex items-center gap-2 rounded-lg border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-[12px]"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: m.color }}
                />
                <span className="text-[#555]">
                  <span className="font-semibold">{m.name}</span> hasn&apos;t connected their calendar
                </span>
                {currentUserEmail === m.email && (
                  <a
                    href={`/api/auth/google?returnTo=/availability`}
                    className="ml-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors hover:opacity-80"
                    style={{ backgroundColor: m.color + "18", color: m.color }}
                  >
                    Connect →
                  </a>
                )}
              </div>
            ))}
        </div>
      )}

      {/* ── Grid ── */}
      <div className="flex-1 overflow-hidden rounded-lg border border-[#e0e0e0] bg-white flex flex-col min-h-0">
        {/* Day headers */}
        <div className="flex border-b border-[#e0e0e0] bg-white shrink-0 z-10">
          <div
            className="shrink-0 border-r border-[#e0e0e0]"
            style={{ width: TIME_COL_WIDTH }}
          />
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={i}
                className="flex-1 border-l border-[#e0e0e0] py-2 text-center"
              >
                <p className={`text-[11px] font-medium uppercase tracking-wide ${isToday ? "text-[#1a73e8]" : "text-[#999]"}`}>
                  {DAYS[day.getDay()]}
                </p>
                <p
                  className={`text-[15px] font-semibold leading-tight ${
                    isToday
                      ? "flex items-center justify-center h-6 w-6 mx-auto rounded-full bg-[#1a73e8] text-white"
                      : "text-[#222]"
                  }`}
                >
                  {day.getDate()}
                </p>
                {/* Member initials row */}
                <div className="flex justify-around mt-1 px-0.5">
                  {members.map((m) => (
                    <span
                      key={m.email}
                      className="text-[8px] font-bold uppercase tracking-wider"
                      style={{ color: m.color + "aa" }}
                    >
                      {m.name[0]}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day events strip */}
        {days.some((d) => allDayByDay.has(d.toLocaleDateString("en-CA"))) && (
          <div className="flex border-b border-[#e0e0e0] bg-[#fafafa] shrink-0">
            <div
              className="flex items-center justify-end pr-2 py-1 text-[10px] text-[#bbb] font-medium shrink-0 border-r border-[#e0e0e0]"
              style={{ width: TIME_COL_WIDTH }}
            >
              all-day
            </div>
            {days.map((day, i) => {
              const key = day.toLocaleDateString("en-CA");
              const dayEvents = allDayByDay.get(key) ?? [];
              const memberCount = Math.max(members.length, 1);
              return (
                <div key={i} className="flex-1 border-l border-[#e0e0e0] flex min-h-[24px]">
                  {members.map((member, mi) => {
                    const memberEvents = dayEvents.filter((e) => e.member.email === member.email);
                    return (
                      <div
                        key={member.email}
                        className="relative py-0.5 px-0.5"
                        style={{ width: `${100 / memberCount}%` }}
                      >
                        {mi > 0 && (
                          <div className="absolute left-0 top-0 bottom-0 border-l border-dashed border-[#f0f0f0]" />
                        )}
                        {memberEvents.map(({ event, isFirstDay }) => (
                          <div
                            key={event.id}
                            className="rounded px-1 py-0 text-[10px] font-medium truncate mb-0.5"
                            style={{
                              backgroundColor: member.color + "22",
                              color: member.color,
                              borderLeft: `2px solid ${member.color}`,
                            }}
                            title={event.title}
                          >
                            {/* Title only on the first day of a multi-day span;
                                continuation days render an empty colored cell. */}
                            {isFirstDay ? event.title : " "}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Scrollable timeline */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
          <div className="flex" style={{ height: TIMELINE_HEIGHT }}>
            {/* Time labels column */}
            <div
              className="relative shrink-0 border-r border-[#e0e0e0]"
              style={{ width: TIME_COL_WIDTH, height: TIMELINE_HEIGHT }}
            >
              {HOURS.slice(0, -1).map((h) => (
                <div
                  key={h}
                  className="absolute right-2 text-[10px] font-medium text-[#bbb]"
                  style={{ top: (h - GRID_START) * HOUR_HEIGHT - 7 }}
                >
                  {formatHour(h)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day, di) => {
              const dayStr = day.toLocaleDateString("en-CA");
              const isToday = isSameDay(day, today);
              const dayEventsMap = eventsByDayAndMember.get(dayStr) ?? new Map<string, MemberEvent[]>();
              const memberCount = Math.max(members.length, 1);

              return (
                <div
                  key={di}
                  className="relative flex-1 border-l border-[#e0e0e0]"
                  style={{ height: TIMELINE_HEIGHT }}
                >
                  {/* Today background */}
                  {isToday && (
                    <div className="absolute inset-0 bg-[#1a73e8]/[0.02] pointer-events-none" />
                  )}

                  {/* Hour grid lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-[#f0f0f0]"
                      style={{ top: (h - GRID_START) * HOUR_HEIGHT }}
                    />
                  ))}
                  {/* Half-hour lines */}
                  {HOURS.slice(0, -1).map((h) => (
                    <div
                      key={`half-${h}`}
                      className="absolute left-0 right-0 border-t border-[#f7f7f7]"
                      style={{ top: (h - GRID_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && showNowLine && (
                    <div
                      className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                      style={{ top: nowTop }}
                    >
                      <div className="h-2 w-2 rounded-full bg-[#ea4335] -ml-1 shrink-0" />
                      <div className="flex-1 border-t-2 border-[#ea4335]" />
                    </div>
                  )}

                  {/* Member sub-columns with events */}
                  {members.map((member, mi) => {
                    const events = dayEventsMap.get(member.email) ?? [];
                    const colWidth = 100 / memberCount;
                    return (
                      <div
                        key={member.email}
                        className="absolute top-0 bottom-0"
                        style={{
                          left: `${mi * colWidth}%`,
                          width: `${colWidth}%`,
                        }}
                      >
                        {/* Member column separator */}
                        {mi > 0 && (
                          <div className="absolute left-0 top-0 bottom-0 border-l border-dashed border-[#f0f0f0]" />
                        )}

                        {/* Events */}
                        {events.map((evt) => (
                          <EventBlock
                            key={evt.id}
                            event={evt}
                            color={member.color}
                            memberName={member.name}
                          />
                        ))}

                        {/* Not connected overlay */}
                        {!member.connected && di === 0 && (
                          <div className="absolute inset-0 flex items-start justify-center pt-4">
                            <div
                              className="text-[8px] font-medium opacity-50 rotate-[-90deg] whitespace-nowrap"
                              style={{ color: member.color }}
                            >
                              not connected
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px] z-30 rounded-lg">
          <div className="flex items-center gap-2 text-[13px] text-[#888]">
            <RefreshCw size={14} className="animate-spin" />
            Loading calendars…
          </div>
        </div>
      )}

      {/* ── Share Internal Booking Link Modal ── */}
      {shareLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
          onClick={() => setShareLink(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#e0e0e0] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#f0f0f0] px-6 pt-5 pb-4">
              <div>
                <h2 className="text-[15px] font-semibold text-[#111]">Internal booking link</h2>
                <p className="mt-1 text-[12px] text-[#666]">
                  Share this with anyone — they pick a 30/45/60 min slot from team availability and get a confirmation email.
                </p>
              </div>
              <button
                onClick={() => setShareLink(null)}
                className="rounded p-1 text-[#999] hover:bg-[#f5f5f5] hover:text-[#333]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 rounded-lg border border-[#e0e0e0] bg-[#fafafa] px-3 py-2.5">
                <input
                  readOnly
                  value={shareLink}
                  onClick={(e) => e.currentTarget.select()}
                  className="flex-1 bg-transparent text-[12px] text-[#333] outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="flex shrink-0 items-center gap-1 rounded-md bg-[#111] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[#333]"
                >
                  {linkCopied ? <Check size={12} /> : <Copy size={12} />}
                  {linkCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-[#888]">
                Link expires after 90 days of inactivity. Reachable from any device.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
