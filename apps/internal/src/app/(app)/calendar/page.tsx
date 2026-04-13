import type { Metadata } from "next";
import { getCalendarEvents, getCompanies } from "@/lib/queries";
import { getTeamCalendarEvents } from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar" };
import { type CalendarEvent } from "@/lib/mock-calendar";
import { CalendarPageClient } from "./calendar-page-client";

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const [dbEvents, companiesList] = await Promise.all([
    getCalendarEvents(),
    getCompanies(),
  ]);
  // Convert DB events to CalendarEvent format
  const converted: CalendarEvent[] = dbEvents.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type as CalendarEvent["type"],
    date: e.date,
    startHour: Number(e.startHour),
    durationHours: Number(e.durationHours),
    client: e.client,
    zoomLink: e.zoomLink,
    projectId: e.projectId,
  }));

  // Fetch strvx team events + the logged-in user's personal calendar.
  // strvxteam@gmail.com has shared access to both Alex's and Nick's personal calendars,
  // so we filter to [teamCalendar, userEmail] to avoid showing one person's personal
  // events to the other.
  const googleConnected = !!process.env.GOOGLE_TEAM_REFRESH_TOKEN;
  let googleEvents: CalendarEvent[] = [];

  try {
    if (googleConnected) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const teamCalendarId = process.env.TEAM_CALENDAR_ID ?? "strvxteam@gmail.com";
      const calendarIds = user?.email
        ? [teamCalendarId, user.email]
        : [teamCalendarId];

      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

      const gEvents = await getTeamCalendarEvents(timeMin, timeMax, calendarIds);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      googleEvents = gEvents.map((ge: any) => {
        const start = new Date(ge.start);
        const end = new Date(ge.end);
        const pacificStart = new Date(start.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
        const pacificEnd = new Date(end.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
        const date = ge.isAllDay
          ? ge.start
          : `${pacificStart.getFullYear()}-${String(pacificStart.getMonth() + 1).padStart(2, "0")}-${String(pacificStart.getDate()).padStart(2, "0")}`;
        const startHour = ge.isAllDay ? 0 : pacificStart.getHours() + pacificStart.getMinutes() / 60;
        const durationMs = pacificEnd.getTime() - pacificStart.getTime();
        const durationHours = ge.isAllDay ? 24 : durationMs / (1000 * 60 * 60);

        return {
          id: `gcal-${ge.googleEventId}`,
          title: ge.title,
          type: "client_call" as CalendarEvent["type"],
          date,
          startHour,
          durationHours: Math.min(durationHours, 8),
          client: null,
          zoomLink: ge.meetLink || null,
          projectId: null,
        };
      });
    }
  } catch (err) {
    console.error("[Calendar] Team calendar fetch failed:", err);
  }

  // Merge DB events with Google Calendar events, deduplicating by googleEventId (precise) or title+date (fallback)
  const dbGoogleIds = new Set(dbEvents.filter((e) => e.googleEventId).map((e) => e.googleEventId));
  const dbEventKeys = new Set(converted.map((e) => `${e.title}::${e.date}`));
  const uniqueGoogleEvents = googleEvents.filter((ge) => {
    const gcalId = ge.id.replace(/^gcal-/, "");
    if (dbGoogleIds.has(gcalId)) return false;
    return !dbEventKeys.has(`${ge.title}::${ge.date}`);
  });
  const events: CalendarEvent[] = [...converted, ...uniqueGoogleEvents];

  return <CalendarPageClient initialEvents={events} googleConnected={googleConnected} initialCompanies={companiesList} />;
}
