import { asc, desc, eq } from "drizzle-orm";
import {
  db,
  agentAutonomyPolicy,
  agentContentRules,
  agentSettings,
  mailboxOauthTokens,
} from "@strvx/db";
import { DEFAULT_SCHEDULING_SETTINGS } from "@/lib/agent/tools/read/find-available-slots";
import { AutonomyPolicyForm } from "./_components/autonomy-policy-form";
import { SettingsForm } from "./_components/settings-form";
import { VoiceSamples } from "./_components/voice-samples";
import {
  fetchVoiceSampleCandidates,
  suggestVoiceSampleCandidates,
} from "./_voice-samples-queries";
import { fetchAutonomyStats } from "./_autonomy-stats-queries";

export const dynamic = "force-dynamic";

/**
 * Default policy used when the singleton row hasn't been seeded yet.
 * Matches the DB column defaults from the schema. Conservative defaults:
 * autonomy off + shadow on, highest gate thresholds.
 */
const POLICY_DEFAULTS = {
  repliesEnabled: false,
  shadowOnly: true,
  minConfidenceForAuto: "high" as const,
  maxRiskForAuto: "low" as const,
  minTrustForAuto: "trusted" as const,
  windowSeconds: 60,
  schedulingEnabled: false,
  schedulingWindowSeconds: 60,
  followUpsEnabled: true,
};

type SettingsSearchParams = Promise<{
  tab?: string;
  connected?: string;
  error?: string;
}>;

const VALID_TABS = new Set([
  "replies",
  "scheduling",
  "followups",
  "mailboxes",
]);

export default async function AgentSettingsPage({
  searchParams,
}: {
  searchParams: SettingsSearchParams;
}) {
  const params = await searchParams;
  const defaultTab = VALID_TABS.has(params.tab ?? "")
    ? (params.tab as "replies" | "scheduling" | "followups" | "mailboxes")
    : "replies";
  const mailboxConnected = params.connected ?? null;
  const mailboxError = params.error ?? null;

  // Autonomy policy + active content rules + live stats — fetched in
  // parallel below. The three stats queries land on `email_drafts` /
  // `scheduling_proposals` aggregates only (no per-row scans).
  const [policyRow, contentRules, autonomyStats] = await Promise.all([
    db
      .select({
        repliesEnabled: agentAutonomyPolicy.repliesEnabled,
        shadowOnly: agentAutonomyPolicy.shadowOnly,
        minConfidenceForAuto: agentAutonomyPolicy.minConfidenceForAuto,
        maxRiskForAuto: agentAutonomyPolicy.maxRiskForAuto,
        minTrustForAuto: agentAutonomyPolicy.minTrustForAuto,
        windowSeconds: agentAutonomyPolicy.windowSeconds,
        schedulingEnabled: agentAutonomyPolicy.schedulingEnabled,
        schedulingWindowSeconds: agentAutonomyPolicy.schedulingWindowSeconds,
        followUpsEnabled: agentAutonomyPolicy.followUpsEnabled,
      })
      .from(agentAutonomyPolicy)
      .where(eq(agentAutonomyPolicy.id, "global"))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        name: agentContentRules.name,
        kind: agentContentRules.kind,
        pattern: agentContentRules.pattern,
        description: agentContentRules.description,
        bumpsTo: agentContentRules.bumpsTo,
      })
      .from(agentContentRules)
      .where(eq(agentContentRules.isActive, true))
      .orderBy(asc(agentContentRules.name)),
    fetchAutonomyStats(),
  ]);

  const policyInitial = policyRow
    ? {
        repliesEnabled: policyRow.repliesEnabled,
        shadowOnly: policyRow.shadowOnly,
        minConfidenceForAuto: policyRow.minConfidenceForAuto,
        maxRiskForAuto: policyRow.maxRiskForAuto,
        minTrustForAuto: policyRow.minTrustForAuto,
        windowSeconds: policyRow.windowSeconds,
        schedulingEnabled: policyRow.schedulingEnabled,
        schedulingWindowSeconds: policyRow.schedulingWindowSeconds,
        followUpsEnabled: policyRow.followUpsEnabled,
      }
    : POLICY_DEFAULTS;
  const activeRuleNames = contentRules.map((r) => r.name);
  const activeRules = contentRules.map((r) => ({
    name: r.name,
    kind: r.kind,
    pattern: r.pattern,
    description: r.description,
    bumpsTo: r.bumpsTo,
  }));

  // All mailboxes (active + paused) for the Mailboxes tab. Per-mailbox
  // settings sections below still only iterate active ones.
  const allMailboxes = await db
    .select({
      id: mailboxOauthTokens.id,
      email: mailboxOauthTokens.email,
      displayName: mailboxOauthTokens.displayName,
      scopes: mailboxOauthTokens.scopes,
      isActive: mailboxOauthTokens.isActive,
      updatedAt: mailboxOauthTokens.updatedAt,
    })
    .from(mailboxOauthTokens)
    .orderBy(desc(mailboxOauthTokens.createdAt));
  const mailboxes = allMailboxes.filter((m) => m.isActive);

  // Load all existing settings rows in one round-trip.
  const settingsRows = await db
    .select({
      mailboxId: agentSettings.mailboxId,
      workingStartHour: agentSettings.workingStartHour,
      workingEndHour: agentSettings.workingEndHour,
      workingDays: agentSettings.workingDays,
      bufferMinutes: agentSettings.bufferMinutes,
      maxBackToBack: agentSettings.maxBackToBack,
      timezone: agentSettings.timezone,
    })
    .from(agentSettings);
  const byMailbox = new Map(settingsRows.map((r) => [r.mailboxId, r]));

  // Voice-sample candidates per mailbox, loaded in parallel.
  const voiceSamplesByMailbox = new Map<
    string,
    Awaited<ReturnType<typeof fetchVoiceSampleCandidates>>
  >();
  const suggestionsByMailbox = new Map<
    string,
    Awaited<ReturnType<typeof suggestVoiceSampleCandidates>>
  >();
  await Promise.all(
    mailboxes.map(async (mb) => {
      const [samples, suggestions] = await Promise.all([
        fetchVoiceSampleCandidates(mb.id),
        suggestVoiceSampleCandidates(db, mb.id, 5),
      ]);
      voiceSamplesByMailbox.set(mb.id, samples);
      suggestionsByMailbox.set(mb.id, suggestions);
    })
  );

  return (
    <div className="max-w-3xl px-8 py-10">
      <h1 className="text-[20px] font-semibold mb-2">Agent settings</h1>
      <p className="text-[13px] mb-8" style={{ color: "#888" }}>
        Per-mailbox scheduling preferences. Drives meeting slot suggestions and
        post-meeting follow-ups. Defaults: 09:00–17:00 PT, Mon–Fri, 15-min buffer,
        max 3 meetings/day.
      </p>

      {/* Org-wide autonomy policy. Phase A + B + C.1 redesign — live
          status header, preset cards, tabs per surface, plain-language
          threshold copy. */}
      <AutonomyPolicyForm
        initial={policyInitial}
        activeRuleCount={activeRuleNames.length}
        activeRuleNames={activeRuleNames}
        activeRules={activeRules}
        stats={autonomyStats}
        mailboxes={allMailboxes}
        defaultTab={defaultTab}
        mailboxConnected={mailboxConnected}
        mailboxError={mailboxError}
      />

      {mailboxes.length === 0 ? (
        <div
          className="rounded-md border px-6 py-10 text-center text-[13px]"
          style={{ borderColor: "#e0e0e0", color: "#666" }}
        >
          No active mailboxes. Connect one in the{" "}
          <a className="underline" href="/agent/settings?tab=mailboxes">
            Mailboxes tab
          </a>{" "}
          above.
        </div>
      ) : (
        mailboxes.map((mb) => {
          const row = byMailbox.get(mb.id);
          const initial = row
            ? {
                workingStartHour: row.workingStartHour,
                workingEndHour: row.workingEndHour,
                workingDays: row.workingDays,
                bufferMinutes: row.bufferMinutes,
                maxBackToBack: row.maxBackToBack,
                timezone: row.timezone,
              }
            : {
                workingStartHour: DEFAULT_SCHEDULING_SETTINGS.workingStartHour,
                workingEndHour: DEFAULT_SCHEDULING_SETTINGS.workingEndHour,
                workingDays: [...DEFAULT_SCHEDULING_SETTINGS.workingDays],
                bufferMinutes: DEFAULT_SCHEDULING_SETTINGS.bufferMinutes,
                maxBackToBack: DEFAULT_SCHEDULING_SETTINGS.maxBackToBack,
                timezone: DEFAULT_SCHEDULING_SETTINGS.timezone,
              };
          const samples = voiceSamplesByMailbox.get(mb.id) ?? [];
          const suggestions = suggestionsByMailbox.get(mb.id) ?? [];
          return (
            <div key={mb.id}>
              <SettingsForm
                mailboxId={mb.id}
                mailboxEmail={mb.email}
                initial={initial}
                hasRow={Boolean(row)}
              />
              <div className="mt-6 mb-8">
                <h2 className="text-[14px] font-semibold mb-3">
                  Voice samples — {mb.email}
                </h2>
                <VoiceSamples
                  mailboxEmail={mb.email}
                  samples={samples}
                  suggestions={suggestions}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
