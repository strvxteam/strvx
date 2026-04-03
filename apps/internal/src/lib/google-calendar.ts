import { google } from "googleapis";
import { db } from "./db";
import { eq } from "drizzle-orm";

// Schema import for google_tokens table (define inline since we just created it)
import { pgTable, uuid, text, bigint, timestamp } from "drizzle-orm/pg-core";

export const googleTokens = pgTable("google_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiryDate: bigint("expiry_date", { mode: "number" }).notNull(),
  calendarId: text("calendar_id").notNull().default("primary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(extraScopes: string[] = []) {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    ...extraScopes,
  ];
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function getAuthedClient(userId: string) {
  const [token] = await db
    .select()
    .from(googleTokens)
    .where(eq(googleTokens.userId, userId));

  if (!token) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate,
  });

  // Auto-refresh if expired
  oauth2Client.on("tokens", async (newTokens) => {
    await db
      .update(googleTokens)
      .set({
        accessToken: newTokens.access_token || token.accessToken,
        refreshToken: newTokens.refresh_token || token.refreshToken,
        expiryDate: newTokens.expiry_date || token.expiryDate,
        updatedAt: new Date(),
      })
      .where(eq(googleTokens.userId, userId));
  });

  return { oauth2Client, calendarId: token.calendarId };
}

export async function getGoogleCalendarEvents(userId: string, timeMin: string, timeMax: string) {
  const authed = await getAuthedClient(userId);
  if (!authed) return [];

  const calendar = google.calendar({ version: "v3", auth: authed.oauth2Client });

  try {
    const response = await calendar.events.list({
      calendarId: authed.calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    return (response.data.items || []).map((event) => ({
      id: event.id || "",
      googleEventId: event.id || "",
      title: event.summary || "(No title)",
      description: event.description || "",
      start: event.start?.dateTime || event.start?.date || "",
      end: event.end?.dateTime || event.end?.date || "",
      location: event.location || "",
      meetLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || "",
      attendees: (event.attendees || []).map((a) => a.email || ""),
      isAllDay: !event.start?.dateTime,
      htmlLink: event.htmlLink || "",
    }));
  } catch (error) {
    console.error("[Google Calendar] Failed to fetch events:", error);
    return [];
  }
}

export async function createGoogleCalendarEvent(
  userId: string,
  event: {
    title: string;
    description?: string;
    startTime: string; // ISO datetime
    endTime: string;
    attendees?: string[];
    location?: string;
  }
) {
  const authed = await getAuthedClient(userId);
  if (!authed) throw new Error("Google Calendar not connected");

  const calendar = google.calendar({ version: "v3", auth: authed.oauth2Client });

  const response = await calendar.events.insert({
    calendarId: authed.calendarId,
    requestBody: {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startTime, timeZone: "America/Los_Angeles" },
      end: { dateTime: event.endTime, timeZone: "America/Los_Angeles" },
      attendees: event.attendees?.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
    conferenceDataVersion: 1,
  });

  return response.data;
}

export async function updateGoogleCalendarEvent(
  userId: string,
  googleEventId: string,
  event: {
    title?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    location?: string;
  }
) {
  const authed = await getAuthedClient(userId);
  if (!authed) throw new Error("Google Calendar not connected");

  const calendar = google.calendar({ version: "v3", auth: authed.oauth2Client });

  const requestBody: Record<string, unknown> = {};
  if (event.title !== undefined) requestBody.summary = event.title;
  if (event.description !== undefined) requestBody.description = event.description;
  if (event.location !== undefined) requestBody.location = event.location;
  if (event.startTime) requestBody.start = { dateTime: event.startTime, timeZone: "America/Los_Angeles" };
  if (event.endTime) requestBody.end = { dateTime: event.endTime, timeZone: "America/Los_Angeles" };

  const response = await calendar.events.patch({
    calendarId: authed.calendarId,
    eventId: googleEventId,
    requestBody,
  });

  return response.data;
}

export async function deleteGoogleCalendarEvent(userId: string, googleEventId: string) {
  const authed = await getAuthedClient(userId);
  if (!authed) return;

  const calendar = google.calendar({ version: "v3", auth: authed.oauth2Client });

  await calendar.events.delete({
    calendarId: authed.calendarId,
    eventId: googleEventId,
  });
}

export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const [token] = await db
    .select({ id: googleTokens.id })
    .from(googleTokens)
    .where(eq(googleTokens.userId, userId));
  return !!token;
}

export async function saveGoogleTokens(
  userId: string,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }
) {
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Missing access_token or refresh_token");
  }

  await db
    .insert(googleTokens)
    .values({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date || 0,
    })
    .onConflictDoUpdate({
      target: googleTokens.userId,
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date || 0,
        updatedAt: new Date(),
      },
    });
}

export async function disconnectGoogleCalendar(userId: string) {
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId));
}
