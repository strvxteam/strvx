import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { db } from "../src/lib/db";
import { users, followUpLinks, bookings } from "../src/lib/db/schema";
import { sql, desc } from "drizzle-orm";

if (!process.env.DATABASE_URL) { console.error("no db"); process.exit(1); }

async function main() {
  // 1. Confirm both users have DIFFERENT tokens now
  const members = await db.select({
    name: users.name,
    email: users.email,
    isActive: users.isActive,
    calendarId: users.calendarId,
    hasToken: sql<boolean>`(google_refresh_token IS NOT NULL)`,
    tokenPrefix: sql<string>`left(google_refresh_token, 20)`,
    tokenSuffix: sql<string>`right(google_refresh_token, 8)`,
  }).from(users).orderBy(users.name);

  console.log("\n=== TEAM MEMBERS & TOKENS ===");
  for (const m of members) {
    console.log(`${m.name} | active=${m.isActive} | hasToken=${m.hasToken} | token: ${m.tokenPrefix}...${m.tokenSuffix}`);
  }

  const tokensUnique = new Set(members.map(m => m.tokenPrefix + m.tokenSuffix)).size === members.length;
  console.log(`\nTokens are ${tokensUnique ? "✅ UNIQUE (each person has their own)" : "❌ IDENTICAL (still sharing the team token)"}`);

  // 2. List active follow-up links for testing
  const links = await db.select({
    id: followUpLinks.id,
    token: followUpLinks.token,
    meetingType: followUpLinks.meetingType,
    createdAt: followUpLinks.createdAt,
  }).from(followUpLinks).orderBy(desc(followUpLinks.createdAt)).limit(5);

  console.log("\n=== FOLLOW-UP LINKS (most recent 5) ===");
  for (const l of links) {
    console.log(`${l.meetingType} | token=${l.token} | created=${l.createdAt?.toISOString().split("T")[0]}`);
  }

  // 3. Recent bookings
  const recent = await db.select({
    clientName: bookings.clientName,
    startTime: bookings.startTime,
    status: bookings.status,
    serviceType: bookings.serviceType,
    createdAt: bookings.createdAt,
    googleEventIds: bookings.googleEventIds,
  }).from(bookings).orderBy(desc(bookings.createdAt)).limit(5);

  console.log("\n=== RECENT BOOKINGS ===");
  for (const b of recent) {
    console.log(`${b.clientName} | ${b.serviceType} | ${b.startTime?.toISOString()} | status=${b.status} | hasEvent=${!!b.googleEventIds}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
