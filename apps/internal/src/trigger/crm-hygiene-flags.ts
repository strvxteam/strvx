import { and, eq, gte, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { schedules, logger } from "./client";
import {
  db as defaultDb,
  companies,
  contacts,
  crmHygieneFlags,
  engagements,
  interactions,
} from "@strvx/db";
import { reportTaskError } from "./_sentry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrmHygieneRunArgs = {
  db?: typeof defaultDb;
  now?: Date;
  /** Days without any interaction to flag an engagement as stale. Default 30. */
  staleEngagementDays?: number;
  /**
   * Hook for tests / future schema additions: return the websiteHost for
   * each companyId we should check. Defaults to an empty map.
   */
  websiteResolver?: (
    db: typeof defaultDb
  ) => Promise<Map<string, string>>;
};

export type CrmHygieneRunResult = {
  domainMismatchInserted: number;
  staleEngagementInserted: number;
  duplicateCompanyInserted: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pull the host out of a URL, falling back to a bare-string parse so that
 * "acme.com" / "www.acme.com" / "https://acme.com" / "http://www.acme.com/x"
 * all normalize to "acme.com". Returns null when there's nothing usable.
 */
export function normalizeWebsiteHost(website: string | null): string | null {
  if (!website) return null;
  let raw = website.trim().toLowerCase();
  if (!raw) return null;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    raw = "https://" + raw;
  }
  try {
    const url = new URL(raw);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Pull the domain out of an email address, lowercased. Returns null when
 * we can't find a real "@" segment.
 */
export function emailDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().replace(/^www\./, "");
}

/**
 * Load a `companyId -> normalized website host` map.
 *
 * Reads companies.website (added in migration 018) and runs each
 * non-empty value through `normalizeWebsiteHost` so the
 * domain_mismatch check works in terms of bare hosts (no scheme, no
 * leading www., no trailing slash). Companies with a missing /
 * un-parseable website are omitted from the map — the caller treats
 * absence as "skip" rather than "mismatch".
 *
 * Exposed for tests so they can inject pre-populated maps via the
 * `websiteResolver` hook.
 */
export async function loadWebsiteByCompany(
  db: typeof defaultDb
): Promise<Map<string, string>> {
  const rows = (await db
    .select({ id: companies.id, website: companies.website })
    .from(companies)
    .where(isNotNull(companies.website))) as Array<{
    id: string;
    website: string | null;
  }>;
  const out = new Map<string, string>();
  for (const row of rows) {
    const host = normalizeWebsiteHost(row.website);
    if (host) out.set(row.id, host);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Sweep CRM data quality. Three checks today:
 *
 *   1. domain_mismatch — contact email's domain doesn't match the company's
 *      website host.
 *   2. stale_engagement — an active engagement with no interactions in 30+
 *      days.
 *   3. duplicate_company — two companies with the same case-insensitive
 *      name. We flag the older one with `related_entity_id` = newer.
 *
 * stage_advancement_suggested is deferred (Task 4).
 *
 * All inserts are idempotent via the table's UNIQUE constraint
 * (kind, entity_kind, entity_id, related_entity_id) — ON CONFLICT DO NOTHING.
 */
export async function runCrmHygieneCron(
  args: CrmHygieneRunArgs = {}
): Promise<CrmHygieneRunResult> {
  const db = args.db ?? defaultDb;
  const now = args.now ?? new Date();
  const staleEngagementDays = args.staleEngagementDays ?? 30;
  const websiteResolver = args.websiteResolver ?? loadWebsiteByCompany;
  const staleCutoff = new Date(
    now.getTime() - staleEngagementDays * 24 * 60 * 60 * 1000
  );

  let domainMismatchInserted = 0;
  let staleEngagementInserted = 0;
  let duplicateCompanyInserted = 0;

  // ---- 1. Domain mismatch ------------------------------------------------
  // Spec: compare contact.email's domain to the company's website host.
  // Current `companies` schema has no website column, but we ship the
  // detection wiring through `websiteByCompany` so a single follow-up
  // migration adding a `website` column will make this fire — no code change
  // needed beyond pointing the map at the new column.
  const contactRows = (await db
    .select({
      contactId: contacts.id,
      email: contacts.email,
      companyId: contacts.companyId,
    })
    .from(contacts)
    .where(isNotNull(contacts.email))) as Array<{
    contactId: string;
    email: string | null;
    companyId: string;
  }>;

  const websiteByCompany = await websiteResolver(db);

  for (const c of contactRows) {
    const eDomain = emailDomain(c.email);
    const wHost = websiteByCompany.get(c.companyId) ?? null;
    if (!eDomain || !wHost) continue;
    if (eDomain === wHost) continue;
    const ins = await db
      .insert(crmHygieneFlags)
      .values({
        kind: "domain_mismatch",
        entityKind: "contact",
        entityId: c.contactId,
        relatedEntityId: c.companyId,
        status: "open",
        details: { email_domain: eDomain, company_host: wHost },
      })
      .onConflictDoNothing()
      .returning({ id: crmHygieneFlags.id });
    if (ins.length > 0) domainMismatchInserted++;
  }

  // ---- 2. Stale engagements ---------------------------------------------
  const activeEngagements = (await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(
      and(
        notInArray(engagements.stage, ["closed_won", "closed_lost"]),
        isNull(engagements.archivedAt)
      )
    )) as Array<{ id: string }>;

  for (const e of activeEngagements) {
    const [recent] = await db
      .select({ id: interactions.id })
      .from(interactions)
      .where(
        and(
          eq(interactions.engagementId, e.id),
          gte(interactions.createdAt, staleCutoff)
        )
      )
      .limit(1);
    if (recent) continue;
    const ins = await db
      .insert(crmHygieneFlags)
      .values({
        kind: "stale_engagement",
        entityKind: "engagement",
        entityId: e.id,
        relatedEntityId: null,
        status: "open",
        details: { days: staleEngagementDays },
      })
      .onConflictDoNothing()
      .returning({ id: crmHygieneFlags.id });
    if (ins.length > 0) staleEngagementInserted++;
  }

  // ---- 3. Duplicate companies -------------------------------------------
  // Group by lower(name) HAVING COUNT(*) > 1, then for each name pick
  // the oldest as the "primary" and flag it against the next-newest.
  const dupGroups = (await db.execute(
    sql`SELECT lower(name) AS k, json_agg(json_build_object('id', id, 'created_at', created_at) ORDER BY created_at ASC) AS rows
        FROM companies
        GROUP BY lower(name)
        HAVING count(*) > 1`
  )) as unknown as Array<{
    k: string;
    rows: Array<{ id: string; created_at: string }>;
  }>;

  for (const g of dupGroups) {
    const rows = g.rows;
    if (rows.length < 2) continue;
    const oldest = rows[0];
    const newer = rows[1];
    const ins = await db
      .insert(crmHygieneFlags)
      .values({
        kind: "duplicate_company",
        entityKind: "company",
        entityId: oldest.id,
        relatedEntityId: newer.id,
        status: "open",
        details: { match_key: g.k, total_in_group: rows.length },
      })
      .onConflictDoNothing()
      .returning({ id: crmHygieneFlags.id });
    if (ins.length > 0) duplicateCompanyInserted++;
  }

  return {
    domainMismatchInserted,
    staleEngagementInserted,
    duplicateCompanyInserted,
  };
}

// ---------------------------------------------------------------------------
// Trigger.dev cron schedule
// ---------------------------------------------------------------------------

/**
 * 15:30 UTC — a half-hour after follow_up.stale_pipeline so the two
 * daily hygiene jobs don't overlap. Daylight drift acceptable.
 */
export const crmHygieneFlagsCron = schedules.task({
  id: "crm.hygiene.flags",
  cron: "30 15 * * *",
  run: async () => {
    try {
      const result = await runCrmHygieneCron({});
      logger.info("crm.hygiene.flags tick", {
        domainMismatchInserted: result.domainMismatchInserted,
        staleEngagementInserted: result.staleEngagementInserted,
        duplicateCompanyInserted: result.duplicateCompanyInserted,
      });
      return result;
    } catch (err) {
      reportTaskError("crm.hygiene.flags", err);
      throw err;
    }
  },
});
