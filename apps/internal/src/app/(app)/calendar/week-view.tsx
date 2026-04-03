"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarEvent, EVENT_TYPE_COLORS } from "@/lib/mock-calendar";
import { formatDate, formatHour } from "@/lib/calendar-utils";

const START_HOUR = 8;
const HOURS = Array.from({ length: 24 - START_HOUR }, (_, i) => i + START_HOUR);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface WeekViewProps {
  weekDates: Date[];
  weekEvents: CalendarEvent[];
  todayStr: string;
  selectedEventId: string | null;
  onEventClick: (event: CalendarEvent) => void;
}

export function WeekView({
  weekDates,
  weekEvents,
  todayStr,
  selectedEventId,
  onEventClick,
}: WeekViewProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (selectedEventId && selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedEventId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(interval);
  }, []);

  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowDateStr = formatDate(now);
  const nowTimeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();

  return (
    <div className="rounded-lg border border-[#e0e0e0] bg-white">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[#e0e0e0]">
        <div />
        {weekDates.map((date, i) => {
          const dateStr = formatDate(date);
          const isToday = dateStr === todayStr;
          return (
            <div
              key={i}
              className={`px-2 py-2 text-center ${
                isToday ? "bg-[#e8f0fe]" : ""
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                {DAYS[i]}
              </div>
              <div
                className={`text-[13px] font-medium ${
                  isToday ? "text-[#1a73e8]" : "text-[#222]"
                }`}
              >
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[#f0f0f0]"
        >
          <div className="relative px-2 text-right text-[11px] text-[#aaa]">
            <span className="absolute -top-[7px] right-2">
              {formatHour(hour)}
            </span>
          </div>
          {weekDates.map((date, dayIdx) => {
            const dateStr = formatDate(date);
            const isToday = dateStr === todayStr;
            const isNowCell = dateStr === nowDateStr && Math.floor(nowHour) === hour;
            const cellEvents = weekEvents.filter(
              (evt) => evt.date === dateStr && Math.floor(evt.startHour) === hour
            );
            return (
              <div
                key={dayIdx}
                className={`relative min-h-[40px] border-l border-[#f0f0f0] px-1 py-0.5 ${
                  isToday ? "bg-[#fafcff]" : ""
                }`}
              >
                {isNowCell && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                    style={{ top: `${(nowHour - hour) * 100}%` }}
                  >
                    <div className="-translate-x-1/2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {nowTimeStr}
                    </div>
                    <div className="h-[2px] flex-1 bg-red-500" />
                  </div>
                )}
                {cellEvents.map((evt) => {
                  const colors = EVENT_TYPE_COLORS[evt.type];
                  const isSelected = evt.id === selectedEventId;
                  return (
                    <button
                      key={evt.id}
                      ref={isSelected ? selectedRef : undefined}
                      type="button"
                      onClick={() => onEventClick(evt)}
                      className={`w-full rounded border-l-2 text-left ${colors.bg} ${colors.border} px-1.5 py-1 transition-all hover:brightness-95 ${
                        isSelected ? "ring-2 ring-[#1a73e8] ring-offset-1" : ""
                      }`}
                      style={{
                        minHeight: `${evt.durationHours * 40 - 4}px`,
                      }}
                    >
                      <p
                        className={`text-[11px] font-medium leading-tight ${colors.text}`}
                      >
                        {evt.title}
                      </p>
                      <p className="text-[10px] text-[#888]">
                        {formatHour(evt.startHour)} –{" "}
                        {formatHour(evt.startHour + evt.durationHours)}
                      </p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
