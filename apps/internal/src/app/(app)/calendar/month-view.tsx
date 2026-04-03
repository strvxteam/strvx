"use client";

import { useMemo } from "react";
import { CalendarEvent, EVENT_TYPE_COLORS } from "@/lib/mock-calendar";
import { getMonthGrid, getMonday, formatDate } from "@/lib/calendar-utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE_EVENTS = 3;

interface MonthViewProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  todayStr: string;
  selectedWeek: string;
  selectedEventId: string | null;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function MonthView({
  year,
  month,
  events,
  todayStr,
  selectedWeek,
  selectedEventId,
  onDayClick,
  onEventClick,
}: MonthViewProps) {
  const grid = useMemo(() => {
    const fullGrid = getMonthGrid(year, month);
    return fullGrid.filter((week) =>
      week.some((date) => date.getMonth() === month)
    );
  }, [year, month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const evt of events) {
      const existing = map.get(evt.date);
      if (existing) {
        existing.push(evt);
      } else {
        map.set(evt.date, [evt]);
      }
    }
    return map;
  }, [events]);

  return (
    <div className="rounded-lg border border-[#e0e0e0] bg-white">
      <div className="grid grid-cols-7 border-b border-[#e0e0e0]">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2.5 text-center text-[12px] font-semibold uppercase tracking-wide text-[#888]"
          >
            {label}
          </div>
        ))}
      </div>

      {grid.map((week, rowIdx) => {
        const weekMondayStr = formatDate(getMonday(week[0]));
        const isSelectedWeek = weekMondayStr === selectedWeek;

        return (
          <div
            key={rowIdx}
            className={`grid grid-cols-7 border-b border-[#f0f0f0] last:border-b-0 ${
              isSelectedWeek ? "bg-[#f0f7ff]" : ""
            }`}
          >
            {week.map((date, colIdx) => {
              const isCurrentMonth = date.getMonth() === month;
              const dateStr = formatDate(date);
              const isToday = dateStr === todayStr;
              const dayEvents = eventsByDate.get(dateStr) ?? [];
              const visible = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
              const overflow = dayEvents.length - MAX_VISIBLE_EVENTS;

              return (
                <div
                  key={colIdx}
                  onClick={() => onDayClick(date)}
                  className={`min-h-[120px] cursor-pointer border-l border-[#f0f0f0] p-2 transition-colors hover:bg-[#f5f5f5] ${
                    isToday ? "bg-[#fafcff]" : ""
                  } ${colIdx === 0 ? "border-l-0" : ""}`}
                >
                  <div
                    className={`mb-1 text-[13px] font-medium ${
                      isToday
                        ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1a73e8] text-white"
                        : isCurrentMonth
                          ? "text-[#222]"
                          : "text-[#ccc]"
                    }`}
                  >
                    {date.getDate()}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {visible.map((evt) => {
                      const colors = EVENT_TYPE_COLORS[evt.type];
                      const isSelected = evt.id === selectedEventId;
                      return (
                        <button
                          key={evt.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(evt);
                          }}
                          className={`truncate rounded border-l-2 text-left ${colors.border} ${colors.bg} px-1.5 py-0.5 text-[11px] font-medium leading-tight ${colors.text} transition-all hover:brightness-95 ${
                            isSelected ? "ring-2 ring-[#1a73e8] ring-offset-1" : ""
                          } ${!isCurrentMonth ? "opacity-60" : ""}`}
                        >
                          {evt.title}
                        </button>
                      );
                    })}
                    {overflow > 0 && (
                      <div className="text-[10px] text-[#888]">
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
