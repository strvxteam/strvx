export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import { getCalendarEvents, getCompanies, getUserByEmail } from "@/lib/queries";
import { getTeamCalendarEvents, getPersonalCalendarEvents } from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";
import { type CalendarEvent } from "@/lib/mock-calendar";
import { loadCalendarAgentOverlays } from "@/lib/calendar-agent-overlays";
import { CalendarPageClient } from "./calendar-page-client";

export const metadata: Metadata = { title: "Calendar" };

function mapGoogleEvent(ge: {
  googleEventId: string;
  title: string;
  start: string;
  end: string;
  meetLink: string;
  isAllDay: boolean;
}): CalendarEvent {
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
}

export default async function CalendarPage() {
  const [dbEvents, companiesList] = await Promise.all([
    getCalendarEvents(),
    getCompanies(),
  ]);

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

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

  let googleEvents: CalendarEvent[] = [];

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (process.env.GOOGLE_TEAM_REFRESH_TOKEN) {
      // Best path: team token is available — fetch team calendar + user's personal calendar
      const teamCalendarId = process.env.TEAM_CALENDAR_ID ?? "strvxteam@gmail.com";
      const calendarIds = user?.email ? [teamCalendarId, user.email] : [teamCalendarId];
      const gEvents = await getTeamCalendarEvents(timeMin, timeMax, calendarIds);
      googleEvents = gEvents.map(mapGoogleEvent);
    } else if (user?.email) {
      // Fallback: use the personal refresh token stored when the user connected via strvx.com
      const dbUser = await getUserByEmail(user.email);
      if (dbUser?.googleRefreshToken) {
        const gEvents = await getPersonalCalendarEvents(dbUser.googleRefreshToken, timeMin, timeMax);
        googleEvents = gEvents.map(mapGoogleEvent);
      }
    }
  } catch (err) {
    console.error("[Calendar] Google Calendar fetch failed:", err);
  }

  // Merge DB events with Google Calendar events, deduplicating by googleEventId or title+date
  const dbGoogleIds = new Set(dbEvents.filter((e) => e.googleEventId).map((e) => e.googleEventId));
  const dbEventKeys = new Set(converted.map((e) => `${e.title}::${e.date}`));
  const uniqueGoogleEvents = googleEvents.filter((ge) => {
    const gcalId = ge.id.replace(/^gcal-/, "");
    if (dbGoogleIds.has(gcalId)) return false;
    return !dbEventKeys.has(`${ge.title}::${ge.date}`);
  });
  const events: CalendarEvent[] = [...converted, ...uniqueGoogleEvents];

  const overlays = await loadCalendarAgentOverlays(events.map((e) => e.id));
  const enriched = events.map((e) => {
    const o = overlays.get(e.id);
    if (!o) return e;
    return {
      ...e,
      engagementId: o.engagementId,
      engagementName: o.engagementName,
      hasPrepBrief: o.hasPrepBrief,
    };
  });

  return (
    <CalendarPageClient
      initialEvents={enriched}
      initialCompanies={companiesList}
    />
  );
}
