/**
 * Engagement-linkage backfill.
 *
 * Walks every email_threads row where engagement_id IS NULL and tries to
 * link it to an engagement based on the external participants on the
 * thread. Strategy (per external email):
 *
 *   1) contacts.email = <email> → contact_id → engagements where
 *      primary_contact_id = contact_id (most-recent first).
 *   2) Fallback: contact.company_id → engagements with that company_id
 *      (most-recent first).
 *
 * If exactly one engagement is found across all external participants,
 * we link the thread. If multiple distinct engagements are found, we log
 * "ambiguous" and skip. If none, we log "no match" and skip.
 *
 * Idempotent. Supports --dry-run.
 *
 * Run:
 *   pnpm agent:backfill-links            (writes)
 *   pnpm agent:backfill-links --dry-run  (read-only)
 */

import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { desc, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@strvx/db/schema";

const STRVX_DOMAIN_SUFFIX = "@strvx.com";

export type Participant = {
  email?: string;
  name?: string;
  role?: string;
};

type Candidate = { engagementId: string; via: "primary_contact" | "company" };

type EngagementRow = {
  id: string;
  primaryContactId: string | null;
  companyId: string;
  createdAt: Date;
};

type ContactRow = {
  id: string;
  email: string | null;
  companyId: string;
};

export type FindEngagementInput = {
  participants: Participant[];
  contactsByEmail: Map<string, ContactRow>;
  engagementsByPrimaryContactId: Map<string, EngagementRow[]>;
  engagementsByCompanyId: Map<string, EngagementRow[]>;
};

export type FindEngagementResult =
  | { kind: "match"; engagementId: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "no_match" };

function extractExternalEmails(participants: Participant[]): string[] {
  const out: string[] = [];
  for (const p of participants) {
    if (typeof p?.email !== "string") continue;
    const email = p.email.toLowerCase().trim();
    if (!email) continue;
    if (email.endsWith(STRVX_DOMAIN_SUFFIX)) continue;
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/**
 * Pure resolver — testable without a database. Returns a single
 * engagementId when there's exactly one match across all external
 * participants; otherwise reports ambiguity or no-match.
 */
export function findEngagementForParticipants(
  input: FindEngagementInput
): FindEngagementResult {
  const externalEmails = extractExternalEmails(input.participants);
  if (externalEmails.length === 0) return { kind: "no_match" };

  const directHits: Candidate[] = [];
  const fallbackHits: Candidate[] = [];

  for (const email of externalEmails) {
    const contact = input.contactsByEmail.get(email);
    if (!contact) continue;

    const primaryEngs =
      input.engagementsByPrimaryContactId.get(contact.id) ?? [];
    if (primaryEngs.length > 0) {
      directHits.push({
        engagementId: primaryEngs[0].id,
        via: "primary_contact",
      });
      continue;
    }
    const companyEngs = input.engagementsByCompanyId.get(contact.companyId) ?? [];
    if (companyEngs.length > 0) {
      fallbackHits.push({
        engagementId: companyEngs[0].id,
        via: "company",
      });
    }
  }

  const hits = directHits.length > 0 ? directHits : fallbackHits;
  if (hits.length === 0) return { kind: "no_match" };

  const distinctIds = Array.from(
    new Set(hits.map((h) => h.engagementId))
  );
  if (distinctIds.length === 1) {
    return { kind: "match", engagementId: distinctIds[0] };
  }
  return { kind: "ambiguous", candidates: distinctIds };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Create a .env.local or .env file.");
    process.exit(1);
  }

  const sqlClient = postgres(connectionString, { prepare: false });
  const db = drizzle(sqlClient, { schema });

  console.log(
    `Engagement-linkage backfill ${dryRun ? "(DRY RUN)" : "(WRITE MODE)"}\n`
  );

  const threads = await db
    .select({
      id: schema.emailThreads.id,
      participants: schema.emailThreads.participants,
    })
    .from(schema.emailThreads)
    .where(isNull(schema.emailThreads.engagementId));

  console.log(`Found ${threads.length} unlinked threads.\n`);

  if (threads.length === 0) {
    console.log("Linked 0 threads (0 ambiguous, 0 no match).");
    await sqlClient.end();
    return;
  }

  const allExternalEmails = new Set<string>();
  for (const t of threads) {
    const parts = Array.isArray(t.participants)
      ? (t.participants as Participant[])
      : [];
    for (const e of extractExternalEmails(parts)) {
      allExternalEmails.add(e);
    }
  }

  const contactsByEmail = new Map<string, ContactRow>();
  if (allExternalEmails.size > 0) {
    const contactRows = await db
      .select({
        id: schema.contacts.id,
        email: schema.contacts.email,
        companyId: schema.contacts.companyId,
      })
      .from(schema.contacts)
      .where(inArray(schema.contacts.email, Array.from(allExternalEmails)));
    for (const c of contactRows) {
      if (!c.email) continue;
      contactsByEmail.set(c.email.toLowerCase(), {
        id: c.id,
        email: c.email,
        companyId: c.companyId,
      });
    }
  }

  const contactIds = Array.from(contactsByEmail.values()).map((c) => c.id);
  const companyIds = Array.from(
    new Set(Array.from(contactsByEmail.values()).map((c) => c.companyId))
  );

  const engagementsByPrimaryContactId = new Map<string, EngagementRow[]>();
  const engagementsByCompanyId = new Map<string, EngagementRow[]>();

  if (contactIds.length > 0) {
    const rows = await db
      .select({
        id: schema.engagements.id,
        primaryContactId: schema.engagements.primaryContactId,
        companyId: schema.engagements.companyId,
        createdAt: schema.engagements.createdAt,
      })
      .from(schema.engagements)
      .where(inArray(schema.engagements.primaryContactId, contactIds))
      .orderBy(desc(schema.engagements.createdAt));
    for (const r of rows) {
      if (!r.primaryContactId) continue;
      const list = engagementsByPrimaryContactId.get(r.primaryContactId) ?? [];
      list.push(r as EngagementRow);
      engagementsByPrimaryContactId.set(r.primaryContactId, list);
    }
  }

  if (companyIds.length > 0) {
    const rows = await db
      .select({
        id: schema.engagements.id,
        primaryContactId: schema.engagements.primaryContactId,
        companyId: schema.engagements.companyId,
        createdAt: schema.engagements.createdAt,
      })
      .from(schema.engagements)
      .where(inArray(schema.engagements.companyId, companyIds))
      .orderBy(desc(schema.engagements.createdAt));
    for (const r of rows) {
      const list = engagementsByCompanyId.get(r.companyId) ?? [];
      list.push(r as EngagementRow);
      engagementsByCompanyId.set(r.companyId, list);
    }
  }

  let linked = 0;
  let ambiguous = 0;
  let noMatch = 0;

  for (const t of threads) {
    const parts = Array.isArray(t.participants)
      ? (t.participants as Participant[])
      : [];
    const result = findEngagementForParticipants({
      participants: parts,
      contactsByEmail,
      engagementsByPrimaryContactId,
      engagementsByCompanyId,
    });

    if (result.kind === "match") {
      if (dryRun) {
        console.log(
          `  [would link] thread ${t.id} → engagement ${result.engagementId}`
        );
      } else {
        await db
          .update(schema.emailThreads)
          .set({ engagementId: result.engagementId, updatedAt: new Date() })
          .where(eq(schema.emailThreads.id, t.id));
        console.log(
          `  [linked]     thread ${t.id} → engagement ${result.engagementId}`
        );
      }
      linked += 1;
    } else if (result.kind === "ambiguous") {
      ambiguous += 1;
      console.log(
        `  [ambiguous]  thread ${t.id} — candidates: ${result.candidates.join(", ")}`
      );
    } else {
      noMatch += 1;
      console.log(`  [no match]   thread ${t.id}`);
    }
  }

  console.log(
    `\nLinked ${linked} threads (${ambiguous} ambiguous, ${noMatch} no match).`
  );

  await sqlClient.end();
}

// Only auto-run when executed as a script, not when imported by tests.
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /backfill-engagement-links\.ts$/.test(process.argv[1]);

if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    });
}
