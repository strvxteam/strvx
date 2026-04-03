"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  X,
  Clock,
  Users,
  Calendar as CalendarIcon,
  Tag,
  Plus,
  Video,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventContentArg } from "@fullcalendar/core";
import {
  EVENT_TYPE_COLORS,
  type CalendarEvent,
  type EventType,
} from "@/lib/mock-calendar";
import { formatHour, formatDate } from "@/lib/calendar-utils";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  createCalendarEventAction,
  updateCalendarEventAction,
  deleteCalendarEventAction,
  deleteGoogleCalendarEventAction,
  updateGoogleCalendarEventAction,
} from "@/app/actions";
import { toast } from "sonner";

interface Company {
  id: string;
  name: string;
}

const TYPE_LABELS: Record<string, string> = {
  client_call: "Client Call",
  internal: "Internal",
  deadline: "Deadline",
};

const EVENT_TYPE_HEX: Record<string, { bg: string; border: string; text: string }> = {
  client_call: { bg: "#e8f0fe", border: "#1a73e8", text: "#1a73e8" },
  internal: { bg: "#f3e5f5", border: "#8e24aa", text: "#8e24aa" },
  deadline: { bg: "#fde8e8", border: "#c0392b", text: "#c0392b" },
};

function calendarEventToFC(evt: CalendarEvent) {
  const startHour = Math.floor(evt.startHour);
  const startMin = Math.round((evt.startHour - startHour) * 60);
  const endHourRaw = evt.startHour + evt.durationHours;
  const endHour = Math.floor(endHourRaw);
  const endMin = Math.round((endHourRaw - endHour) * 60);

  const colors = EVENT_TYPE_HEX[evt.type] ?? EVENT_TYPE_HEX.internal;

  return {
    id: evt.id,
    title: evt.title,
    start: `${evt.date}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00`,
    end: `${evt.date}T${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
    extendedProps: { calendarEvent: evt },
  };
}

function renderEventContent(arg: EventContentArg) {
  const timeText = arg.timeText;
  const title = arg.event.title;

  if (arg.view.type === "dayGridMonth") {
    return (
      <div className="flex flex-col gap-0.5 py-0.5 px-1 overflow-hidden">
        <span className="text-[10px] opacity-70 font-medium">{timeText}</span>
        <span className="text-[11px] font-medium leading-tight">{title}</span>
      </div>
    );
  }

  // Week/day views
  return (
    <div className="flex flex-col gap-0.5 py-1 px-1.5 overflow-hidden h-full">
      <span className="text-[10px] opacity-80 font-medium">{timeText}</span>
      <span className="text-[12px] font-semibold leading-tight">{title}</span>
    </div>
  );
}

function hoursToTime(h: number): string {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToHours(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

export function CalendarPageClient({
  initialEvents,
  googleConnected = false,
  initialCompanies = [],
}: {
  initialEvents: CalendarEvent[];
  googleConnected?: boolean;
  initialCompanies?: Company[];
}) {
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [companies] = useState<Company[]>(initialCompanies);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState(formatDate(new Date()));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const fcEvents = useMemo(() => events.map(calendarEventToFC), [events]);

  const isGoogleCalendarEvent = useCallback((id: string) => id.startsWith("gcal-"), []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const evt = info.event.extendedProps.calendarEvent as CalendarEvent;
    setSelectedEventId((prev) => (prev === evt.id ? null : evt.id));
  }, []);

  const handleDateClick = useCallback((info: { dateStr: string }) => {
    setDefaultDate(info.dateStr.split("T")[0]);
    setShowAddModal(true);
  }, []);

  const handleAddEvent = useCallback(async (newEvent: CalendarEvent) => {
    setEvents((prev) => [...prev, newEvent]);
    setShowAddModal(false);

    try {
      await createCalendarEventAction({
        title: newEvent.title,
        type: newEvent.type,
        date: newEvent.date,
        startHour: newEvent.startHour,
        durationHours: newEvent.durationHours,
        client: newEvent.client,
        zoomLink: newEvent.zoomLink,
      });
      toast.success("Event created");
    } catch (err) {
      console.error(err);
      setEvents((prev) => prev.filter((e) => e.id !== newEvent.id));
      toast.error("Failed to create event");
    }
  }, []);

  const handleEditEvent = useCallback(async (updated: CalendarEvent) => {
    const previous = events.find((e) => e.id === updated.id);
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditingEvent(null);
    setSelectedEventId(null);

    try {
      if (isGoogleCalendarEvent(updated.id)) {
        await updateGoogleCalendarEventAction(updated.id, {
          title: updated.title,
          date: updated.date,
          startHour: updated.startHour,
          durationHours: updated.durationHours,
          client: updated.client,
          zoomLink: updated.zoomLink,
        });
      } else {
        await updateCalendarEventAction(updated.id, {
          title: updated.title,
          type: updated.type,
          date: updated.date,
          startHour: updated.startHour,
          durationHours: updated.durationHours,
          client: updated.client,
          zoomLink: updated.zoomLink,
        });
      }
      toast.success("Event updated");
    } catch (err) {
      console.error(err);
      if (previous) {
        setEvents((prev) => prev.map((e) => (e.id === updated.id ? previous : e)));
      }
      toast.error("Failed to update event");
    }
  }, [events, isGoogleCalendarEvent]);

  const handleDeleteEvent = useCallback(async (eventId: string) => {
    const previous = events.find((e) => e.id === eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setEditingEvent(null);
    setSelectedEventId(null);
    setConfirmDeleteId(null);

    try {
      if (isGoogleCalendarEvent(eventId)) {
        await deleteGoogleCalendarEventAction(eventId);
      } else {
        await deleteCalendarEventAction(eventId);
      }
      toast.success("Event deleted");
    } catch (err) {
      console.error(err);
      if (previous) {
        setEvents((prev) => [...prev, previous]);
      }
      toast.error("Failed to delete event");
    }
  }, [events, isGoogleCalendarEvent]);

  const selectedEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId) ?? null
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <div className="flex items-center gap-3">
          {googleConnected ? (
            <span className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-[12px] font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Google Calendar synced
            </span>
          ) : (
            <a
              href="/api/auth/google"
              className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
            >
              Connect Google Calendar
            </a>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333]"
          >
            <Plus size={14} strokeWidth={2} />
            Add Event
          </button>
        </div>
      </div>

      <div className="fc-wrapper flex-1 rounded-lg border border-[#e0e0e0] bg-white p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={fcEvents}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          eventContent={renderEventContent}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          nowIndicator={true}
          nowIndicatorContent={() => {
            const now = new Date();
            const h = now.getHours();
            const m = now.getMinutes();
            const ampm = h >= 12 ? "PM" : "AM";
            const hour = h % 12 || 12;
            const min = String(m).padStart(2, "0");
            return <span className="text-[10px] font-semibold text-[#ef4444]">{hour}:{min} {ampm}</span>;
          }}
          firstDay={1}
          height="100%"
          slotMinTime="08:00:00"
          slotMaxTime="22:00:00"
          allDaySlot={false}
          eventDisplay="block"
          dayMaxEvents={false}
          weekends={true}
          editable={false}
          selectable={false}
        />
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (() => {
        const colors = EVENT_TYPE_COLORS[selectedEvent.type];
        const [y, m, d] = selectedEvent.date.split("-").map(Number);
        const evtDateObj = new Date(y, m - 1, d);
        const dateLabel = evtDateObj.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        const typeColor = selectedEvent.type === "client_call" ? "#1a73e8"
          : selectedEvent.type === "internal" ? "#8e24aa" : "#c0392b";
        const isGcal = isGoogleCalendarEvent(selectedEvent.id);
        const isConfirmingDelete = confirmDeleteId === selectedEvent.id;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
            onClick={() => { setSelectedEventId(null); setConfirmDeleteId(null); }}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-2 rounded-t-2xl" style={{ backgroundColor: typeColor }} />

              <div className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <h2 className="text-[18px] font-bold text-[#111] leading-snug pr-4">
                    {selectedEvent.title}
                  </h2>
                  <button
                    onClick={() => { setSelectedEventId(null); setConfirmDeleteId(null); }}
                    className="rounded-lg p-1.5 text-[#aaa] transition-colors hover:bg-[#f5f5f5] hover:text-[#555] shrink-0"
                  >
                    <X size={18} strokeWidth={1.5} />
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f5f5]">
                      <CalendarIcon size={15} strokeWidth={1.5} className="text-[#888]" />
                    </div>
                    <p className="text-[13px] font-medium text-[#222]">{dateLabel}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f5f5]">
                      <Clock size={15} strokeWidth={1.5} className="text-[#888]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#222]">
                        {formatHour(selectedEvent.startHour)} – {formatHour(selectedEvent.startHour + selectedEvent.durationHours)}
                      </p>
                      <p className="text-[12px] text-[#999]">
                        {selectedEvent.durationHours >= 1
                          ? `${selectedEvent.durationHours} hour${selectedEvent.durationHours > 1 ? "s" : ""}`
                          : `${selectedEvent.durationHours * 60} minutes`}
                      </p>
                    </div>
                  </div>

                  {selectedEvent.client && (
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f5f5]">
                        <Users size={15} strokeWidth={1.5} className="text-[#888]" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-[#222]">{selectedEvent.client}</p>
                        <p className="text-[12px] text-[#999]">Client</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f5f5]">
                      <Tag size={15} strokeWidth={1.5} className="text-[#888]" />
                    </div>
                    <span className={`rounded-lg px-3 py-1 text-[12px] font-semibold ${colors.bg} ${colors.text}`}>
                      {TYPE_LABELS[selectedEvent.type]}
                    </span>
                  </div>

                  {selectedEvent.zoomLink && (
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f5f5]">
                        <Video size={15} strokeWidth={1.5} className="text-[#888]" />
                      </div>
                      <a
                        href={selectedEvent.zoomLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[13px] font-medium text-[#1a73e8] hover:underline"
                      >
                        Join Zoom Meeting
                        <ExternalLink size={12} strokeWidth={2} />
                      </a>
                    </div>
                  )}

                  {isGcal && (
                    <p className="text-[11px] text-[#bbb] mt-2">
                      Synced from Google Calendar
                    </p>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-[#f0f0f0] pt-4">
                    <div>
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#c0392b] font-medium">Delete this event?</span>
                          <button
                            onClick={() => { setConfirmDeleteId(null); handleDeleteEvent(selectedEvent.id); }}
                            className="rounded-lg bg-[#c0392b] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#a93226]"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#777] transition-colors hover:bg-[#f5f5f5]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(selectedEvent.id)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#c0392b] transition-colors hover:bg-[#fde8e8]"
                        >
                          <Trash2 size={13} strokeWidth={1.5} />
                          Delete
                        </button>
                      )}
                    </div>
                    {!isConfirmingDelete && (
                      <button
                        onClick={() => {
                          setEditingEvent(selectedEvent);
                          setSelectedEventId(null);
                          setConfirmDeleteId(null);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
                      >
                        <Pencil size={13} strokeWidth={1.5} />
                        Edit
                      </button>
                    )}
                  </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Event Modal */}
      {showAddModal && (
        <EventFormModal
          mode="create"
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddEvent}
          defaultDate={defaultDate}
          companies={companies}
        />
      )}

      {/* Edit Event Modal */}
      {editingEvent && (
        <EventFormModal
          mode="edit"
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSubmit={handleEditEvent}
          onDelete={() => handleDeleteEvent(editingEvent.id)}
          defaultDate={editingEvent.date}
          companies={companies}
        />
      )}
    </div>
  );
}

// ── Event Form Modal (create + edit) ────────────────────

function EventFormModal({
  mode,
  event,
  onClose,
  onSubmit,
  onDelete,
  defaultDate,
  companies,
}: {
  mode: "create" | "edit";
  event?: CalendarEvent;
  onClose: () => void;
  onSubmit: (event: CalendarEvent) => void;
  onDelete?: () => void;
  defaultDate: string;
  companies: Company[];
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "client_call");
  const [date, setDate] = useState(event?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(
    event ? hoursToTime(event.startHour) : "10:00"
  );
  const [endTime, setEndTime] = useState(
    event ? hoursToTime(event.startHour + event.durationHours) : "11:00"
  );
  const [client, setClient] = useState(event?.client ?? "");
  const [zoomLink, setZoomLink] = useState(event?.zoomLink ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const inputClass =
    "w-full rounded-lg border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-[13px] text-[#222] outline-none transition-colors focus:border-[#1a73e8] focus:bg-white";
  const labelClass =
    "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#888]";

  const clientOptions = companies.map((c) => ({ value: c.name, label: c.name }));

  const startH = timeToHours(startTime);
  const endH = timeToHours(endTime);
  const durationHours = Math.max(endH - startH, 0.25);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      id: event?.id ?? `evt-${Date.now()}`,
      title: title.trim(),
      type,
      date,
      startHour: startH,
      durationHours,
      client: client || null,
      zoomLink: zoomLink.trim() || null,
      projectId: event?.projectId ?? null,
    });
  }

  const isEdit = mode === "edit";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#f0f0f0] px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8f0fe]">
            {isEdit ? (
              <Pencil size={16} strokeWidth={2} className="text-[#1a73e8]" />
            ) : (
              <CalendarIcon size={16} strokeWidth={2} className="text-[#1a73e8]" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-[#111]">
              {isEdit ? "Edit Event" : "New Event"}
            </h2>
            <p className="text-[11px] text-[#999]">
              {isEdit
                ? "Update event details"
                : "Will sync to Google Calendar when connected"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#aaa] transition-colors hover:bg-[#f5f5f5] hover:text-[#555]"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="space-y-4">
            <div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                className="w-full border-0 bg-transparent text-[16px] font-semibold text-[#111] outline-none placeholder:text-[#ccc]"
                placeholder="Event title..."
              />
            </div>

            {/* Type pills */}
            <div>
              <label className={labelClass}>Type</label>
              <div className="flex gap-2">
                {(
                  [
                    ["client_call", "Client Call", "#1a73e8"],
                    ["internal", "Internal", "#8e24aa"],
                    ["deadline", "Deadline", "#c0392b"],
                  ] as const
                ).map(([key, label, color]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      type === key
                        ? "text-white shadow-sm"
                        : "bg-[#f5f5f5] text-[#777] hover:bg-[#eee]"
                    }`}
                    style={
                      type === key ? { backgroundColor: color } : undefined
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + Time row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    if (timeToHours(e.target.value) >= timeToHours(endTime)) {
                      const [h, m] = e.target.value.split(":").map(Number);
                      const newEnd = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                      setEndTime(newEnd);
                    }
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  min={startTime}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Client */}
            <div>
              <label className={labelClass}>Client (optional)</label>
              <CustomSelect
                value={client}
                onChange={setClient}
                options={[{ value: "", label: "No client" }, ...clientOptions]}
                placeholder="Select client..."
              />
            </div>

            {/* Zoom Link */}
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5">
                  <Video size={12} strokeWidth={2} />
                  Zoom / Meeting Link (optional)
                </span>
              </label>
              <input
                value={zoomLink}
                onChange={(e) => setZoomLink(e.target.value)}
                className={inputClass}
                placeholder="https://zoom.us/j/..."
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-[#f0f0f0] pt-4">
            <div>
              {isEdit && onDelete && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[#c0392b] font-medium">Delete this event?</span>
                    <button
                      type="button"
                      onClick={onDelete}
                      className="rounded-lg bg-[#c0392b] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#a93226]"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#777] transition-colors hover:bg-[#f5f5f5]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#c0392b] transition-colors hover:bg-[#fde8e8]"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                    Delete
                  </button>
                )
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#777] transition-colors hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="rounded-lg bg-[#111] px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#333] disabled:opacity-30"
              >
                {isEdit ? "Save Changes" : "Create Event"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
