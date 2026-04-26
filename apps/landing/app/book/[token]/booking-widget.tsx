"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { getMeetingDuration, getMeetingLabel } from "@/lib/meeting-types";

type Slot = { start: string; end: string };
type DaySlots = Record<string, Slot[]>;

type Props = {
  token: string;
  meetingType: string;
  prefill: { name: string; email: string; company: string };
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getNextDays(count: number): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function FollowUpBookingWidget({ token, meetingType, prefill }: Props) {
  const typeLabel = getMeetingLabel(meetingType);
  const durationMinutes = getMeetingDuration(meetingType);
  const durationDisplay =
    durationMinutes >= 60 ? `${durationMinutes / 60} hr` : `${durationMinutes} min`;
  const windowDays = meetingType === "proposal" || meetingType === "revision" ? 14 : 7;
  const days = getNextDays(windowDays);

  const [selectedDay, setSelectedDay] = useState<Date>(days[0]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [slots, setSlots] = useState<DaySlots>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const visibleDays = days.slice(weekOffset, weekOffset + 7);
  const canGoPrev = weekOffset > 0;
  const canGoNext = weekOffset + 7 < windowDays;

  // Step 2: contact info
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [company, setCompany] = useState(prefill.company);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ startTime: string; meetLink: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch availability for the whole window once
  useEffect(() => {
    setLoadingSlots(true);
    const start = new Date(days[0]);
    start.setHours(0, 0, 0, 0);
    const end = new Date(days[days.length - 1]);
    end.setHours(23, 59, 59, 999);

    fetch(`/api/book/${token}/availability?start=${start.toISOString()}&end=${end.toISOString()}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? {}))
      .catch(() => setError("Failed to load availability."))
      .finally(() => setLoadingSlots(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const dayKey = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  const selectedDaySlots: Slot[] = slots[dayKey(selectedDay)] ?? [];

  const handleConfirm = async () => {
    if (!selectedSlot || !name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          clientName: name.trim(),
          clientEmail: email.trim(),
          clientCompany: company.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking failed");
      setConfirmed({ startTime: selectedSlot.start, meetLink: data.meetLink });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmed) {
    const isInPerson = meetingType === "in_person";
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0e0e0e] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <Check className="text-emerald-400" size={24} />
        </div>
        <h2 className="mb-2 text-xl font-bold">You&apos;re booked.</h2>
        <p className="mb-6 text-[#666]">{formatDate(confirmed.startTime)} at {formatTime(confirmed.startTime)}</p>
        {!isInPerson && confirmed.meetLink ? (
          <a
            href={confirmed.meetLink}
            className="inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-white/90 transition-colors"
          >
            Join Google Meet
          </a>
        ) : (
          <p className="text-[13px] text-[#888]">We&apos;ll reach out with location details shortly.</p>
        )}
        <p className="mt-4 text-[13px] text-[#555]">
          A confirmation with a calendar invite has been sent to {email}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day picker */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e0e0e] p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] tracking-[0.15em] uppercase text-[#555]">Select a day</p>
          {windowDays > 7 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekOffset((o) => Math.max(0, o - 7))}
                disabled={!canGoPrev}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#888] transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Previous week"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((o) => Math.min(windowDays - 7, o + 7))}
                disabled={!canGoNext}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#888] transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next week"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {visibleDays.map((d) => {
            const key = dayKey(d);
            const hasSlots = (slots[key] ?? []).length > 0;
            const isSelected = dayKey(d) === dayKey(selectedDay);
            return (
              <button
                key={key}
                onClick={() => { setSelectedDay(d); setSelectedSlot(null); }}
                className={`flex flex-col items-center gap-1 rounded-lg py-2.5 text-center transition-all ${
                  isSelected
                    ? "bg-white text-[#0a0a0a]"
                    : hasSlots
                    ? "bg-white/[0.05] text-[#ccc] hover:bg-white/[0.1]"
                    : "cursor-default opacity-30 text-[#555]"
                }`}
                disabled={!hasSlots && !loadingSlots}
              >
                <span className="text-[10px] font-medium">{DAYS[d.getDay()]}</span>
                <span className="text-[15px] font-semibold">{d.getDate()}</span>
                {hasSlots && !isSelected && (
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slots */}
      {selectedDay && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0e0e0e] p-5">
          <p className="mb-4 text-[11px] tracking-[0.15em] uppercase text-[#555]">
            {formatDate(selectedDay.toISOString())}
          </p>
          {loadingSlots ? (
            <p className="text-center text-sm text-[#555] py-4">Loading…</p>
          ) : selectedDaySlots.length === 0 ? (
            <p className="text-center text-sm text-[#555] py-4">No availability on this day.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {selectedDaySlots.map((slot) => {
                const isActive = selectedSlot?.start === slot.start;
                return (
                  <button
                    key={slot.start}
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-lg py-2.5 text-center text-[13px] font-medium transition-all ${
                      isActive
                        ? "bg-white text-[#0a0a0a]"
                        : "border border-white/[0.08] text-[#ccc] hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    {formatTime(slot.start)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Contact info + confirm */}
      {selectedSlot && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0e0e0e] p-5">
          <p className="mb-4 text-[11px] tracking-[0.15em] uppercase text-[#555]">Your details</p>

          <div className="mb-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[13px] text-[#888]">
            <span className="font-medium text-white">{typeLabel} · {durationDisplay}</span>
            {" · "}
            {formatDate(selectedSlot.start)} at {formatTime(selectedSlot.start)}
            <button
              onClick={() => setSelectedSlot(null)}
              className="ml-2 text-[#555] hover:text-[#aaa] underline text-[12px]"
            >
              Change
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-[#666]">Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-[#444] outline-none focus:border-white/20"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#666]">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-[#444] outline-none focus:border-white/20"
                  placeholder="your@email.com"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[#666]">Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-[#444] outline-none focus:border-white/20"
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[#666]">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-[#444] outline-none focus:border-white/20"
                placeholder="Anything you'd like us to know beforehand?"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-[13px] text-red-400">{error}</p>
          )}

          <button
            onClick={handleConfirm}
            disabled={submitting || !name.trim() || !email.trim()}
            className="mt-4 w-full rounded-lg bg-white py-3 text-[13px] font-semibold text-[#0a0a0a] transition-all hover:bg-white/90 disabled:opacity-40"
          >
            {submitting ? "Confirming…" : "Confirm booking"}
          </button>
        </div>
      )}

      {/* Left/right navigation hint */}
      <p className="text-center text-[12px] text-[#444]">
        All times shown in Pacific Time (PT)
      </p>
    </div>
  );
}
