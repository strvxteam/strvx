import { google, type calendar_v3 } from "googleapis";
import { z } from "zod";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export type CheckCalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees?: string[];
  status: string;
};

export type CheckCalendarOk = {
  events: CheckCalendarEvent[];
  range: { start: string; end: string };
};

export type CheckCalendarScopeMissing = {
  events: [];
  error: "calendar_scope_missing";
  message: string;
  range: { start: string; end: string };
};

export type CheckCalendarOutput = CheckCalendarOk | CheckCalendarScopeMissing;

const MAX_EVENTS = 200;

/**
 * Detect Google's "insufficient permission" / scope-missing error.
 * googleapis surfaces these as 403 with reason `insufficientPermissions` or
 * the body containing "insufficient authentication scopes".
 */
function isScopeMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number; status?: number; message?: string };
  const code = e.code ?? e.status;
  if (code !== 403) return false;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("insufficient") ||
    msg.includes("scope") ||
    msg.includes("permission")
  );
}

/**
 * Pure-ish core: fetch and shape events. Takes a calendar client so it's
 * testable without OAuth.
 */
export async function fetchCalendarEvents(args: {
  calendar: calendar_v3.Calendar;
  email: string;
  start: string;
  end: string;
}): Promise<CheckCalendarOutput> {
  const { calendar, email, start, end } = args;
  try {
    const resp = await calendar.events.list({
      calendarId: "primary",
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: MAX_EVENTS,
    });
    const items = resp.data.items ?? [];
    const events: CheckCalendarEvent[] = items.slice(0, MAX_EVENTS).map((e) => ({
      id: e.id ?? "",
      summary: e.summary ?? "(no title)",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      attendees: e.attendees
        ? e.attendees
            .map((a) => a.email)
            .filter((x): x is string => typeof x === "string")
        : undefined,
      status: e.status ?? "confirmed",
    }));
    return { events, range: { start, end } };
  } catch (err) {
    if (isScopeMissingError(err)) {
      return {
        events: [],
        error: "calendar_scope_missing",
        message: `Mailbox ${email} hasn't granted calendar access yet — reconnect via /agent/settings?tab=mailboxes.`,
        range: { start, end },
      };
    }
    throw err;
  }
}

export const checkCalendarTool: ToolDefinition<
  z.infer<typeof inputSchema>,
  CheckCalendarOutput | { error: string; message?: string }
> = {
  name: "check_calendar",
  description:
    "Returns events on the mailbox's primary calendar between start and end (ISO 8601). Use before proposing meeting slots. Capped at 200 events per call.",
  inputSchema,
  async handle(input, ctx) {
    const safe = await getAuthedMailboxClientSafe(ctx.mailboxId);
    if (!safe.ok) {
      if (safe.error === "transient") {
        // Let the planner surface a transient error — re-throw.
        throw new Error(
          `check_calendar: transient OAuth failure: ${safe.message}`
        );
      }
      if (safe.error === "disconnected") {
        return {
          error: "mailbox_disconnected",
          message: safe.message,
        };
      }
      return {
        error: "mailbox_not_found",
        message: safe.message,
      };
    }
    const calendar = google.calendar({ version: "v3", auth: safe.client });
    return fetchCalendarEvents({
      calendar,
      email: safe.email,
      start: input.start,
      end: input.end,
    });
  },
};
