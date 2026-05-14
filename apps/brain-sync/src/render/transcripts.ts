import { writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";

/**
 * Stage transcript .txt files in brain/.sources/transcripts/ so gbrain's
 * dream-cycle has source material to enrich from. We export two kinds:
 *
 *   - meetings/<YYYY-MM-DD>-<booking-id>.txt   — booking notes (when present)
 *   - emails/<YYYY-MM-DD>-<thread-id>.txt      — concatenated thread messages
 *
 * gbrain's synthesize phase reads `dream.synthesize.session_corpus_dir` and
 * `dream.synthesize.meeting_transcripts_dir`. We expose both with a single
 * root via the standard config keys in brain/.gbrain/config.json (set by
 * `gbrain config set` after the first sync).
 */

interface BookingRow {
  id: string;
  client_name: string | null;
  start_time: string | null;
  notes: string | null;
  notes_summary: string | null;
  service_type: string | null;
}

interface EmailMessageRow {
  thread_id: string;
  thread_subject: string | null;
  from_email: string | null;
  from_name: string | null;
  direction: string | null;
  sent_at: string | null;
  body_text: string | null;
  snippet: string | null;
}

export async function stageTranscripts(
  sql: postgres.Sql,
  brainDir: string,
): Promise<{ meetings: number; threads: number }> {
  const transcriptsRoot = join(brainDir, ".sources", "transcripts");
  const meetingsDir = join(transcriptsRoot, "meetings");
  const emailsDir = join(transcriptsRoot, "emails");
  await mkdir(meetingsDir, { recursive: true });
  await mkdir(emailsDir, { recursive: true });

  // Wipe + re-stage; transcripts are derived, never edited by hand.
  await wipeDir(meetingsDir);
  await wipeDir(emailsDir);

  const bookings = await sql<BookingRow[]>`
    SELECT id, client_name,
           start_time::text AS start_time,
           notes, notes_summary, service_type
    FROM public.bookings
    WHERE COALESCE(notes, notes_summary) IS NOT NULL
      AND length(trim(COALESCE(notes, notes_summary))) > 10
    ORDER BY start_time DESC NULLS LAST
  `;
  let meetingCount = 0;
  for (const b of bookings) {
    const date = (b.start_time ?? "").slice(0, 10) || "1970-01-01";
    const slug = `${date}-${b.id.slice(0, 8)}`;
    const lines: string[] = [];
    lines.push(`# Meeting transcript — ${b.service_type ?? "meeting"}`);
    if (b.client_name) lines.push(`Client: ${b.client_name}`);
    if (b.start_time) lines.push(`When: ${b.start_time}`);
    lines.push("");
    if (b.notes_summary) {
      lines.push("## Summary");
      lines.push(b.notes_summary.trim());
      lines.push("");
    }
    if (b.notes) {
      lines.push("## Notes");
      lines.push(b.notes.trim());
      lines.push("");
    }
    await writeFile(join(meetingsDir, `${slug}.txt`), lines.join("\n"));
    meetingCount++;
  }

  const messages = await sql<EmailMessageRow[]>`
    SELECT m.thread_id, t.subject AS thread_subject,
           m.from_email, m.from_name, m.direction::text AS direction,
           m.sent_at::text AS sent_at,
           m.body_text, m.snippet
    FROM public.email_messages m
    JOIN public.email_threads t ON t.id = m.thread_id
    WHERE t.archived_at IS NULL
      AND m.archived_at IS NULL
      AND COALESCE(m.body_text, m.snippet) IS NOT NULL
    ORDER BY m.thread_id, m.sent_at
  `;
  const byThread = new Map<string, EmailMessageRow[]>();
  for (const m of messages) {
    const arr = byThread.get(m.thread_id);
    if (arr) arr.push(m);
    else byThread.set(m.thread_id, [m]);
  }

  let threadCount = 0;
  for (const [threadId, msgs] of byThread) {
    if (msgs.length === 0) continue;
    const firstDate = (msgs[0].sent_at ?? "").slice(0, 10) || "1970-01-01";
    const slug = `${firstDate}-${threadId.slice(0, 8)}`;
    const subject = msgs[0].thread_subject ?? "(no subject)";
    const lines: string[] = [];
    lines.push(`# Email thread — ${subject}`);
    lines.push("");
    for (const m of msgs) {
      const dir = m.direction ? `[${m.direction}]` : "";
      const from = m.from_name
        ? `${m.from_name} <${m.from_email ?? ""}>`
        : m.from_email ?? "(unknown)";
      const when = (m.sent_at ?? "").trim();
      lines.push("---");
      lines.push(`${when}  ${dir}  from ${from}`);
      lines.push("");
      lines.push((m.body_text ?? m.snippet ?? "").trim());
      lines.push("");
    }
    await writeFile(join(emailsDir, `${slug}.txt`), lines.join("\n"));
    threadCount++;
  }

  return { meetings: meetingCount, threads: threadCount };
}

async function wipeDir(dir: string): Promise<void> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  for (const n of names) {
    if (!n.endsWith(".txt")) continue;
    await unlink(join(dir, n));
  }
}
