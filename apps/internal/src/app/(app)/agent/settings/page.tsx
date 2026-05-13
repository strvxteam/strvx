import { desc, eq } from "drizzle-orm";
import { db, agentSettings, mailboxOauthTokens } from "@strvx/db";
import { DEFAULT_SCHEDULING_SETTINGS } from "@/lib/agent/tools/read/find-available-slots";
import { SettingsForm } from "./_components/settings-form";
import { VoiceSamples } from "./_components/voice-samples";
import {
  fetchVoiceSampleCandidates,
  suggestVoiceSampleCandidates,
} from "./_voice-samples-queries";

export const dynamic = "force-dynamic";

export default async function AgentSettingsPage() {
  const mailboxes = await db
    .select({
      id: mailboxOauthTokens.id,
      email: mailboxOauthTokens.email,
      displayName: mailboxOauthTokens.displayName,
      isActive: mailboxOauthTokens.isActive,
    })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, true))
    .orderBy(desc(mailboxOauthTokens.createdAt));

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

      {mailboxes.length === 0 ? (
        <div
          className="rounded-md border px-6 py-10 text-center text-[13px]"
          style={{ borderColor: "#e0e0e0", color: "#666" }}
        >
          No active mailboxes. Connect one at{" "}
          <a className="underline" href="/agent/connect-mailbox">
            /agent/connect-mailbox
          </a>
          .
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
