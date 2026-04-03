"use client";

import { useMemo } from "react";
import { CalendarEvent, EVENT_TYPE_COLORS } from "@/lib/mock-calendar";
import { formatHour } from "@/lib/calendar-utils";

interface UpcomingSidebarProps {
  weekEvents: CalendarEvent[];
  weekDates: Date[];
  selectedEventId: string | null;
  onEventClick: (event: CalendarEvent) => void;
}

export function UpcomingSidebar({
  weekEvents,
  weekDates,
  selectedEventId,
  onEventClick,
}: UpcomingSidebarProps) {
  const dayGroups = useMemo(() => {
    const groups: { date: Date; dateStr: string; label: string; events: CalendarEvent[] }[] = [];
    for (const date of weekDates) {
      const dateStr = date.toISOString().split("T")[0];
      // Use local date for the label
      const label = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const dayEvts = weekEvents
        .filter((evt) => evt.date === dateStr)
        .sort((a, b) => a.startHour - b.startHour);
      groups.push({ date, dateStr, label, events: dayEvts });
    }
    return groups;
  }, [weekEvents, weekDates]);

  const hasAnyEvents = weekEvents.length > 0;

  return (
    <div className="w-64 shrink-0">
      <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[#333]">
          This Week
        </h2>
        {!hasAnyEvents ? (
          <p className="text-[12px] text-[#aaa]">No events this week</p>
        ) : (
          <div className="flex flex-col gap-3">
            {dayGroups.map(({ dateStr, label, events }) => {
              if (events.length === 0) return null;
              return (
                <div key={dateStr}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#aaa]">
                    {label}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {events.map((evt) => {
                      const colors = EVENT_TYPE_COLORS[evt.type];
                      const isSelected = evt.id === selectedEventId;
                      return (
                        <button
                          key={evt.id}
                          type="button"
                          onClick={() => onEventClick(evt)}
                          className={`rounded border-l-2 text-left ${colors.border} ${colors.bg} px-3 py-1.5 transition-all hover:brightness-95 ${
                            isSelected ? "ring-2 ring-[#1a73e8] ring-offset-1" : ""
                          }`}
                        >
                          <p className={`text-[12px] font-medium leading-tight ${colors.text}`}>
                            {evt.title}
                          </p>
                          <p className="text-[10px] text-[#888]">
                            {formatHour(evt.startHour)} – {formatHour(evt.startHour + evt.durationHours)}
                          </p>
                          {evt.client && (
                            <p className="text-[10px] text-[#aaa]">{evt.client}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
