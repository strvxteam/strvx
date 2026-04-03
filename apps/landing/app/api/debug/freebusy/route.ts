export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { users } from "@strvx/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import type { TeamMember } from "@/lib/types";
import { google } from "googleapis";
import { createOAuth2Client, calculateAvailability } from "@/lib/google-calendar";
import type { BusySlot } from "@/lib/google-calendar";

// Debug-only route — remove before going to production
// GET /api/debug/freebusy?secret=ADMIN_SECRET&start=2026-04-01&end=2026-04-08
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  if (searchParams.get("secret") !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startParam = searchParams.get("start") ?? new Date().toISOString();
  const endParam = searchParams.get("end") ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMin = new Date(startParam);
  const timeMax = new Date(endParam);
  const minRequired = parseInt(process.env.MIN_REQUIRED_MEMBERS ?? "3", 10);
  const BUFFER_MS = 10 * 60 * 1000;

  // ── 1. Fetch members ───────────────────────────────────────────────────────
  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      googleRefreshToken: users.googleRefreshToken,
      calendarId: users.calendarId,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.googleRefreshToken)));

  if (!members || members.length === 0) {
    return NextResponse.json({ error: "No connected members found" });
  }

  const memberReport: Record<string, unknown>[] = [];
  const busyMap = new Map<string, BusySlot[]>();

  // ── 2. Per-member FreeBusy ─────────────────────────────────────────────────
  for (const member of members as TeamMember[]) {
    const entry: Record<string, unknown> = {
      id: member.id,
      name: member.name,
      email: member.email,
      hasToken: !!member.googleRefreshToken,
      status: "unknown",
    };

    if (!member.googleRefreshToken) {
      entry.status = "no_token — treated as fully busy";
      busyMap.set(member.id, [{ start: timeMin.toISOString(), end: timeMax.toISOString() }]);
      memberReport.push(entry);
      continue;
    }

    try {
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: member.googleRefreshToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Step A: list all calendars
      let calendarIds: string[] = [];
      try {
        const listRes = await calendar.calendarList.list({ minAccessRole: "freeBusyReader" });
        const items = listRes.data.items ?? [];
        calendarIds = items.map((c) => c.id!).filter(Boolean);
        entry.calendarsDiscovered = items.map((c) => ({ id: c.id, name: c.summary }));
        if (calendarIds.length === 0) {
          calendarIds = ["primary"];
          entry.calendarListWarning = "No calendars returned — falling back to primary";
        }
      } catch (listErr) {
        entry.calendarListError = String(listErr);
        calendarIds = ["primary"];
      }

      // Step B: FreeBusy query across all calendars
      const freebusyRes = await calendar.freebusy.query({
        requestBody: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          timeZone: "America/Los_Angeles",
          items: calendarIds.map((id) => ({ id })),
        },
      });

      // Step C: collect raw + errors, build buffered list
      const rawBusy: Record<string, unknown> = {};
      const calErrors: Record<string, unknown> = {};
      const allBusy: BusySlot[] = [];

      for (const calId of calendarIds) {
        const calData = freebusyRes.data.calendars?.[calId];
        if (!calData) {
          rawBusy[calId] = "NOT IN RESPONSE — key mismatch?";
          continue;
        }
        if (calData.errors?.length) calErrors[calId] = calData.errors;
        const busy = calData.busy ?? [];
        rawBusy[calId] = busy;
        for (const b of busy) {
          if (!b.start || !b.end) continue;
          allBusy.push({
            start: new Date(new Date(b.start).getTime() - BUFFER_MS).toISOString(),
            end: new Date(new Date(b.end).getTime() + BUFFER_MS).toISOString(),
          });
        }
      }

      busyMap.set(member.id, allBusy);

      entry.status = "ok";
      entry.rawBusyByCalendar = rawBusy;
      entry.calendarErrors = calErrors;
      entry.totalBusySlotsAfterBuffer = allBusy.length;
      entry.bufferedBusySlots = allBusy;

    } catch (err) {
      entry.status = "EXCEPTION — treated as fully busy";
      entry.error = String(err);
      busyMap.set(member.id, [{ start: timeMin.toISOString(), end: timeMax.toISOString() }]);
    }

    memberReport.push(entry);
  }

  // ── 3. Run calculateAvailability and check each slot ──────────────────────
  const memberIds = (members as TeamMember[]).map((m) => m.id);
  const memberNames = Object.fromEntries((members as TeamMember[]).map((m) => [m.id, m.name]));

  const availableSlots = calculateAvailability(busyMap, memberIds, timeMin, timeMax, 30, minRequired);

  // For each slot, show which members are free and which are blocked
  const slotsWithDetail = availableSlots.slice(0, 40).map((slot) => {
    const perMember = Object.fromEntries(
      memberIds.map((id) => {
        const busy = busyMap.get(id) ?? [];
        const conflict = busy.find((b) => {
          const bStart = new Date(b.start).getTime();
          const bEnd = new Date(b.end).getTime();
          return slot.start.getTime() < bEnd && slot.end.getTime() > bStart;
        });
        return [memberNames[id], conflict ? `BUSY (${conflict.start} – ${conflict.end})` : "free"];
      })
    );
    return {
      start: slot.start.toISOString(),
      startPacific: slot.start.toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      availableCount: slot.availableMembers.length,
      perMember,
    };
  });

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  const summary = {
    membersQueried: memberIds.length,
    minRequired,
    totalSlotsAvailable: availableSlots.length,
    busyMapSizes: Object.fromEntries(memberIds.map((id) => [memberNames[id], busyMap.get(id)?.length ?? 0])),
  };

  return NextResponse.json({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    summary,
    members: memberReport,
    sampleSlots: slotsWithDetail,
  });
}
