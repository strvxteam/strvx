import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  isNotNull,
  sql,
  exists,
  type SQL,
} from "drizzle-orm";
import { google } from "googleapis";
import {
  db,
  emailThreads,
  emailMessages,
  emailDrafts,
  agentClassifications,
  engagements,
  companies,
  schedulingProposals,
  mailboxOauthTokens,
} from "@strvx/db";
import { getAuthedMailboxClient } from "@/lib/agent/mailbox-oauth";
import { markThreadRead } from "@/lib/agent/gmail/mark-read";

export type Filter =
  | "all"
  | "unread"
  | "needs_you"
  | "drafted"
  | "stale"
  | "snoozed"
  | "archived";
export type Sort = "priority" | "recent";

export async function fetchThreadsForInbox({
  filter,
  sort,
  mailboxId,
}: {
  filter: Filter;
  sort: Sort;
  mailboxId?: string;
}) {
  const conditions: SQL[] = [];

  if (filter === "archived") {
    conditions.push(isNotNull(emailThreads.archivedAt));
  } else {
    conditions.push(isNull(emailThreads.archivedAt));
  }

  if (mailboxId) {
    conditions.push(eq(emailThreads.mailboxId, mailboxId));
  }

  if (filter === "unread") {
    conditions.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(emailMessages)
          .where(
            and(
              eq(emailMessages.threadId, emailThreads.id),
              eq(emailMessages.isUnread, true)
            )
          )
      )
    );
  } else if (filter === "needs_you") {
    conditions.push(eq(emailThreads.requiresHuman, true));
  } else if (filter === "drafted") {
    conditions.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(emailDrafts)
          .where(
            and(
              eq(emailDrafts.threadId, emailThreads.id),
              sql`${emailDrafts.status} IN ('pending_review', 'approved')`
            )
          )
      )
    );
  } else if (filter === "stale") {
    conditions.push(
      sql`${emailThreads.lastOutboundAt} > ${emailThreads.lastInboundAt}`,
      sql`NOW() - ${emailThreads.lastOutboundAt} > INTERVAL '3 days'`,
      sql`${emailThreads.agentState} != 'snoozed'`
    );
  } else if (filter === "snoozed") {
    conditions.push(
      isNotNull(emailThreads.snoozedUntil),
      sql`${emailThreads.snoozedUntil} > NOW()`
    );
  }

  const orderByClauses =
    sort === "recent"
      ? [desc(emailThreads.lastMessageAt)]
      : [
          sql`CASE ${emailThreads.agentUrgency}
                WHEN 'urgent' THEN 3
                WHEN 'normal' THEN 2
                WHEN 'low' THEN 1
                ELSE 0
              END DESC`,
          desc(emailThreads.lastMessageAt),
        ];

  const rows = await db
    .select({
      id: emailThreads.id,
      subject: emailThreads.subject,
      participants: emailThreads.participants,
      lastMessageAt: emailThreads.lastMessageAt,
      lastInboundAt: emailThreads.lastInboundAt,
      lastOutboundAt: emailThreads.lastOutboundAt,
      agentUrgency: emailThreads.agentUrgency,
      agentCategory: emailThreads.agentCategory,
      agentState: emailThreads.agentState,
      requiresHuman: emailThreads.requiresHuman,
      engagementId: emailThreads.engagementId,
      messageCount: emailThreads.messageCount,
      snoozedUntil: emailThreads.snoozedUntil,
      labels: emailThreads.labels,
    })
    .from(emailThreads)
    .where(and(...conditions))
    .orderBy(...orderByClauses)
    .limit(200);

  return rows;
}

/**
 * Returns the top N most-frequent labels across all email_threads, used
 * to pre-populate the label menu's suggested chips. Excludes empty rows
 * via the GIN index from the schema migration.
 */
export async function fetchTopLabels(limit = 5): Promise<string[]> {
  const rows = await db.execute<{ label: string }>(
    sql`SELECT label
        FROM (
          SELECT unnest(labels) AS label
          FROM email_threads
          WHERE labels <> ARRAY[]::text[]
        ) AS expanded
        GROUP BY label
        ORDER BY count(*) DESC, label ASC
        LIMIT ${limit}`
  );
  return Array.from(rows as unknown as Array<{ label: string }>)
    .map((r) => r.label)
    .filter((l): l is string => typeof l === "string" && l.length > 0);
}

/**
 * Returns the labels currently set on a single thread. Used by the
 * label-menu portal in keyboard-shortcuts.tsx to seed its chip state
 * when the user opens the menu without a full server round-trip.
 */
export async function fetchThreadLabels(threadId: string): Promise<string[]> {
  const [row] = await db
    .select({ labels: emailThreads.labels })
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);
  return row?.labels ?? [];
}

export async function countByFilter(): Promise<{ all: number }> {
  const [{ count: allCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailThreads)
    .where(isNull(emailThreads.archivedAt));
  return { all: allCount };
}

export async function fetchThreadDetail(threadId: string) {
  const [thread] = await db
    .select({
      id: emailThreads.id,
      mailboxId: emailThreads.mailboxId,
      subject: emailThreads.subject,
      participants: emailThreads.participants,
      agentCategory: emailThreads.agentCategory,
      agentUrgency: emailThreads.agentUrgency,
      agentState: emailThreads.agentState,
      requiresHuman: emailThreads.requiresHuman,
      engagementId: emailThreads.engagementId,
      messageCount: emailThreads.messageCount,
      lastMessageAt: emailThreads.lastMessageAt,
    })
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);

  if (!thread) return null;

  const messages = await db
    .select({
      id: emailMessages.id,
      fromEmail: emailMessages.fromEmail,
      fromName: emailMessages.fromName,
      toEmails: emailMessages.toEmails,
      ccEmails: emailMessages.ccEmails,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
      bodyHtml: emailMessages.bodyHtml,
      snippet: emailMessages.snippet,
      direction: emailMessages.direction,
      sentAt: emailMessages.sentAt,
      isUnread: emailMessages.isUnread,
      hasAttachments: emailMessages.hasAttachments,
      labels: emailMessages.labels,
    })
    .from(emailMessages)
    .where(eq(emailMessages.threadId, threadId))
    .orderBy(emailMessages.sentAt);

  const [latestClassification] = await db
    .select({
      category: agentClassifications.category,
      urgency: agentClassifications.urgency,
      intent: agentClassifications.intent,
      requiresReply: agentClassifications.requiresReply,
      suggestedWorkflow: agentClassifications.suggestedWorkflow,
      reasoning: agentClassifications.reasoning,
      relatedEngagementId: agentClassifications.relatedEngagementId,
      relatedEngagementConfidence: agentClassifications.relatedEngagementConfidence,
      createdAt: agentClassifications.createdAt,
    })
    .from(agentClassifications)
    .where(eq(agentClassifications.threadId, threadId))
    .orderBy(desc(agentClassifications.createdAt))
    .limit(1);

  let engagementInfo: { id: string; name: string; companyName: string | null } | null = null;
  if (thread.engagementId) {
    const [eng] = await db
      .select({
        id: engagements.id,
        name: engagements.name,
        companyName: companies.name,
      })
      .from(engagements)
      .leftJoin(companies, eq(companies.id, engagements.companyId))
      .where(eq(engagements.id, thread.engagementId))
      .limit(1);
    if (eng) {
      engagementInfo = {
        id: eng.id,
        name: eng.name,
        companyName: eng.companyName ?? null,
      };
    }
  }

  return {
    thread,
    messages,
    classification: latestClassification ?? null,
    engagement: engagementInfo,
  };
}

export type PendingProposalSlot = { start: string; end: string };

export type PendingProposalRow = {
  id: string;
  threadId: string;
  mailboxId: string;
  kind: "new_meeting" | "reschedule" | "cancel";
  status: string;
  meetingTitle: string;
  meetingDescription: string | null;
  durationMinutes: number;
  proposedSlots: PendingProposalSlot[];
  attendees: string[];
  location: string;
  linkedDraftId: string | null;
  createdAt: Date;
};

/**
 * Returns pending scheduling proposals for a thread, plus the id of any
 * linked draft (the agent that proposed the schedule typically also wrote
 * the reply draft). The "Send & schedule" button uses linkedDraftId to know
 * which draft to approve+send alongside the calendar event creation.
 */
export async function fetchPendingProposalsForThread(
  threadId: string
): Promise<PendingProposalRow[]> {
  const rows = await db
    .select({
      id: schedulingProposals.id,
      threadId: schedulingProposals.threadId,
      mailboxId: schedulingProposals.mailboxId,
      kind: schedulingProposals.kind,
      status: schedulingProposals.status,
      meetingTitle: schedulingProposals.meetingTitle,
      meetingDescription: schedulingProposals.meetingDescription,
      durationMinutes: schedulingProposals.durationMinutes,
      proposedSlots: schedulingProposals.proposedSlots,
      attendees: schedulingProposals.attendees,
      location: schedulingProposals.location,
      createdAt: schedulingProposals.createdAt,
    })
    .from(schedulingProposals)
    .where(
      and(
        eq(schedulingProposals.threadId, threadId),
        eq(schedulingProposals.status, "pending")
      )
    )
    .orderBy(desc(schedulingProposals.createdAt));

  if (rows.length === 0) return [];

  const proposalIds = rows.map((r) => r.id);
  const draftLinks = await db
    .select({
      id: emailDrafts.id,
      schedulingProposalId: emailDrafts.schedulingProposalId,
    })
    .from(emailDrafts)
    .where(
      and(
        inArray(emailDrafts.schedulingProposalId, proposalIds),
        sql`${emailDrafts.status} IN ('pending_review', 'approved')`
      )
    );

  const draftByProposal = new Map<string, string>();
  for (const d of draftLinks) {
    if (d.schedulingProposalId) draftByProposal.set(d.schedulingProposalId, d.id);
  }

  return rows.map((r) => {
    const slots = Array.isArray(r.proposedSlots)
      ? (r.proposedSlots as PendingProposalSlot[])
      : [];
    const attendees = Array.isArray(r.attendees)
      ? (r.attendees as string[])
      : [];
    return {
      id: r.id,
      threadId: r.threadId,
      mailboxId: r.mailboxId,
      kind: r.kind,
      status: r.status,
      meetingTitle: r.meetingTitle,
      meetingDescription: r.meetingDescription,
      durationMinutes: r.durationMinutes,
      proposedSlots: slots,
      attendees,
      location: r.location,
      linkedDraftId: draftByProposal.get(r.id) ?? null,
      createdAt: r.createdAt,
    };
  });
}

export async function fetchPendingDraftsForThread(threadId: string) {
  const rows = await db
    .select({
      id: emailDrafts.id,
      mailboxId: emailDrafts.mailboxId,
      status: emailDrafts.status,
      toEmails: emailDrafts.toEmails,
      ccEmails: emailDrafts.ccEmails,
      bccEmails: emailDrafts.bccEmails,
      subject: emailDrafts.subject,
      bodyText: emailDrafts.bodyText,
      bodyHtml: emailDrafts.bodyHtml,
      reviewerNotes: emailDrafts.reviewerNotes,
      confidence: emailDrafts.confidence,
      humanEdited: emailDrafts.humanEdited,
      cosRunId: emailDrafts.cosRunId,
      createdAt: emailDrafts.createdAt,
    })
    .from(emailDrafts)
    .where(
      and(
        eq(emailDrafts.threadId, threadId),
        sql`${emailDrafts.status} IN ('pending_review', 'approved')`
      )
    )
    .orderBy(desc(emailDrafts.createdAt));
  return rows;
}

/**
 * Active mailboxes (is_active=true) for the mailbox-filter pill row.
 */
export async function fetchActiveMailboxes(): Promise<
  Array<{ id: string; email: string }>
> {
  const rows = await db
    .select({
      id: mailboxOauthTokens.id,
      email: mailboxOauthTokens.email,
    })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, true))
    .orderBy(mailboxOauthTokens.email);
  return rows;
}

/**
 * Server-side: mark a thread read by hitting Gmail + DB.
 * Best-effort — failures are logged, not surfaced.
 */
export async function markThreadReadServerSide(
  threadId: string,
  mailboxId: string
) {
  try {
    const { client } = await getAuthedMailboxClient(mailboxId);
    const gmail = google.gmail({ version: "v1", auth: client });
    await markThreadRead({ threadId, db, gmail });
  } catch (err) {
    console.error("[agent-inbox] markThreadRead failed", err);
  }
}
