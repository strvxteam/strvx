"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeSlot = {
  start: string;
  end: string;
  members: string[];
  allFree: boolean;
};

type SlotsByDate = Record<string, TimeSlot[]>;

type BookingResult = {
  id: string;
  startTime: string;
  endTime: string;
  teamMembers: string[];
  meetLink: string | null;
};

// ── Date helpers (all Pacific-aware) ─────────────────────────────────────────

const PT = "America/Los_Angeles";

// Returns YYYY-MM-DD in Pacific time
function toPacificDateKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: PT });
}

// Returns the 7 Pacific date keys for the week starting `weekOffset * 7` days from tomorrow
function getWeekDateKeys(weekOffset: number): string[] {
  const now = new Date();
  // Tomorrow in ms, then shift by week offset
  const base = new Date(now.getTime() + (1 + weekOffset * 7) * 24 * 60 * 60 * 1000);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    return toPacificDateKey(d);
  });
}

// Start/end ISO strings to send to the API — add an extra day buffer on each side
// to ensure full Pacific coverage regardless of client timezone
function getQueryRange(weekOffset: number): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 9 * 24 * 60 * 60 * 1000); // 9-day window, trimmed by server
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatDayTab(dateKey: string): { weekday: string; day: string; month: string } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    day: String(day),
    month: d.toLocaleDateString("en-US", { month: "short" }),
  };
}

function formatWeekLabel(dateKeys: string[]): string {
  const first = dateKeys[0];
  const last = dateKeys[6];
  const [y1, m1, d1] = first.split("-").map(Number);
  const [, m2, d2] = last.split("-").map(Number);
  const fmtFirst = new Date(y1, m1 - 1, d1).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtLast = new Date(y1, m2 - 1, d2).toLocaleDateString("en-US", {
    month: m1 === m2 ? undefined : "short",
    day: "numeric",
  });
  return `${fmtFirst} – ${fmtLast}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: PT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatConfirmDate(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-US", {
      timeZone: PT,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " Pacific"
  );
}

function formatDayHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = ["Date & Time", "Your Details", "Confirmed"];
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const num = i + 1;
        const isActive = num === step;
        const isDone = num < step;
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  isDone || isActive ? "bg-[#0a0a0a] text-white" : "bg-[#e5e5e5] text-[#999]"
                }`}
              >
                {isDone ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : num}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${isActive ? "text-[#0a0a0a]" : "text-[#999]"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 sm:w-12 h-px mx-2 sm:mx-3 ${isDone ? "bg-[#0a0a0a]" : "bg-[#e5e5e5]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function BookingWidget() {
  const [step, setStep] = useState(1);
  const [weekOffset, setWeekOffset] = useState(0);
  const [slots, setSlots] = useState<SlotsByDate>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", notes: "" });

  const weekDateKeys = getWeekDateKeys(weekOffset);

  const fetchSlots = useCallback(async (offset: number) => {
    setLoadingSlots(true);
    setFetchError(null);
    setSelectedDate(null);
    try {
      const { start, end } = getQueryRange(offset);
      const res = await fetch(`/api/availability?start=${start}&end=${end}&duration=30`);
      if (!res.ok) throw new Error("Failed to load availability");
      const data = await res.json();
      const fetched: SlotsByDate = data.slots ?? {};
      setSlots(fetched);

      // Auto-select the first day in this week that has slots
      const keys = getWeekDateKeys(offset);
      const firstAvailable = keys.find((k) => (fetched[k] ?? []).length > 0);
      setSelectedDate(firstAvailable ?? keys[0]);
    } catch {
      setFetchError("Couldn't load available times. Please try again.");
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (step === 1) fetchSlots(weekOffset);
  }, [step, weekOffset, fetchSlots]);

  function handleWeekChange(delta: number) {
    const next = weekOffset + delta;
    if (next < 0 || next > 3) return;
    setWeekOffset(next);
  }

  function handleSlotSelect(slot: TimeSlot) {
    setSelectedSlot(slot);
    setSubmitError(null);
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.name,
          clientEmail: form.email,
          clientPhone: form.phone || undefined,
          clientCompany: form.company || undefined,
          clientNotes: form.notes || undefined,
          startTime: selectedSlot.start,
          duration: 30,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(
          res.status === 409
            ? "This slot was just taken. Please go back and pick another time."
            : data.error ?? "Something went wrong. Please try again."
        );
        return;
      }

      setBooking(data.booking);
      setStep(3);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedDaySlots = selectedDate ? (slots[selectedDate] ?? []) : [];

  return (
    <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm p-6 sm:p-8 w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#999] mb-1">
          Discovery Call · 30 min · Free
        </p>
        <h2 className="text-xl font-bold text-[#0a0a0a] tracking-tight">Book a call with strvx</h2>
      </div>

      {step < 3 && <StepIndicator step={step} />}

      {/* ── Step 1: Date & time ── */}
      {step === 1 && (
        <div>
          {/* Week navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => handleWeekChange(-1)}
              disabled={weekOffset === 0}
              className="p-1.5 rounded-lg border border-[#e5e5e5] text-[#0a0a0a] disabled:text-[#ccc] disabled:border-[#f0f0f0] hover:bg-[#f5f5f5] transition-colors"
              aria-label="Previous week"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-sm font-medium text-[#0a0a0a]">
              {!loadingSlots ? formatWeekLabel(weekDateKeys) : "Loading…"}
            </span>
            <button
              onClick={() => handleWeekChange(1)}
              disabled={weekOffset >= 3}
              className="p-1.5 rounded-lg border border-[#e5e5e5] text-[#0a0a0a] disabled:text-[#ccc] disabled:border-[#f0f0f0] hover:bg-[#f5f5f5] transition-colors"
              aria-label="Next week"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Day tabs */}
          <div className="grid grid-cols-7 gap-1 mb-5">
            {weekDateKeys.map((dateKey) => {
              const { weekday, day } = formatDayTab(dateKey);
              const hasSlots = (slots[dateKey] ?? []).length > 0;
              const isSelected = selectedDate === dateKey;
              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDate(dateKey)}
                  disabled={loadingSlots}
                  className={`flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all duration-150 ${
                    isSelected
                      ? "bg-[#0a0a0a] border-[#0a0a0a] text-white"
                      : hasSlots
                      ? "border-[#e5e5e5] text-[#0a0a0a] hover:border-[#0a0a0a] hover:bg-[#f5f5f5]"
                      : "border-[#f0f0f0] text-[#ccc] cursor-default"
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wide">{weekday}</span>
                  <span className="text-base font-bold mt-0.5">{day}</span>
                  {/* Dot indicator for days with slots */}
                  <span className={`w-1 h-1 rounded-full mt-1 ${
                    isSelected ? "bg-white/60" : hasSlots ? "bg-[#0a0a0a]" : "bg-transparent"
                  }`} />
                </button>
              );
            })}
          </div>

          {/* Slot list for selected day */}
          {loadingSlots && (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="w-5 h-5 border-2 border-[#e5e5e5] border-t-[#0a0a0a] rounded-full animate-spin" />
              <p className="text-sm text-[#999]">Checking availability…</p>
            </div>
          )}

          {!loadingSlots && fetchError && (
            <div className="text-center py-10">
              <p className="text-sm text-red-500 mb-3">{fetchError}</p>
              <button
                onClick={() => fetchSlots(weekOffset)}
                className="text-sm font-medium text-[#0a0a0a] underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          )}

          {!loadingSlots && !fetchError && selectedDate && (
            <div>
              <p className="text-xs font-semibold text-[#999] tracking-[0.08em] uppercase mb-3">
                {formatDayHeading(selectedDate)}
              </p>

              {selectedDaySlots.length === 0 ? (
                <div className="text-center py-8 bg-[#f9f9f9] rounded-xl">
                  <p className="text-sm text-[#999]">No availability on this day.</p>
                  {weekOffset < 3 && (
                    <button
                      onClick={() => handleWeekChange(1)}
                      className="mt-2 text-xs font-medium text-[#0a0a0a] underline underline-offset-4"
                    >
                      Check next week
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedDaySlots.map((slot) => (
                    <button
                      key={slot.start}
                      onClick={() => handleSlotSelect(slot)}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium border border-[#e5e5e5] bg-white text-[#0a0a0a] hover:border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white transition-all duration-150"
                    >
                      {formatTime(slot.start)}
                    </button>
                  ))}
                </div>
              )}

              <p className="text-xs text-[#bbb] mt-4">All times in Pacific Time</p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Client info ── */}
      {step === 2 && selectedSlot && (
        <div>
          <div className="bg-[#f7f7f7] rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-[#999] mb-0.5">Selected time</p>
              <p className="text-sm font-semibold text-[#0a0a0a]">{formatConfirmDate(selectedSlot.start)}</p>
            </div>
            <button
              onClick={() => { setStep(1); setSelectedSlot(null); setSubmitError(null); }}
              className="text-xs text-[#999] hover:text-[#0a0a0a] transition-colors font-medium underline underline-offset-4"
            >
              Change
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#666] mb-1.5 tracking-wide uppercase">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text" required autoComplete="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your full name"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#e5e5e5] text-sm text-[#0a0a0a] placeholder-[#bbb] bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#666] mb-1.5 tracking-wide uppercase">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email" required autoComplete="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@company.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#e5e5e5] text-sm text-[#0a0a0a] placeholder-[#bbb] bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#666] mb-1.5 tracking-wide uppercase">
                  Phone <span className="text-[#bbb] font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="tel" autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#e5e5e5] text-sm text-[#0a0a0a] placeholder-[#bbb] bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#666] mb-1.5 tracking-wide uppercase">
                  Company <span className="text-[#bbb] font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="text" autoComplete="organization"
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Acme Inc."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#e5e5e5] text-sm text-[#0a0a0a] placeholder-[#bbb] bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#666] mb-1.5 tracking-wide uppercase">
                Anything to share beforehand? <span className="text-[#bbb] font-normal normal-case">(optional)</span>
              </label>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Tell us about your project, goals, or any questions you have — helps us prepare."
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#e5e5e5] text-sm text-[#0a0a0a] placeholder-[#bbb] bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors resize-none"
              />
            </div>

            {submitError && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3">{submitError}</p>
            )}

            <button
              type="submit" disabled={submitting}
              className="w-full py-3 rounded-lg bg-[#0a0a0a] text-white text-sm font-semibold tracking-wide hover:bg-[#222] disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Confirming…
                </span>
              ) : "Confirm Booking"}
            </button>
          </form>
        </div>
      )}

      {/* ── Step 3: Confirmation ── */}
      {step === 3 && booking && (
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-full bg-[#f0faf2] border border-[#c8f0d0] flex items-center justify-center mx-auto mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-[#0a0a0a] tracking-tight mb-2">You&rsquo;re booked.</h3>
          <p className="text-sm text-[#666] mb-6">A confirmation has been sent to your email.</p>

          <div className="bg-[#f7f7f7] rounded-xl px-5 py-4 text-left mb-6 space-y-2">
            <div className="flex gap-3">
              <span className="text-xs text-[#999] w-16 shrink-0 pt-0.5">What</span>
              <span className="text-sm text-[#0a0a0a] font-medium">Discovery Call · 30 min</span>
            </div>
            <div className="flex gap-3">
              <span className="text-xs text-[#999] w-16 shrink-0 pt-0.5">When</span>
              <span className="text-sm text-[#0a0a0a] font-medium">{formatConfirmDate(booking.startTime)}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-xs text-[#999] w-16 shrink-0 pt-0.5">With</span>
              <span className="text-sm text-[#0a0a0a] font-medium">{booking.teamMembers.join(", ")}</span>
            </div>
          </div>

          {booking.meetLink && (
            <a
              href={booking.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-semibold px-6 py-3 rounded-lg hover:bg-[#222] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 2h4v4M14 2L8 8M6 4H3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Join Google Meet
            </a>
          )}
        </div>
      )}
    </div>
  );
}
