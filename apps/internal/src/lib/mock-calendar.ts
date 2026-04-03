export type EventType = "client_call" | "internal" | "deadline";

export interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;
  startHour: number;
  durationHours: number;
  client: string | null;
  zoomLink: string | null;
  projectId: string | null;
}

export const EVENT_TYPE_COLORS: Record<EventType, { bg: string; border: string; text: string }> = {
  client_call: { bg: "bg-[#e8f0fe]", border: "border-l-[#1a73e8]", text: "text-[#1a73e8]" },
  internal: { bg: "bg-[#f3e5f5]", border: "border-l-[#8e24aa]", text: "text-[#8e24aa]" },
  deadline: { bg: "bg-[#fde8e8]", border: "border-l-[#c0392b]", text: "text-[#c0392b]" },
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): string {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date.toISOString().split("T")[0];
}

const monday = getMonday(new Date());

export const mockCalendarEvents: CalendarEvent[] = [
  // This week
  {
    id: "evt-1",
    title: "Sprint 3 Standup - Stability Group",
    type: "client_call",
    date: addDays(monday, 0),
    startHour: 10,
    durationHours: 0.5,
    client: "The Stability Group",
    zoomLink: null,
    projectId: "proj-1",
  },
  {
    id: "evt-2",
    title: "Team Sync",
    type: "internal",
    date: addDays(monday, 0),
    startHour: 14,
    durationHours: 1,
    client: null,
    zoomLink: null,
    projectId: null,
  },
  {
    id: "evt-3",
    title: "Dr. Bob - Design Review",
    type: "client_call",
    date: addDays(monday, 1),
    startHour: 11,
    durationHours: 1,
    client: "Dr. Bob Nelson",
    zoomLink: null,
    projectId: "proj-2",
  },
  {
    id: "evt-4",
    title: "Summit Retail QA Review",
    type: "client_call",
    date: addDays(monday, 1),
    startHour: 15,
    durationHours: 0.5,
    client: "Summit Retail",
    zoomLink: null,
    projectId: "proj-3",
  },
  {
    id: "evt-5",
    title: "Invoice Review",
    type: "internal",
    date: addDays(monday, 2),
    startHour: 9,
    durationHours: 1,
    client: null,
    zoomLink: null,
    projectId: null,
  },
  {
    id: "evt-6",
    title: "Responsive Redesign Deadline",
    type: "deadline",
    date: addDays(monday, 2),
    startHour: 17,
    durationHours: 1,
    client: "The Stability Group",
    zoomLink: null,
    projectId: "proj-1",
  },
  {
    id: "evt-7",
    title: "Sarah Chen - Chatbot Scope Call",
    type: "client_call",
    date: addDays(monday, 3),
    startHour: 10,
    durationHours: 1,
    client: "Meridian Labs",
    zoomLink: null,
    projectId: "proj-4",
  },
  {
    id: "evt-8",
    title: "Marketing Strategy Session",
    type: "internal",
    date: addDays(monday, 4),
    startHour: 13,
    durationHours: 1.5,
    client: null,
    zoomLink: null,
    projectId: null,
  },
  // Next week
  {
    id: "evt-9",
    title: "Sprint 4 Planning - Stability Group",
    type: "client_call",
    date: addDays(monday, 7),
    startHour: 10,
    durationHours: 1.5,
    client: "The Stability Group",
    zoomLink: null,
    projectId: "proj-1",
  },
  {
    id: "evt-10",
    title: "Apex Financial Demo",
    type: "client_call",
    date: addDays(monday, 8),
    startHour: 14,
    durationHours: 1,
    client: "Apex Financial",
    zoomLink: null,
    projectId: "proj-5",
  },
  {
    id: "evt-11",
    title: "Summit E-Commerce Launch Deadline",
    type: "deadline",
    date: addDays(monday, 9),
    startHour: 17,
    durationHours: 1,
    client: "Summit Retail",
    zoomLink: null,
    projectId: "proj-3",
  },
  {
    id: "evt-12",
    title: "Retro & Planning",
    type: "internal",
    date: addDays(monday, 11),
    startHour: 15,
    durationHours: 1,
    client: null,
    zoomLink: null,
    projectId: null,
  },
];
