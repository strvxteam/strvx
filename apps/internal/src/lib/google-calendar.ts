import { google } from "googleapis";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt, isEncrypted } from "./crypto";

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

export const driveTokens = pgTable("drive_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiryDate: bigint("expiry_date", { mode: "number" }).notNull(),
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
    "https://www.googleapis.com/auth/gmail.readonly",
    ...extraScopes,
  ];
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });
}

export function getDriveAuthUrl(driveScopes: string[]) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    // Force account chooser so user can sign in with a different Google account
    prompt: "select_account consent",
    scope: driveScopes,
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

  // Decrypt tokens (with plaintext fallback for pre-encryption data)
  const accessToken = isEncrypted(token.accessToken)
    ? decrypt(token.accessToken)
    : token.accessToken;
  const refreshToken = isEncrypted(token.refreshToken)
    ? decrypt(token.refreshToken)
    : token.refreshToken;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: token.expiryDate,
  });

  // Auto-refresh if expired — encrypt new tokens before persisting
  oauth2Client.on("tokens", async (newTokens) => {
    await db
      .update(googleTokens)
      .set({
        accessToken: encrypt(newTokens.access_token || accessToken),
        refreshToken: encrypt(newTokens.refresh_token || refreshToken),
        expiryDate: newTokens.expiry_date || token.expiryDate,
        updatedAt: new Date(),
      })
      .where(eq(googleTokens.userId, userId));
  });

  return { oauth2Client, calendarId: token.calendarId };
}

/** Fetch calendar events using a personal refresh token (users.googleRefreshToken),
 *  pulling from ALL calendars on the account. */
export async function getPersonalCalendarEvents(refreshToken: string, timeMin: string, timeMax: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const calListRes = await calendar.calendarList.list({ minAccessRole: "freeBusyReader" });
    const calendarIds = (calListRes.data.items ?? []).map((c) => c.id!).filter(Boolean);
    if (calendarIds.length === 0) calendarIds.push("primary");

    const allEvents = new Map<string, ReturnType<typeof mapCalendarEvent>>();

    await Promise.all(
      calendarIds.map(async (calId) => {
        try {
          let pageToken: string | undefined;
          do {
            const response = await calendar.events.list({
              calendarId: calId,
              timeMin,
              timeMax,
              singleEvents: true,
              orderBy: "startTime",
              maxResults: 2500,
              pageToken,
            });
            for (const event of response.data.items || []) {
              if (event.id && !allEvents.has(event.id)) {
                allEvents.set(event.id, mapCalendarEvent(event));
              }
            }
            pageToken = response.data.nextPageToken ?? undefined;
          } while (pageToken);
        } catch {
          // Skip calendars that fail
        }
      })
    );

    return Array.from(allEvents.values()).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  } catch (error) {
    console.error("[Google Calendar] Failed to fetch personal events:", error);
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCalendarEvent(event: any) {
  return {
    id: event.id || "",
    googleEventId: event.id || "",
    title: event.summary || "(No title)",
    description: event.description || "",
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    location: event.location || "",
    meetLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attendees: (event.attendees || []).map((a: any) => a.email || ""),
    isAllDay: !event.start?.dateTime,
    htmlLink: event.htmlLink || "",
  };
}

export async function getGoogleCalendarEvents(userId: string, timeMin: string, timeMax: string) {
  const authed = await getAuthedClient(userId);
  if (!authed) return [];

  const calendar = google.calendar({ version: "v3", auth: authed.oauth2Client });

  try {
    // Get all calendars on this account
    const calListRes = await calendar.calendarList.list({ minAccessRole: "freeBusyReader" });
    const calendarIds = (calListRes.data.items ?? []).map((c) => c.id!).filter(Boolean);
    if (calendarIds.length === 0) calendarIds.push("primary");

    // Fetch events from all calendars in parallel, dedup by event ID
    const allEvents = new Map<string, ReturnType<typeof mapCalendarEvent>>();

    await Promise.all(
      calendarIds.map(async (calId) => {
        try {
          let pageToken: string | undefined;
          do {
            const response = await calendar.events.list({
              calendarId: calId,
              timeMin,
              timeMax,
              singleEvents: true,
              orderBy: "startTime",
              maxResults: 2500,
              pageToken,
            });
            for (const event of response.data.items || []) {
              if (event.id && !allEvents.has(event.id)) {
                allEvents.set(event.id, mapCalendarEvent(event));
              }
            }
            pageToken = response.data.nextPageToken ?? undefined;
          } while (pageToken);
        } catch {
          // Skip calendars that fail (e.g. no access)
        }
      })
    );

    return Array.from(allEvents.values()).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
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

// Fetches events via strvxteam@gmail.com's access.
// Pass specificCalendarIds to limit to e.g. [teamCalendarId, userEmail].
// If omitted, fetches from ALL accessible calendars (all shared personal calendars included).
export async function getTeamCalendarEvents(
  timeMin: string,
  timeMax: string,
  specificCalendarIds?: string[]
) {
  const teamRefreshToken = process.env.GOOGLE_TEAM_REFRESH_TOKEN;
  if (!teamRefreshToken) {
    console.warn("[getTeamCalendarEvents] GOOGLE_TEAM_REFRESH_TOKEN not set");
    return [];
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: teamRefreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    let calendarIds: string[];
    if (specificCalendarIds && specificCalendarIds.length > 0) {
      calendarIds = specificCalendarIds;
    } else {
      const calListRes = await calendar.calendarList.list({ minAccessRole: "freeBusyReader" });
      calendarIds = (calListRes.data.items ?? []).map((c) => c.id!).filter(Boolean);
      if (calendarIds.length === 0) calendarIds.push("primary");
    }

    const allEvents = new Map<string, ReturnType<typeof mapCalendarEvent>>();

    await Promise.all(
      calendarIds.map(async (calId) => {
        try {
          let pageToken: string | undefined;
          do {
            const response = await calendar.events.list({
              calendarId: calId,
              timeMin,
              timeMax,
              singleEvents: true,
              orderBy: "startTime",
              maxResults: 2500,
              pageToken,
            });
            for (const event of response.data.items || []) {
              if (event.id && !allEvents.has(event.id)) {
                allEvents.set(event.id, mapCalendarEvent(event));
              }
            }
            pageToken = response.data.nextPageToken ?? undefined;
          } while (pageToken);
        } catch {
          // Skip calendars that fail
        }
      })
    );

    return Array.from(allEvents.values()).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  } catch (error) {
    console.error("[Google Calendar] Failed to fetch team events:", error);
    return [];
  }
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

  const encryptedAccess = encrypt(tokens.access_token);
  const encryptedRefresh = encrypt(tokens.refresh_token);

  await db
    .insert(googleTokens)
    .values({
      userId,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiryDate: tokens.expiry_date || 0,
    })
    .onConflictDoUpdate({
      target: googleTokens.userId,
      set: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiryDate: tokens.expiry_date || 0,
        updatedAt: new Date(),
      },
    });
}

export async function disconnectGoogleCalendar(userId: string) {
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId));
}

// ── Drive token helpers ────────────────────────────────────────────────────────

export async function saveDriveTokens(
  userId: string,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }
) {
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Missing access_token or refresh_token");
  }

  await db
    .insert(driveTokens)
    .values({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date || 0,
    })
    .onConflictDoUpdate({
      target: driveTokens.userId,
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date || 0,
        updatedAt: new Date(),
      },
    });
}

export async function getAuthedDriveClient(userId: string) {
  const [token] = await db
    .select()
    .from(driveTokens)
    .where(eq(driveTokens.userId, userId));

  if (!token) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate,
  });

  oauth2Client.on("tokens", async (newTokens) => {
    await db
      .update(driveTokens)
      .set({
        accessToken: newTokens.access_token || token.accessToken,
        refreshToken: newTokens.refresh_token || token.refreshToken,
        expiryDate: newTokens.expiry_date || token.expiryDate,
        updatedAt: new Date(),
      })
      .where(eq(driveTokens.userId, userId));
  });

  return oauth2Client;
}

export async function isDriveConnected(userId: string): Promise<boolean> {
  const [token] = await db
    .select({ id: driveTokens.id })
    .from(driveTokens)
    .where(eq(driveTokens.userId, userId));
  return !!token;
}

export async function disconnectDrive(userId: string) {
  await db.delete(driveTokens).where(eq(driveTokens.userId, userId));
}
