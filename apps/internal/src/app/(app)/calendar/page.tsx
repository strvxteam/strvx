import type { Metadata } from "next";
import { getCalendarEvents, getUserByEmail, getCompanies } from "@/lib/queries";
import { isGoogleCalendarConnected, getGoogleCalendarEvents } from "@/lib/google-calendar";
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

  // Check Google Calendar connection and fetch events if connected
  let googleConnected = false;
  let googleEvents: CalendarEvent[] = [];

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user?.email) {
      const dbUser = await getUserByEmail(user.email);
      if (dbUser) {
        googleConnected = await isGoogleCalendarConnected(dbUser.id);

        if (googleConnected) {
          // Fetch Google Calendar events for current month +/- 1 month
          const now = new Date();
          const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
          const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

          const gEvents = await getGoogleCalendarEvents(dbUser.id, timeMin, timeMax);

          // Convert Google events to CalendarEvent format (Central Time)
          googleEvents = gEvents.map((ge) => {
            // Convert to Central Time by formatting in that timezone
            const start = new Date(ge.start);
            const end = new Date(ge.end);
            const centralStart = new Date(start.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
            const centralEnd = new Date(end.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
            const date = ge.isAllDay
              ? ge.start
              : `${centralStart.getFullYear()}-${String(centralStart.getMonth() + 1).padStart(2, "0")}-${String(centralStart.getDate()).padStart(2, "0")}`;
            const startHour = ge.isAllDay ? 0 : centralStart.getHours() + centralStart.getMinutes() / 60;
            const durationMs = centralEnd.getTime() - centralStart.getTime();
            const durationHours = ge.isAllDay ? 24 : durationMs / (1000 * 60 * 60);

            return {
              id: `gcal-${ge.googleEventId}`,
              title: ge.title,
              type: "client_call" as CalendarEvent["type"],
              date,
              startHour,
              durationHours: Math.min(durationHours, 8), // Cap display at 8 hours
              client: null,
              zoomLink: ge.meetLink || null,
              projectId: null,
            };
          });
        }
      }
    }
  } catch (err) {
    console.error("[Calendar] Google Calendar fetch failed:", err);
  }

  // Merge DB events with Google Calendar events, deduplicating by title + date
  const dbEventKeys = new Set(converted.map((e) => `${e.title}::${e.date}`));
  const uniqueGoogleEvents = googleEvents.filter((ge) => !dbEventKeys.has(`${ge.title}::${ge.date}`));
  const events: CalendarEvent[] = [...converted, ...uniqueGoogleEvents];

  return <CalendarPageClient initialEvents={events} googleConnected={googleConnected} initialCompanies={companiesList} />;
}
