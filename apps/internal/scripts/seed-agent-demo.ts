/**
 * Demo seed for the Chief-of-Staff agent.
 *
 * Populates a realistic agent state in the database WITHOUT requiring a real
 * Gmail mailbox to be connected. Re-runnable: it deletes the demo mailbox's
 * agent rows (and the three demo companies' engagements) before re-seeding.
 *
 * Run with: pnpm agent:seed   (or: pnpm tsx scripts/seed-agent-demo.ts)
 *
 * The mailbox row uses encrypted placeholder tokens — Gmail/Calendar API
 * calls against it will fail (intentionally). The DB-driven UI
 * (/agent-inbox, /agent/drafts, /agent/brief, /agent/follow-ups) renders
 * correctly.
 */

import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@strvx/db/schema";
import { encrypt, getEncryptionKey } from "../src/lib/agent/encryption";

const DEMO_MAILBOX_EMAIL = "demo-team@strvx.com";
const DEMO_COMPANY_NAMES = [
  "Acme Demo Inc",
  "Beta Test Co",
  "Gamma Trials LLC",
];
const DEMO_FROM_DOMAIN = "demo.strvx.com";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Create a .env.local or .env file.");
  process.exit(1);
}

const sqlClient = postgres(connectionString, { prepare: false });
const db = drizzle(sqlClient, { schema });

type InsertCounts = Record<string, number>;

function nowPlus(ms: number): Date {
  return new Date(Date.now() + ms);
}

function nowMinus(ms: number): Date {
  return new Date(Date.now() - ms);
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextWeekdayAt(daysFromNow: number, hourPT: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(hourPT + 7, 0, 0, 0);
  return d;
}

async function cleanupExistingDemoData(mailboxId: string | null): Promise<void> {
  await db
    .delete(schema.dailyBriefs)
    .where(eq(schema.dailyBriefs.date, todayDateString()));

  if (!mailboxId) {
    await cleanupDemoCompanies();
    return;
  }

  const demoThreads = await db
    .select({ id: schema.emailThreads.id })
    .from(schema.emailThreads)
    .where(eq(schema.emailThreads.mailboxId, mailboxId));
  const demoThreadIds = demoThreads.map((t) => t.id);

  const demoEngagements = await db
    .select({
      id: schema.engagements.id,
      companyId: schema.engagements.companyId,
    })
    .from(schema.engagements)
    .innerJoin(
      schema.companies,
      eq(schema.engagements.companyId, schema.companies.id)
    )
    .where(inArray(schema.companies.name, DEMO_COMPANY_NAMES));
  const demoEngagementIds = demoEngagements.map((e) => e.id);

  if (demoThreadIds.length > 0) {
    await db
      .delete(schema.followUpWatchers)
      .where(inArray(schema.followUpWatchers.threadId, demoThreadIds));
  }
  if (demoEngagementIds.length > 0) {
    await db
      .delete(schema.followUpWatchers)
      .where(inArray(schema.followUpWatchers.engagementId, demoEngagementIds));
  }

  const demoCompanyIdsForFlags = demoEngagements.map((e) => e.companyId);
  const flagEntityIds = [
    ...demoEngagementIds,
    ...demoCompanyIdsForFlags,
    ...demoThreadIds,
  ];
  if (flagEntityIds.length > 0) {
    await db
      .delete(schema.crmHygieneFlags)
      .where(inArray(schema.crmHygieneFlags.entityId, flagEntityIds));
  }

  if (demoEngagementIds.length > 0) {
    await db
      .delete(schema.nextActions)
      .where(
        and(
          inArray(schema.nextActions.engagementId, demoEngagementIds),
          eq(schema.nextActions.createdByAgent, true)
        )
      );
  }

  if (demoThreadIds.length > 0) {
    await db
      .delete(schema.agentClassifications)
      .where(inArray(schema.agentClassifications.threadId, demoThreadIds));
    await db
      .delete(schema.emailDrafts)
      .where(inArray(schema.emailDrafts.threadId, demoThreadIds));
    await db
      .delete(schema.schedulingProposals)
      .where(inArray(schema.schedulingProposals.threadId, demoThreadIds));
  }

  await db
    .delete(schema.meetingPrepBriefs)
    .where(
      inArray(schema.meetingPrepBriefs.calendarEventId, [
        "demo-event-1",
        "demo-event-2",
      ])
    );

  // cos_runs scoped to the demo mailbox.
  await db
    .delete(schema.cosRuns)
    .where(eq(schema.cosRuns.mailboxId, mailboxId));

  await db
    .delete(schema.mailboxOauthTokens)
    .where(eq(schema.mailboxOauthTokens.id, mailboxId));

  await cleanupDemoCompanies();
}

async function cleanupDemoCompanies(): Promise<void> {
  await db
    .delete(schema.companies)
    .where(inArray(schema.companies.name, DEMO_COMPANY_NAMES));
}

async function findStrvxUserId(): Promise<string | null> {
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(like(schema.users.email, "%@strvx.com"))
    .limit(1);
  return user?.id ?? null;
}

async function findExistingDemoMailboxId(): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.mailboxOauthTokens.id })
    .from(schema.mailboxOauthTokens)
    .where(eq(schema.mailboxOauthTokens.email, DEMO_MAILBOX_EMAIL))
    .limit(1);
  return row?.id ?? null;
}

async function main(): Promise<void> {
  console.log("Seeding demo agent state...\n");

  const counts: InsertCounts = {};
  const existingDemoMailboxId = await findExistingDemoMailboxId();
  await cleanupExistingDemoData(existingDemoMailboxId);

  // ── 1) Demo mailbox ─────────────────────────────────────
  const encryptionKey = getEncryptionKey();
  const userId = await findStrvxUserId();
  if (!userId) {
    throw new Error(
      "No @strvx.com user exists. Run `pnpm db:seed` first to bootstrap users."
    );
  }
  const [mailbox] = await db
    .insert(schema.mailboxOauthTokens)
    .values({
      email: DEMO_MAILBOX_EMAIL,
      displayName: "Demo Team",
      accessTokenEncrypted: encrypt("demo-placeholder-access", encryptionKey),
      refreshTokenEncrypted: encrypt("demo-placeholder-refresh", encryptionKey),
      expiryDate: Date.now() + 3600_000,
      scopes: [
        "gmail.modify",
        "gmail.send",
        "calendar.events",
        "calendar.readonly",
      ],
      isPrimary: false,
      isActive: true,
      connectedByUserId: userId,
    })
    .returning();
  counts["mailbox_oauth_tokens"] = 1;

  // ── 2) Companies + engagements ──────────────────────────
  const companyRows = await db
    .insert(schema.companies)
    .values(
      DEMO_COMPANY_NAMES.map((name, i) => ({
        name,
        industry: ["AI Consulting", "QA Tooling", "Analytics"][i] ?? "Other",
        website:
          i === 0
            ? "acmedemo.com"
            : i === 1
              ? "betatestco.io"
              : "gammatrials.co",
      }))
    )
    .returning();
  counts["companies"] = companyRows.length;

  const stagesForEng = ["lead", "discovery", "proposal"] as const;
  const engagementRows = await db
    .insert(schema.engagements)
    .values(
      companyRows.map((c, i) => ({
        companyId: c.id,
        name: `${c.name.replace(/ (Inc|Co|LLC)$/i, "")} Project`,
        stage: stagesForEng[i],
        dealValue: ["25000", "50000", "120000"][i],
        source: "demo-seed",
      }))
    )
    .returning();
  counts["engagements"] = engagementRows.length;

  // ── 3) Email threads (8) ────────────────────────────────
  type ThreadSeed = {
    label: string;
    engagementIdx: number;
    category:
      | "lead_inquiry"
      | "client_active"
      | "scheduling_request"
      | "client_followup";
    requiresHuman: boolean;
    agentState:
      | "pending"
      | "classified"
      | "planned"
      | "drafted"
      | "resolved"
      | "snoozed"
      | "archived";
    snoozedUntil?: Date | null;
    archivedAt?: Date | null;
    lastInboundOffsetMs?: number;
    lastOutboundOffsetMs?: number;
    subject: string;
    fromEmail: string;
    fromName: string;
    isUnread: boolean;
  };

  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;

  const threadSeeds: ThreadSeed[] = [
    {
      label: "lead1",
      engagementIdx: 0,
      category: "lead_inquiry",
      requiresHuman: false,
      agentState: "classified",
      subject: "Looking for AI consulting help",
      fromEmail: "founder@acmedemo.com",
      fromName: "Pat Acme",
      isUnread: true,
      lastInboundOffsetMs: -2 * hour,
    },
    {
      label: "lead2",
      engagementIdx: 0,
      category: "lead_inquiry",
      requiresHuman: false,
      agentState: "drafted",
      subject: "Intro from referral — quick chat?",
      fromEmail: "intro@acmedemo.com",
      fromName: "Sam Referral",
      isUnread: true,
      lastInboundOffsetMs: -6 * hour,
    },
    {
      label: "active1",
      engagementIdx: 1,
      category: "client_active",
      requiresHuman: true,
      agentState: "classified",
      subject: "Question about MVP scope",
      fromEmail: "pm@betatestco.io",
      fromName: "Beta PM",
      isUnread: false,
      lastInboundOffsetMs: -3 * hour,
      lastOutboundOffsetMs: -1 * day,
    },
    {
      label: "active2",
      engagementIdx: 1,
      category: "client_active",
      requiresHuman: true,
      agentState: "classified",
      subject: "Can you escalate this with engineering?",
      fromEmail: "ops@betatestco.io",
      fromName: "Beta Ops",
      isUnread: false,
      lastInboundOffsetMs: -4 * hour,
      lastOutboundOffsetMs: -2 * day,
    },
    {
      label: "schedule",
      engagementIdx: 1,
      category: "scheduling_request",
      requiresHuman: false,
      agentState: "planned",
      subject: "Find a time next week?",
      fromEmail: "scheduling@betatestco.io",
      fromName: "Beta Scheduler",
      isUnread: false,
      lastInboundOffsetMs: -5 * hour,
    },
    {
      label: "stale",
      engagementIdx: 2,
      category: "client_followup",
      requiresHuman: false,
      agentState: "resolved",
      subject: "Following up on the proposal",
      fromEmail: "vp@gammatrials.co",
      fromName: "Gamma VP",
      isUnread: false,
      lastInboundOffsetMs: -10 * day,
      lastOutboundOffsetMs: -5 * day,
    },
    {
      label: "snoozed",
      engagementIdx: 2,
      category: "client_active",
      requiresHuman: false,
      agentState: "snoozed",
      snoozedUntil: nowPlus(1 * hour),
      subject: "Snoozed — revisit later",
      fromEmail: "sometimes@gammatrials.co",
      fromName: "Gamma Sometimes",
      isUnread: false,
      lastInboundOffsetMs: -1 * day,
    },
    {
      label: "archived",
      engagementIdx: 2,
      category: "client_followup",
      requiresHuman: false,
      agentState: "archived",
      archivedAt: nowMinus(1 * day),
      subject: "Old archived thread",
      fromEmail: "history@gammatrials.co",
      fromName: "Gamma History",
      isUnread: false,
      lastInboundOffsetMs: -7 * day,
    },
  ];

  const threadInserts = threadSeeds.map((t, i) => {
    const lastInboundAt = t.lastInboundOffsetMs
      ? new Date(Date.now() + t.lastInboundOffsetMs)
      : null;
    const lastOutboundAt = t.lastOutboundOffsetMs
      ? new Date(Date.now() + t.lastOutboundOffsetMs)
      : null;
    const lastMessageAt =
      lastInboundAt && lastOutboundAt
        ? new Date(Math.max(lastInboundAt.getTime(), lastOutboundAt.getTime()))
        : (lastInboundAt ?? lastOutboundAt ?? new Date());
    return {
      mailboxId: mailbox.id,
      gmailThreadId: `demo-thread-${i + 1}`,
      subject: t.subject,
      participants: [
        { email: DEMO_MAILBOX_EMAIL, name: "Demo Team" },
        { email: t.fromEmail, name: t.fromName },
      ],
      messageCount: 2,
      lastMessageAt,
      lastInboundAt,
      lastOutboundAt,
      engagementId: engagementRows[t.engagementIdx].id,
      companyId: engagementRows[t.engagementIdx].companyId,
      agentState: t.agentState,
      agentCategory: t.category,
      agentUrgency: t.requiresHuman ? "urgent" : "normal",
      requiresHuman: t.requiresHuman,
      snoozedUntil: t.snoozedUntil ?? null,
      archivedAt: t.archivedAt ?? null,
    } as const;
  });
  const threadRows = await db
    .insert(schema.emailThreads)
    .values(threadInserts)
    .returning();
  counts["email_threads"] = threadRows.length;

  // ── 4) Email messages (~20) ─────────────────────────────
  type MessageInsert = typeof schema.emailMessages.$inferInsert;
  const messageRows: (typeof schema.emailMessages.$inferSelect)[] = [];
  let msgCounter = 0;
  for (let i = 0; i < threadRows.length; i++) {
    const thread = threadRows[i];
    const seed = threadSeeds[i];
    const messages: MessageInsert[] = [];
    const inboundAt = seed.lastInboundOffsetMs
      ? new Date(Date.now() + seed.lastInboundOffsetMs)
      : null;
    const outboundAt = seed.lastOutboundOffsetMs
      ? new Date(Date.now() + seed.lastOutboundOffsetMs)
      : null;

    if (inboundAt) {
      const earlier = new Date(inboundAt.getTime() - 1 * day);
      msgCounter += 1;
      messages.push({
        threadId: thread.id,
        mailboxId: mailbox.id,
        gmailMessageId: `demo-msg-${msgCounter}-${i + 1}`,
        messageIdHeader: `<msg-${msgCounter}-${i + 1}@${DEMO_FROM_DOMAIN}>`,
        fromEmail: seed.fromEmail,
        fromName: seed.fromName,
        toEmails: [DEMO_MAILBOX_EMAIL],
        ccEmails: [],
        bccEmails: [],
        subject: seed.subject,
        bodyText: `Hi team,\n\nThis is the first message in the ${seed.label} thread — a synthetic demo seed. Please ignore.\n\n— ${seed.fromName}`,
        bodyHtml: `<p>Hi team,</p><p>This is the first message in the ${seed.label} thread — a synthetic demo seed.</p><p>— ${seed.fromName}</p>`,
        snippet: `Hi team, this is the first message in the ${seed.label} thread...`,
        direction: "inbound",
        sentAt: earlier,
        labels: ["INBOX"],
        isUnread: false,
      });
    }
    if (outboundAt) {
      msgCounter += 1;
      messages.push({
        threadId: thread.id,
        mailboxId: mailbox.id,
        gmailMessageId: `demo-msg-${msgCounter}-${i + 1}`,
        messageIdHeader: `<msg-${msgCounter}-${i + 1}@${DEMO_FROM_DOMAIN}>`,
        fromEmail: DEMO_MAILBOX_EMAIL,
        fromName: "Demo Team",
        toEmails: [seed.fromEmail],
        ccEmails: [],
        bccEmails: [],
        subject: `Re: ${seed.subject}`,
        bodyText: `Thanks for reaching out, ${seed.fromName}! Replying shortly with details.`,
        bodyHtml: `<p>Thanks for reaching out, ${seed.fromName}!</p>`,
        snippet: `Thanks for reaching out, ${seed.fromName}! Replying shortly...`,
        direction: "outbound",
        sentAt: outboundAt,
        labels: ["SENT"],
        isUnread: false,
      });
    }
    if (inboundAt) {
      msgCounter += 1;
      messages.push({
        threadId: thread.id,
        mailboxId: mailbox.id,
        gmailMessageId: `demo-msg-${msgCounter}-${i + 1}`,
        messageIdHeader: `<msg-${msgCounter}-${i + 1}@${DEMO_FROM_DOMAIN}>`,
        fromEmail: seed.fromEmail,
        fromName: seed.fromName,
        toEmails: [DEMO_MAILBOX_EMAIL],
        ccEmails: [],
        bccEmails: [],
        subject: `Re: ${seed.subject}`,
        bodyText: `Following up — could you confirm next steps for ${seed.label}?`,
        bodyHtml: `<p>Following up — could you confirm next steps for ${seed.label}?</p>`,
        snippet: `Following up — could you confirm next steps for ${seed.label}?`,
        direction: "inbound",
        sentAt: inboundAt,
        labels: ["INBOX"],
        isUnread: seed.isUnread,
      });
    }
    if (messages.length === 0) {
      msgCounter += 1;
      messages.push({
        threadId: thread.id,
        mailboxId: mailbox.id,
        gmailMessageId: `demo-msg-${msgCounter}-${i + 1}`,
        messageIdHeader: `<msg-${msgCounter}-${i + 1}@${DEMO_FROM_DOMAIN}>`,
        fromEmail: seed.fromEmail,
        fromName: seed.fromName,
        toEmails: [DEMO_MAILBOX_EMAIL],
        ccEmails: [],
        bccEmails: [],
        subject: seed.subject,
        bodyText: `Synthetic seed message for ${seed.label}.`,
        bodyHtml: `<p>Synthetic seed message for ${seed.label}.</p>`,
        snippet: `Synthetic seed message for ${seed.label}.`,
        direction: "inbound",
        sentAt: thread.lastMessageAt,
        labels: ["INBOX"],
        isUnread: seed.isUnread,
      });
    }
    const inserted = await db
      .insert(schema.emailMessages)
      .values(messages)
      .returning();
    messageRows.push(...inserted);
  }
  counts["email_messages"] = messageRows.length;

  const latestInboundByThread = new Map<string, string>();
  for (const msg of messageRows) {
    if (msg.direction !== "inbound") continue;
    const existing = latestInboundByThread.get(msg.threadId);
    if (!existing) {
      latestInboundByThread.set(msg.threadId, msg.id);
      continue;
    }
    const existingMsg = messageRows.find((m) => m.id === existing);
    if (!existingMsg) {
      latestInboundByThread.set(msg.threadId, msg.id);
      continue;
    }
    if (msg.sentAt.getTime() > existingMsg.sentAt.getTime()) {
      latestInboundByThread.set(msg.threadId, msg.id);
    }
  }

  // ── 5) cos_runs (8 classify) ────────────────────────────
  const classifyRuns = await db
    .insert(schema.cosRuns)
    .values(
      threadRows.map((t, i) => {
        const inputTokens = 600 + i * 100;
        const outputTokens = 80 + i * 10;
        const cost = (
          inputTokens * 0.0000003 +
          outputTokens * 0.0000012
        ).toFixed(6);
        const startedAt = nowMinus(2 * hour + i * 60_000);
        return {
          kind: "classify" as const,
          status: "succeeded" as const,
          mailboxId: mailbox.id,
          threadId: t.id,
          messageId: latestInboundByThread.get(t.id) ?? null,
          model: "gpt-5-mini",
          inputTokens,
          outputTokens,
          costUsd: cost,
          startedAt,
          completedAt: new Date(startedAt.getTime() + 1200),
          durationMs: 1200,
        };
      })
    )
    .returning();
  counts["cos_runs.classify"] = classifyRuns.length;

  // ── 6) agent_classifications (8, one per thread) ────────
  const classificationValues = threadRows
    .map((t, i) => {
      const messageId = latestInboundByThread.get(t.id);
      if (!messageId) return null;
      const seed = threadSeeds[i];
      const intent: "reply_needed" | "schedule" | "proposal_review" | "fyi" =
        seed.category === "scheduling_request"
          ? "schedule"
          : seed.category === "client_followup"
            ? "fyi"
            : "reply_needed";
      return {
        messageId,
        threadId: t.id,
        cosRunId: classifyRuns[i].id,
        category: seed.category,
        urgency: seed.requiresHuman ? ("urgent" as const) : ("normal" as const),
        intent,
        requiresReply: seed.category !== "client_followup",
        suggestedWorkflow:
          seed.category === "scheduling_request"
            ? "propose_schedule"
            : seed.requiresHuman
              ? "escalate"
              : "draft_reply",
        relatedEngagementId: t.engagementId,
        relatedEngagementConfidence: "high" as const,
        reasoning: `Demo classification for ${seed.label}: ${seed.category} + ${intent}`,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  const classificationRows = await db
    .insert(schema.agentClassifications)
    .values(classificationValues)
    .returning();
  counts["agent_classifications"] = classificationRows.length;

  // ── 7) email_drafts (4) ─────────────────────────────────
  const draftTargets = [
    { threadIdx: 0, confidence: "high" as const },
    { threadIdx: 1, confidence: "high" as const },
    { threadIdx: 2, confidence: "medium" as const },
    { threadIdx: 4, confidence: "low" as const },
  ];

  const planRuns = await db
    .insert(schema.cosRuns)
    .values(
      draftTargets.map((target, i) => {
        const startedAt = nowMinus(1 * hour + i * 60_000);
        return {
          kind: "plan" as const,
          status: "succeeded" as const,
          mailboxId: mailbox.id,
          threadId: threadRows[target.threadIdx].id,
          model: "gpt-5",
          inputTokens: 1200,
          outputTokens: 250,
          costUsd: "0.004500",
          startedAt,
          completedAt: new Date(startedAt.getTime() + 2400),
          durationMs: 2400,
        };
      })
    )
    .returning();
  counts["cos_runs.plan"] = planRuns.length;

  const draftRows = await db
    .insert(schema.emailDrafts)
    .values(
      draftTargets.map((target, i) => {
        const thread = threadRows[target.threadIdx];
        const seed = threadSeeds[target.threadIdx];
        return {
          threadId: thread.id,
          mailboxId: mailbox.id,
          inReplyToMessageId: latestInboundByThread.get(thread.id) ?? null,
          cosRunId: planRuns[i].id,
          status: "pending_review" as const,
          toEmails: [seed.fromEmail],
          ccEmails: [],
          bccEmails: [],
          subject: `Re: ${seed.subject}`,
          bodyText:
            target.confidence === "low"
              ? `Hi ${seed.fromName},\n\n[Demo draft — low confidence] I'm not 100% sure I have the context to answer this yet. Could you share a bit more detail?\n\nThanks,\nDemo Team`
              : `Hi ${seed.fromName},\n\nThanks for reaching out! Happy to help with ${seed.label}. Here's a quick reply with the next step.\n\nBest,\nDemo Team`,
          bodyHtml: null,
          confidence: target.confidence,
          humanEdited: false,
        };
      })
    )
    .returning();
  counts["email_drafts"] = draftRows.length;

  // ── 8) scheduling_proposals (2) ─────────────────────────
  const proposalTargetIndexes = [4, 2];
  const schedulingProposalRows = await db
    .insert(schema.schedulingProposals)
    .values(
      proposalTargetIndexes.map((idx, i) => {
        const thread = threadRows[idx];
        const seed = threadSeeds[idx];
        const slots = [
          { start: nextWeekdayAt(1 + i, 10).toISOString(), end: nextWeekdayAt(1 + i, 11).toISOString() },
          { start: nextWeekdayAt(2 + i, 10).toISOString(), end: nextWeekdayAt(2 + i, 11).toISOString() },
          { start: nextWeekdayAt(3 + i, 10).toISOString(), end: nextWeekdayAt(3 + i, 11).toISOString() },
        ];
        return {
          threadId: thread.id,
          mailboxId: mailbox.id,
          engagementId: thread.engagementId,
          kind: "new_meeting" as const,
          durationMinutes: 60,
          meetingTitle: `Demo intro — ${seed.label}`,
          meetingDescription: `Auto-generated demo scheduling proposal for ${seed.label}.`,
          proposedSlots: slots,
          attendees: [seed.fromEmail, DEMO_MAILBOX_EMAIL],
          location: "Google Meet",
          status: "pending" as const,
        };
      })
    )
    .returning();
  counts["scheduling_proposals"] = schedulingProposalRows.length;

  // ── 9) daily_brief (today) ──────────────────────────────
  await db.insert(schema.dailyBriefs).values({
    date: todayDateString(),
    contentMarkdown: `# Daily Brief — ${todayDateString()}\n\n## Inbox\n- 2 new lead inquiries (Acme Demo)\n- 2 client_active threads requiring human attention (Beta)\n- 1 scheduling request (Beta) — proposal pending\n- 1 stale follow-up (Gamma) — sent 5 days ago, no reply\n\n## Drafts ready for review\n- 4 drafts pending — 2 high-confidence, 1 medium, 1 low\n\n## Today's calendar\n- Demo meeting 1 (10:00 PT)\n- Demo meeting 2 (14:00 PT)\n`,
  });
  counts["daily_briefs"] = 1;

  // ── 10) meeting_prep_briefs (2) ─────────────────────────
  const prepBriefRows = await db
    .insert(schema.meetingPrepBriefs)
    .values([
      {
        calendarEventId: "demo-event-1",
        engagementId: engagementRows[0].id,
        contentMarkdown: `# Prep — Acme Demo intro\n\n- Stage: lead\n- Last touch: ~6h ago via referral intro\n- Goal: qualify scope + timeline`,
      },
      {
        calendarEventId: "demo-event-2",
        engagementId: engagementRows[1].id,
        contentMarkdown: `# Prep — Beta MVP scope review\n\n- Stage: discovery\n- Open question: MVP boundaries\n- Bring: rough effort estimate`,
      },
    ])
    .returning();
  counts["meeting_prep_briefs"] = prepBriefRows.length;

  // ── 11) crm_hygiene_flags (4) ───────────────────────────
  const hygieneRows = await db
    .insert(schema.crmHygieneFlags)
    .values([
      {
        kind: "duplicate_company" as const,
        entityKind: "company",
        entityId: companyRows[0].id,
        relatedEntityId: companyRows[1].id,
        details: { reason: "Names share 'Demo' tokens — likely duplicate" },
      },
      {
        kind: "stale_engagement" as const,
        entityKind: "engagement",
        entityId: engagementRows[2].id,
        details: { lastActivityDays: 10, reason: "No inbound in 10+ days" },
      },
      {
        kind: "domain_mismatch" as const,
        entityKind: "engagement",
        entityId: engagementRows[1].id,
        details: {
          companyDomain: "betatestco.io",
          contactDomain: "beta-test.co",
          reason: "Contact email domain doesn't match company website",
        },
      },
      {
        kind: "stage_advancement_suggested" as const,
        entityKind: "engagement",
        entityId: engagementRows[0].id,
        details: {
          currentStage: "lead",
          suggestedStage: "contacted",
          signals: ["category=lead_inquiry+requires_reply=true"],
        },
      },
    ])
    .returning();
  counts["crm_hygiene_flags"] = hygieneRows.length;

  // ── 12) follow_up_watchers (3) ──────────────────────────
  const followUpRows = await db
    .insert(schema.followUpWatchers)
    .values([
      {
        kind: "stale_thread" as const,
        threadId: threadRows[5].id,
        engagementId: threadRows[5].engagementId,
        triggerAfter: nowPlus(6 * hour),
        status: "pending" as const,
        ruleConfig: { thresholdDays: 3 },
      },
      {
        kind: "post_meeting_followup" as const,
        engagementId: engagementRows[1].id,
        calendarEventId: "demo-event-2",
        triggerAfter: nowPlus(30 * 60 * 1000),
        status: "pending" as const,
        ruleConfig: { sendDraft: true },
      },
      {
        kind: "stale_pipeline" as const,
        engagementId: engagementRows[2].id,
        triggerAfter: nowMinus(2 * hour),
        firedAt: nowMinus(1 * hour),
        status: "fired" as const,
        ruleConfig: { thresholdDays: 14 },
      },
    ])
    .returning();
  counts["follow_up_watchers"] = followUpRows.length;

  // ── 13) next_actions (2, created_by_agent) ──────────────
  const nextActionRows = await db
    .insert(schema.nextActions)
    .values([
      {
        engagementId: engagementRows[1].id,
        ownerId: userId,
        description: "Send MVP scope doc to Beta PM (extracted from meeting)",
        priority: "high" as const,
        dueDate: dateString(2),
        createdByAgent: true,
      },
      {
        engagementId: engagementRows[2].id,
        ownerId: userId,
        description: "Re-engage Gamma VP with revised proposal",
        priority: "normal" as const,
        dueDate: dateString(5),
        createdByAgent: true,
      },
    ])
    .returning();
  counts["next_actions.created_by_agent"] = nextActionRows.length;

  // ── Summary ─────────────────────────────────────────────
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log("Demo seed complete.");
  console.log(`  Mailbox id: ${mailbox.id} (${DEMO_MAILBOX_EMAIL})`);
  console.log(`  Inserted ${totalRows} rows across the following tables:`);
  for (const [table, count] of Object.entries(counts)) {
    console.log(`    - ${table}: ${count}`);
  }
}

function dateString(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

main()
  .then(async () => {
    await sqlClient.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Demo seed failed:", err);
    await sqlClient.end();
    process.exit(1);
  });

// Silence unused-import warning for `sql` if not used directly above.
void sql;
