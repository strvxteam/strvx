/**
 * Read-only smoke test for the seeded agent demo state.
 *
 * Walks the happy path against the seeded DB. Does NOT call OpenAI or
 * Gmail. Verifies the query + business-logic layer renders the expected
 * shapes for the seeded data.
 *
 * Run with: pnpm agent:smoke   (loads env via Node --env-file)
 *
 * Pair with: pnpm agent:seed
 *
 * Exit code 0 on all PASS, 1 on any FAIL.
 *
 * NOTE: env vars MUST be in process.env before we import `@strvx/db`,
 * since that module evaluates DATABASE_URL on first import. The pnpm
 * script uses `tsx --env-file-if-exists=.env.local` to guarantee this.
 */

import { eq, sql } from "drizzle-orm";
import { db, emailDrafts, schedulingProposals, cosRuns } from "@strvx/db";
import {
  fetchThreadsForInbox,
  fetchThreadDetail,
  fetchPendingDraftsForThread,
  fetchPendingProposalsForThread,
} from "../src/app/(app)/agent-inbox/_queries";
import { assembleBriefInputs } from "../src/lib/agent/brief/inputs";
import {
  selectEventsNeedingBrief,
  type PrepEvent,
} from "../src/lib/agent/prep-brief/select-events";
import {
  computeAvailableSlots,
  type Busy,
} from "../src/lib/agent/tools/read/find-available-slots";
import { detectStageAdvancementSignal } from "../src/lib/agent/stage-advancement/detect";

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Use `pnpm agent:smoke` which loads .env.local via --env-file."
  );
  process.exit(1);
}

type Check = {
  name: string;
  pass: boolean;
  detail: string;
};

const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name} — ${detail}`);
}

/**
 * Aggregate cos_runs by kind. Local helper kept here so the smoke test
 * stays self-contained.
 */
async function aggregateCosRunsByKind(): Promise<
  Array<{ kind: string; count: number }>
> {
  const rows = await db
    .select({
      kind: cosRuns.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(cosRuns)
    .groupBy(cosRuns.kind);
  return rows.map((r) => ({ kind: r.kind as string, count: Number(r.count) }));
}

async function main(): Promise<void> {
  console.log("Running agent smoke checks against seeded DB...\n");

  // ── 1) fetchThreadsForInbox({filter: 'all', sort: 'recent'}) ─────
  const allThreads = await fetchThreadsForInbox({
    filter: "all",
    sort: "recent",
  });
  record(
    "fetchThreadsForInbox(all, recent) >= 7",
    allThreads.length >= 7,
    `got ${allThreads.length}`
  );

  // ── 2) unread ─────────────────────────────────────────
  const unreadThreads = await fetchThreadsForInbox({
    filter: "unread",
    sort: "recent",
  });
  record(
    "fetchThreadsForInbox(unread) >= 2",
    unreadThreads.length >= 2,
    `got ${unreadThreads.length}`
  );

  // ── 3) needs_you ──────────────────────────────────────
  const needsYouThreads = await fetchThreadsForInbox({
    filter: "needs_you",
    sort: "recent",
  });
  record(
    "fetchThreadsForInbox(needs_you) >= 2",
    needsYouThreads.length >= 2,
    `got ${needsYouThreads.length}`
  );

  // ── 4) drafted ────────────────────────────────────────
  const draftedThreads = await fetchThreadsForInbox({
    filter: "drafted",
    sort: "recent",
  });
  record(
    "fetchThreadsForInbox(drafted) >= 3",
    draftedThreads.length >= 3,
    `got ${draftedThreads.length}`
  );

  // ── 5) stale ──────────────────────────────────────────
  const staleThreads = await fetchThreadsForInbox({
    filter: "stale",
    sort: "recent",
  });
  record(
    "fetchThreadsForInbox(stale) >= 1",
    staleThreads.length >= 1,
    `got ${staleThreads.length}`
  );

  // ── 6) snoozed ────────────────────────────────────────
  const snoozedThreads = await fetchThreadsForInbox({
    filter: "snoozed",
    sort: "recent",
  });
  record(
    "fetchThreadsForInbox(snoozed) >= 1",
    snoozedThreads.length >= 1,
    `got ${snoozedThreads.length}`
  );

  // ── 7) fetchThreadDetail(<first thread id>) ───────────
  const firstThreadId = allThreads[0]?.id;
  if (!firstThreadId) {
    record(
      "fetchThreadDetail(<one thread>)",
      false,
      "no threads available to detail"
    );
  } else {
    const detail = await fetchThreadDetail(firstThreadId);
    const hasShape =
      !!detail &&
      !!detail.thread &&
      Array.isArray(detail.messages) &&
      detail.messages.length > 0;
    record(
      "fetchThreadDetail returns thread + messages + classification",
      hasShape && !!detail?.classification,
      hasShape
        ? `messages=${detail!.messages.length} classification=${detail!.classification ? "present" : "missing"}`
        : "missing thread or messages"
    );
  }

  // ── 8) fetchPendingDraftsForThread ────────────────────
  const [draftRow] = await db
    .select({ threadId: emailDrafts.threadId })
    .from(emailDrafts)
    .where(eq(emailDrafts.status, "pending_review"))
    .limit(1);
  if (!draftRow) {
    record("fetchPendingDraftsForThread >= 1", false, "no pending drafts found");
  } else {
    const drafts = await fetchPendingDraftsForThread(draftRow.threadId);
    record(
      "fetchPendingDraftsForThread(<thread w/ draft>) >= 1",
      drafts.length >= 1,
      `got ${drafts.length}`
    );
  }

  // ── 9) fetchPendingProposalsForThread ─────────────────
  const [proposalRow] = await db
    .select({ threadId: schedulingProposals.threadId })
    .from(schedulingProposals)
    .where(eq(schedulingProposals.status, "pending"))
    .limit(1);
  if (!proposalRow) {
    record(
      "fetchPendingProposalsForThread >= 1",
      false,
      "no pending proposals found"
    );
  } else {
    const proposals = await fetchPendingProposalsForThread(proposalRow.threadId);
    record(
      "fetchPendingProposalsForThread(<thread w/ proposal>) >= 1",
      proposals.length >= 1,
      `got ${proposals.length}`
    );
  }

  // ── 10) assembleBriefInputs shape sanity ──────────────
  const brief = await assembleBriefInputs({ db, now: new Date() });
  const briefShapeOk =
    typeof brief.date === "string" &&
    typeof brief.generatedAt === "string" &&
    Array.isArray(brief.unreadByCategory) &&
    Array.isArray(brief.needsHumanThreads) &&
    Array.isArray(brief.staleThreads) &&
    Array.isArray(brief.todayEvents) &&
    Array.isArray(brief.tomorrowEvents) &&
    Array.isArray(brief.overdueNextActions) &&
    Array.isArray(brief.draftsPendingReview);
  record(
    "assembleBriefInputs shape sanity",
    briefShapeOk,
    `date=${brief.date} needsHuman=${brief.needsHumanThreads.length} drafts=${brief.draftsPendingReview.length}`
  );

  // ── 11) selectEventsNeedingBrief with fake events ─────
  const fakeEvents: PrepEvent[] = [
    {
      id: "evt-with-external",
      summary: "External call",
      status: "confirmed",
      start: { dateTime: "2026-05-12T17:00:00Z" },
      end: { dateTime: "2026-05-12T18:00:00Z" },
      attendees: [
        { email: "us@strvx.com" },
        { email: "them@external.com" },
      ],
      description: null,
    },
    {
      id: "evt-internal-only",
      summary: "Internal sync",
      status: "confirmed",
      start: { dateTime: "2026-05-12T19:00:00Z" },
      end: { dateTime: "2026-05-12T19:30:00Z" },
      attendees: [
        { email: "us1@strvx.com" },
        { email: "us2@strvx.com" },
      ],
      description: null,
    },
    {
      id: "evt-cancelled",
      summary: "Cancelled",
      status: "cancelled",
      start: { dateTime: "2026-05-12T20:00:00Z" },
      end: { dateTime: "2026-05-12T21:00:00Z" },
      attendees: [
        { email: "us@strvx.com" },
        { email: "them2@external.com" },
      ],
      description: null,
    },
    {
      id: "evt-already-briefed",
      summary: "Already briefed",
      status: "confirmed",
      start: { dateTime: "2026-05-12T22:00:00Z" },
      end: { dateTime: "2026-05-12T23:00:00Z" },
      attendees: [
        { email: "us@strvx.com" },
        { email: "them3@external.com" },
      ],
      description: null,
    },
  ];
  const filtered = selectEventsNeedingBrief({
    events: fakeEvents,
    existingBriefIds: new Set(["evt-already-briefed"]),
    ourDomain: "strvx.com",
  });
  const filteredIds = filtered.map((e) => e.id ?? "");
  record(
    "selectEventsNeedingBrief filters internal/cancelled/already-briefed",
    filteredIds.length === 1 && filteredIds[0] === "evt-with-external",
    `got [${filteredIds.join(", ")}]`
  );

  // ── 12) computeAvailableSlots with empty busy ─────────
  const fixedNow = new Date("2026-05-11T12:00:00Z");
  const { slots } = computeAvailableSlots(
    [] as Busy[],
    { durationMinutes: 30, lookaheadDays: 10 },
    fixedNow
  );
  const distinctDays = new Set(slots.map((s) => s.start.slice(0, 10)));
  record(
    "computeAvailableSlots returns >=3 slots across >=3 days",
    slots.length >= 3 && distinctDays.size >= 3,
    `slots=${slots.length} distinctDays=${distinctDays.size}`
  );

  // ── 13) detectStageAdvancementSignal ──────────────────
  const stageResult = detectStageAdvancementSignal({
    classification: {
      category: "client_active",
      intent: "reply_needed",
      urgency: "urgent",
      requires_reply: true,
      reasoning: "Active client follow-up needing immediate response",
    },
    currentStage: "lead",
    threadId: "smoke-thread",
    engagementId: "smoke-engagement",
  });
  record(
    "detectStageAdvancementSignal(client_active + lead) shouldFlag",
    stageResult.shouldFlag === true && stageResult.suggestedStage === "contacted",
    `shouldFlag=${stageResult.shouldFlag} suggested=${stageResult.suggestedStage ?? "—"}`
  );

  // ── 14) aggregateCosRunsByKind ────────────────────────
  const byKind = await aggregateCosRunsByKind();
  const totalRuns = byKind.reduce((acc, r) => acc + r.count, 0);
  record(
    "aggregateCosRunsByKind total >= 8",
    totalRuns >= 8,
    `total=${totalRuns} (${byKind.map((r) => `${r.kind}:${r.count}`).join(", ")})`
  );

  // Summary
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  console.log("");
  console.log(`Summary: ${passed}/${checks.length} PASS, ${failed} FAIL`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke run errored:", err);
  process.exit(1);
});
