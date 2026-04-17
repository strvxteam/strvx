import { google } from "googleapis";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { gmailSyncState, contacts, engagements, companies, interactions, users } from "./db/schema";
import { getAuthedClient } from "./google-calendar";

// ── Types ─────────────────────────────────────────────

interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  date: Date;
  threadId: string;
}

// ── Core sync function ────────────────────────────────

export async function syncGmailForUser(userId: string): Promise<{ synced: number; errors: string[] }> {
  const authed = await getAuthedClient(userId);
  if (!authed) return { synced: 0, errors: ["Google Calendar not connected"] };

  const gmail = google.gmail({ version: "v1", auth: authed.oauth2Client });
  const errors: string[] = [];

  // Get sync state
  const [syncState] = await db
    .select()
    .from(gmailSyncState)
    .where(eq(gmailSyncState.userId, userId));

  // Fetch recent messages (last 7 days or since last sync)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const after = syncState?.lastSyncedAt
    ? Math.floor(new Date(syncState.lastSyncedAt).getTime() / 1000)
    : Math.floor(sevenDaysAgo.getTime() / 1000);

  const messages: EmailMessage[] = [];
  try {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: `after:${after}`,
      maxResults: 50,
    });

    const messageIds = (listRes.data.messages ?? []).map((m) => m.id!).filter(Boolean);

    // Fetch message details in batches
    const batchSize = 10;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const details = await Promise.all(
        batch.map(async (msgId) => {
          try {
            const res = await gmail.users.messages.get({
              userId: "me",
              id: msgId,
              format: "metadata",
              metadataHeaders: ["From", "To", "Subject", "Date"],
            });
            return res.data;
          } catch {
            return null;
          }
        })
      );

      for (const msg of details) {
        if (!msg) continue;
        const headers = msg.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

        const fromRaw = getHeader("From");
        const fromEmail = extractEmail(fromRaw);
        const toRaw = getHeader("To");
        const toEmails = toRaw.split(",").map((t) => extractEmail(t.trim())).filter(Boolean);

        messages.push({
          id: msg.id!,
          from: fromEmail,
          to: toEmails,
          subject: getHeader("Subject"),
          snippet: (msg.snippet ?? "").slice(0, 500),
          date: new Date(parseInt(msg.internalDate ?? "0")),
          threadId: msg.threadId ?? "",
        });
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch messages: ${err}`);
    return { synced: 0, errors };
  }

  if (messages.length === 0) {
    // Update sync timestamp even if no new messages
    await upsertSyncState(userId, syncState?.syncedMessageCount ?? 0);
    return { synced: 0, errors };
  }

  // Get all contact emails → engagement mapping
  const contactRows = await db
    .select({
      email: contacts.email,
      companyId: contacts.companyId,
    })
    .from(contacts);

  const engagementRows = await db
    .select({
      id: engagements.id,
      companyId: engagements.companyId,
    })
    .from(engagements)
    .where(sql`${engagements.archivedAt} IS NULL`);

  // Build email → engagementId map
  const emailToEngagement = new Map<string, string>();
  for (const contact of contactRows) {
    if (!contact.email) continue;
    const eng = engagementRows.find((e) => e.companyId === contact.companyId);
    if (eng) {
      emailToEngagement.set(contact.email.toLowerCase(), eng.id);
    }
  }

  // Get the current user for author_id
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!user) return { synced: 0, errors: ["User not found"] };

  // Check existing interaction content to avoid duplicates
  const existingInteractions = await db
    .select({ content: interactions.content })
    .from(interactions)
    .where(eq(interactions.authorId, userId));
  const existingSet = new Set(existingInteractions.map((i) => i.content));

  // Match emails to engagements and create interactions
  let synced = 0;
  for (const email of messages) {
    // Find matching engagement by checking from/to against known contacts
    const allAddresses = [email.from, ...email.to].map((a) => a.toLowerCase());
    let engagementId: string | null = null;
    for (const addr of allAddresses) {
      const match = emailToEngagement.get(addr);
      if (match) {
        engagementId = match;
        break;
      }
    }

    if (!engagementId) continue; // No matching contact found

    const content = `[Email] ${email.subject}: ${email.snippet}`;
    if (existingSet.has(content)) continue; // Already synced

    try {
      await db.insert(interactions).values({
        engagementId,
        authorId: userId,
        type: "note",
        content,
        createdAt: email.date,
      });
      existingSet.add(content);
      synced++;
    } catch (err) {
      errors.push(`Failed to create interaction for ${email.subject}: ${err}`);
    }
  }

  // Update sync state
  await upsertSyncState(userId, (syncState?.syncedMessageCount ?? 0) + synced);

  return { synced, errors };
}

// ── Helpers ───────────────────────────────────────────

function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

async function upsertSyncState(userId: string, messageCount: number) {
  await db
    .insert(gmailSyncState)
    .values({
      userId,
      lastSyncedAt: new Date(),
      syncedMessageCount: messageCount,
    })
    .onConflictDoUpdate({
      target: gmailSyncState.userId,
      set: {
        lastSyncedAt: new Date(),
        syncedMessageCount: messageCount,
      },
    });
}

export async function getGmailSyncStatus(userId: string) {
  const [state] = await db
    .select()
    .from(gmailSyncState)
    .where(eq(gmailSyncState.userId, userId));
  return state;
}
