import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { db as DbType } from "@strvx/db";
import {
  calendarEvents,
  emailDrafts,
  emailMessages,
  emailThreads,
  nextActions,
} from "@strvx/db";

/**
 * The set of typed inputs the brief LLM needs. Everything here is gathered via
 * plain SQL — no LLM calls — so it stays cheap and deterministic. The shape is
 * stable; the LLM consumes a JSON-serialized snapshot of this object.
 */
export type BriefInputs = {
  /** ISO calendar date (PT) the brief is for, e.g. "2026-05-11". */
  date: string;
  /** ISO timestamp the inputs were assembled at. */
  generatedAt: string;
  /** Unread inbound messages over the last 24h, grouped by agent category. */
  unreadByCategory: Array<{
    category: string;
    count: number;
    samples: Array<{
      threadId: string;
      subject: string | null;
      fromEmail: string;
      fromName: string | null;
      sentAt: string;
      snippet: string | null;
    }>;
  }>;
  /** Threads requiring a human response and no draft yet. */
  needsHumanThreads: Array<{
    threadId: string;
    subject: string | null;
    lastInboundAt: string | null;
    urgency: string | null;
    category: string | null;
  }>;
  /** Threads where we sent the last message > 3 days ago and they haven't replied. */
  staleThreads: Array<{
    threadId: string;
    subject: string | null;
    lastOutboundAt: string | null;
    daysSinceOutbound: number;
  }>;
  /** Calendar events for today (PT). meeting_prep_briefs is not joined yet — placeholder. */
  todayEvents: Array<{
    id: string;
    title: string;
    type: string;
    date: string;
    startHour: string;
    durationHours: string;
    client: string | null;
  }>;
  /** Calendar events for tomorrow (PT). */
  tomorrowEvents: Array<{
    id: string;
    title: string;
    type: string;
    date: string;
    startHour: string;
    durationHours: string;
    client: string | null;
  }>;
  /** Next-actions due before today and not completed. */
  overdueNextActions: Array<{
    id: string;
    description: string;
    priority: string;
    dueDate: string | null;
    engagementId: string;
  }>;
  /** Drafts still pending review. */
  draftsPendingReview: Array<{
    id: string;
    threadId: string;
    subject: string;
    toEmails: string[];
    confidence: string | null;
    createdAt: string;
  }>;
};

/**
 * Format a Date as YYYY-MM-DD in America/Los_Angeles, since the cron fires at a
 * UTC hour that maps to early-morning PT but the calendar "today" we care about
 * is the PT date — not the UTC date the server happens to be in.
 */
export function todayInPT(now: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA returns YYYY-MM-DD which is exactly what `date` columns want.
  return fmt.format(now);
}

/** Returns the PT date string `daysOffset` days from `now`. */
export function ptDateOffset(now: Date, daysOffset: number): string {
  const offset = new Date(now.getTime() + daysOffset * 24 * 3600 * 1000);
  return todayInPT(offset);
}

export type AssembleBriefInputsOpts = {
  db: typeof DbType;
  now: Date;
};

/**
 * Assemble the daily brief input snapshot from the database. Pure SQL; no LLM.
 */
export async function assembleBriefInputs(
  opts: AssembleBriefInputsOpts
): Promise<BriefInputs> {
  const { db, now } = opts;
  const last24h = new Date(now.getTime() - 24 * 3600 * 1000);
  const staleCutoff = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
  const today = todayInPT(now);
  const tomorrow = ptDateOffset(now, 1);

  // 1) Unread inbound last 24h grouped by category. Pull rows, group in JS so
  //    we can also include a small sample without a second query.
  const unreadRows = await db
    .select({
      threadId: emailMessages.threadId,
      subject: emailMessages.subject,
      fromEmail: emailMessages.fromEmail,
      fromName: emailMessages.fromName,
      sentAt: emailMessages.sentAt,
      snippet: emailMessages.snippet,
      category: emailThreads.agentCategory,
    })
    .from(emailMessages)
    .leftJoin(emailThreads, eq(emailThreads.id, emailMessages.threadId))
    .where(
      and(
        eq(emailMessages.direction, "inbound"),
        eq(emailMessages.isUnread, true),
        gte(emailMessages.sentAt, last24h)
      )
    )
    .orderBy(desc(emailMessages.sentAt));

  const groups = new Map<
    string,
    {
      count: number;
      samples: BriefInputs["unreadByCategory"][number]["samples"];
    }
  >();
  for (const r of unreadRows) {
    const key = r.category ?? "uncategorized";
    let group = groups.get(key);
    if (!group) {
      group = { count: 0, samples: [] };
      groups.set(key, group);
    }
    group.count += 1;
    if (group.samples.length < 5) {
      group.samples.push({
        threadId: r.threadId,
        subject: r.subject,
        fromEmail: r.fromEmail,
        fromName: r.fromName,
        sentAt: r.sentAt.toISOString(),
        snippet: r.snippet,
      });
    }
  }
  const unreadByCategory: BriefInputs["unreadByCategory"] = Array.from(
    groups.entries()
  ).map(([category, v]) => ({
    category,
    count: v.count,
    samples: v.samples,
  }));

  // 2) requires_human threads with no draft.
  //    LEFT JOIN drafts; filter where draft.id IS NULL.
  const needsHumanRows = await db
    .select({
      threadId: emailThreads.id,
      subject: emailThreads.subject,
      lastInboundAt: emailThreads.lastInboundAt,
      urgency: emailThreads.agentUrgency,
      category: emailThreads.agentCategory,
      draftId: emailDrafts.id,
    })
    .from(emailThreads)
    .leftJoin(
      emailDrafts,
      and(
        eq(emailDrafts.threadId, emailThreads.id),
        sql`${emailDrafts.status} IN ('pending_review', 'approved')`
      )
    )
    .where(
      and(
        eq(emailThreads.requiresHuman, true),
        isNull(emailThreads.archivedAt)
      )
    )
    .orderBy(desc(emailThreads.lastInboundAt));

  const needsHumanThreads: BriefInputs["needsHumanThreads"] = needsHumanRows
    .filter((r) => r.draftId === null)
    .map((r) => ({
      threadId: r.threadId,
      subject: r.subject,
      lastInboundAt: r.lastInboundAt ? r.lastInboundAt.toISOString() : null,
      urgency: r.urgency,
      category: r.category,
    }));

  // 3) Stale threads — we sent last and they haven't replied in > 3 days.
  const staleRows = await db
    .select({
      threadId: emailThreads.id,
      subject: emailThreads.subject,
      lastOutboundAt: emailThreads.lastOutboundAt,
      lastInboundAt: emailThreads.lastInboundAt,
    })
    .from(emailThreads)
    .where(
      and(
        isNull(emailThreads.archivedAt),
        lt(emailThreads.lastOutboundAt, staleCutoff),
        or(
          isNull(emailThreads.lastInboundAt),
          sql`${emailThreads.lastOutboundAt} > ${emailThreads.lastInboundAt}`
        )
      )
    )
    .orderBy(asc(emailThreads.lastOutboundAt));

  const staleThreads: BriefInputs["staleThreads"] = staleRows.map((r) => {
    const last = r.lastOutboundAt ? r.lastOutboundAt.getTime() : now.getTime();
    const days = Math.floor((now.getTime() - last) / (24 * 3600 * 1000));
    return {
      threadId: r.threadId,
      subject: r.subject,
      lastOutboundAt: r.lastOutboundAt ? r.lastOutboundAt.toISOString() : null,
      daysSinceOutbound: days,
    };
  });

  // 4) Calendar events for today and tomorrow (PT).
  const eventRows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      type: calendarEvents.type,
      date: calendarEvents.date,
      startHour: calendarEvents.startHour,
      durationHours: calendarEvents.durationHours,
      client: calendarEvents.client,
    })
    .from(calendarEvents)
    .where(
      or(
        eq(calendarEvents.date, today),
        eq(calendarEvents.date, tomorrow)
      )
    )
    .orderBy(asc(calendarEvents.date), asc(calendarEvents.startHour));

  const todayEvents = eventRows.filter((e) => e.date === today);
  const tomorrowEvents = eventRows.filter((e) => e.date === tomorrow);

  // 5) Overdue next_actions.
  const overdueRows = await db
    .select({
      id: nextActions.id,
      description: nextActions.description,
      priority: nextActions.priority,
      dueDate: nextActions.dueDate,
      engagementId: nextActions.engagementId,
    })
    .from(nextActions)
    .where(
      and(
        eq(nextActions.completed, false),
        isNull(nextActions.archivedAt),
        lt(nextActions.dueDate, today)
      )
    )
    .orderBy(asc(nextActions.dueDate));

  const overdueNextActions: BriefInputs["overdueNextActions"] = overdueRows.map(
    (r) => ({
      id: r.id,
      description: r.description,
      priority: r.priority,
      dueDate: r.dueDate,
      engagementId: r.engagementId,
    })
  );

  // 6) Drafts pending review.
  const draftRows = await db
    .select({
      id: emailDrafts.id,
      threadId: emailDrafts.threadId,
      subject: emailDrafts.subject,
      toEmails: emailDrafts.toEmails,
      confidence: emailDrafts.confidence,
      createdAt: emailDrafts.createdAt,
    })
    .from(emailDrafts)
    .where(eq(emailDrafts.status, "pending_review"))
    .orderBy(desc(emailDrafts.createdAt));

  const draftsPendingReview: BriefInputs["draftsPendingReview"] = draftRows.map(
    (r) => ({
      id: r.id,
      threadId: r.threadId,
      subject: r.subject,
      toEmails: r.toEmails,
      confidence: r.confidence,
      createdAt: r.createdAt.toISOString(),
    })
  );

  return {
    date: today,
    generatedAt: now.toISOString(),
    unreadByCategory,
    needsHumanThreads,
    staleThreads,
    todayEvents: todayEvents.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      date: e.date,
      startHour: e.startHour,
      durationHours: e.durationHours,
      client: e.client,
    })),
    tomorrowEvents: tomorrowEvents.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      date: e.date,
      startHour: e.startHour,
      durationHours: e.durationHours,
      client: e.client,
    })),
    overdueNextActions,
    draftsPendingReview,
  };
}
