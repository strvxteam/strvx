import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  db,
  companies,
  contacts,
  crmHygieneFlags,
  emailThreads,
  engagements,
  followUpWatchers,
} from "@strvx/db";

export type WatcherKind =
  | "stale_thread"
  | "stale_pipeline"
  | "no_show"
  | "post_meeting_followup";

export type FollowUpWatcherRow = {
  id: string;
  kind: WatcherKind;
  status: "pending" | "fired" | "cancelled" | "suppressed";
  triggerAfter: Date;
  firedAt: Date | null;
  threadId: string | null;
  threadSubject: string | null;
  engagementId: string | null;
  engagementName: string | null;
  calendarEventId: string | null;
  createdAt: Date;
};

export type HygieneFlagRow = {
  id: string;
  kind:
    | "domain_mismatch"
    | "stale_engagement"
    | "duplicate_company"
    | "stage_advancement_suggested";
  entityKind: string;
  entityId: string;
  relatedEntityId: string | null;
  status: "open" | "dismissed" | "resolved";
  details: unknown;
  createdAt: Date;
  /** Resolved entity name for display: engagement name, company name, or contact name. */
  entityLabel: string | null;
  /** For stage-advancement suggestions, the thread that triggered the flag. */
  relatedThreadSubject: string | null;
};

/**
 * Open watchers (pending or fired but not actioned). Joined to thread +
 * engagement to surface labels in the UI.
 */
export async function loadOpenWatchers(): Promise<FollowUpWatcherRow[]> {
  const rows = await db
    .select({
      id: followUpWatchers.id,
      kind: followUpWatchers.kind,
      status: followUpWatchers.status,
      triggerAfter: followUpWatchers.triggerAfter,
      firedAt: followUpWatchers.firedAt,
      threadId: followUpWatchers.threadId,
      threadSubject: emailThreads.subject,
      engagementId: followUpWatchers.engagementId,
      engagementName: engagements.name,
      calendarEventId: followUpWatchers.calendarEventId,
      createdAt: followUpWatchers.createdAt,
    })
    .from(followUpWatchers)
    .leftJoin(emailThreads, eq(emailThreads.id, followUpWatchers.threadId))
    .leftJoin(engagements, eq(engagements.id, followUpWatchers.engagementId))
    .where(inArray(followUpWatchers.status, ["pending", "fired"]))
    .orderBy(desc(followUpWatchers.createdAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as WatcherKind,
    status: r.status as FollowUpWatcherRow["status"],
    triggerAfter: r.triggerAfter,
    firedAt: r.firedAt,
    threadId: r.threadId,
    threadSubject: r.threadSubject,
    engagementId: r.engagementId,
    engagementName: r.engagementName,
    calendarEventId: r.calendarEventId,
    createdAt: r.createdAt,
  }));
}

/**
 * Open hygiene flags excluding stage-advancement suggestions (those live in a
 * separate section). Resolves a label for the flagged entity.
 */
export async function loadOpenHygieneFlags(): Promise<HygieneFlagRow[]> {
  const rows = await db
    .select({
      id: crmHygieneFlags.id,
      kind: crmHygieneFlags.kind,
      entityKind: crmHygieneFlags.entityKind,
      entityId: crmHygieneFlags.entityId,
      relatedEntityId: crmHygieneFlags.relatedEntityId,
      status: crmHygieneFlags.status,
      details: crmHygieneFlags.details,
      createdAt: crmHygieneFlags.createdAt,
    })
    .from(crmHygieneFlags)
    .where(
      and(
        eq(crmHygieneFlags.status, "open"),
        ne(crmHygieneFlags.kind, "stage_advancement_suggested")
      )
    )
    .orderBy(desc(crmHygieneFlags.createdAt))
    .limit(200);

  return enrichHygieneRows(rows);
}

/**
 * Open stage-advancement suggestions joined to engagement + the thread that
 * triggered them (related_entity_id points at email_threads.id).
 */
export async function loadStageAdvancementSuggestions(): Promise<
  HygieneFlagRow[]
> {
  const rows = await db
    .select({
      id: crmHygieneFlags.id,
      kind: crmHygieneFlags.kind,
      entityKind: crmHygieneFlags.entityKind,
      entityId: crmHygieneFlags.entityId,
      relatedEntityId: crmHygieneFlags.relatedEntityId,
      status: crmHygieneFlags.status,
      details: crmHygieneFlags.details,
      createdAt: crmHygieneFlags.createdAt,
    })
    .from(crmHygieneFlags)
    .where(
      and(
        eq(crmHygieneFlags.status, "open"),
        eq(crmHygieneFlags.kind, "stage_advancement_suggested")
      )
    )
    .orderBy(desc(crmHygieneFlags.createdAt))
    .limit(200);

  return enrichHygieneRows(rows);
}

/**
 * Batch-resolves entity labels and (for stage_advancement) the triggering
 * thread subject. Keeps the round trips bounded — one extra query per entity
 * kind we care about + one extra for thread subjects.
 */
async function enrichHygieneRows(
  rows: Array<{
    id: string;
    kind: HygieneFlagRow["kind"];
    entityKind: string;
    entityId: string;
    relatedEntityId: string | null;
    status: HygieneFlagRow["status"];
    details: unknown;
    createdAt: Date;
  }>
): Promise<HygieneFlagRow[]> {
  const engagementIds = new Set<string>();
  const companyIds = new Set<string>();
  const contactIds = new Set<string>();
  const threadIds = new Set<string>();

  for (const r of rows) {
    if (r.entityKind === "engagement") engagementIds.add(r.entityId);
    else if (r.entityKind === "company") companyIds.add(r.entityId);
    else if (r.entityKind === "contact") contactIds.add(r.entityId);
    if (
      r.kind === "stage_advancement_suggested" &&
      r.relatedEntityId
    ) {
      threadIds.add(r.relatedEntityId);
    }
  }

  const engagementMap = new Map<string, string>();
  if (engagementIds.size > 0) {
    const rs = await db
      .select({ id: engagements.id, name: engagements.name })
      .from(engagements)
      .where(inArray(engagements.id, Array.from(engagementIds)));
    for (const r of rs) engagementMap.set(r.id, r.name);
  }

  const companyMap = new Map<string, string>();
  if (companyIds.size > 0) {
    const rs = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(inArray(companies.id, Array.from(companyIds)));
    for (const r of rs) companyMap.set(r.id, r.name);
  }

  const contactMap = new Map<string, string>();
  if (contactIds.size > 0) {
    const rs = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(inArray(contacts.id, Array.from(contactIds)));
    for (const r of rs) contactMap.set(r.id, r.name);
  }

  const threadMap = new Map<string, string | null>();
  if (threadIds.size > 0) {
    const rs = await db
      .select({ id: emailThreads.id, subject: emailThreads.subject })
      .from(emailThreads)
      .where(inArray(emailThreads.id, Array.from(threadIds)));
    for (const r of rs) threadMap.set(r.id, r.subject ?? null);
  }

  return rows.map((r) => {
    let entityLabel: string | null = null;
    if (r.entityKind === "engagement") {
      entityLabel = engagementMap.get(r.entityId) ?? null;
    } else if (r.entityKind === "company") {
      entityLabel = companyMap.get(r.entityId) ?? null;
    } else if (r.entityKind === "contact") {
      entityLabel = contactMap.get(r.entityId) ?? null;
    }

    let relatedThreadSubject: string | null = null;
    if (
      r.kind === "stage_advancement_suggested" &&
      r.relatedEntityId
    ) {
      relatedThreadSubject = threadMap.get(r.relatedEntityId) ?? null;
    }

    return {
      id: r.id,
      kind: r.kind,
      entityKind: r.entityKind,
      entityId: r.entityId,
      relatedEntityId: r.relatedEntityId,
      status: r.status,
      details: r.details,
      createdAt: r.createdAt,
      entityLabel,
      relatedThreadSubject,
    };
  });
}

export function uniqueWatcherKinds(rows: FollowUpWatcherRow[]): WatcherKind[] {
  const set = new Set<WatcherKind>();
  for (const r of rows) set.add(r.kind);
  return Array.from(set).sort();
}

// Re-export sql so the page module can keep its imports tidy; nothing else
// in here uses it currently.
export { sql };
