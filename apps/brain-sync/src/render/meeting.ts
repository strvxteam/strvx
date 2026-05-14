import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import { slugify } from "../util/slug.ts";
import { renderPage, type TimelineEntry } from "../util/page.ts";

interface BookingRow {
  id: string;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  service_type: string | null;
  meeting_type: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  status: string | null;
  meet_link: string | null;
  notes: string | null;
  notes_summary: string | null;
  engagement_id: string | null;
  created_at: string;
}

interface BriefRow {
  engagement_id: string | null;
  content_markdown: string | null;
  generated_at: string | null;
}

export async function renderMeetings(
  sql: postgres.Sql,
  brainDir: string,
  dealSlugByEngagementId: Map<string, string>,
): Promise<Map<string, string>> {
  const bookings = await sql<BookingRow[]>`
    SELECT id, client_name, client_email, client_company,
           service_type, meeting_type,
           start_time::text AS start_time,
           end_time::text AS end_time,
           duration_minutes, status::text AS status,
           meet_link, notes, notes_summary,
           engagement_id,
           created_at::text AS created_at
    FROM public.bookings
    ORDER BY start_time DESC NULLS LAST
  `;
  const briefs = await sql<BriefRow[]>`
    SELECT engagement_id, content_markdown,
           generated_at::text AS generated_at
    FROM public.meeting_prep_briefs
    ORDER BY generated_at DESC
  `;

  // Index briefs by engagement so we can attach the most-recent brief to the
  // most-recent meeting for that engagement. Coarse but useful — until we have
  // a real booking_id FK on briefs, this is the best join we can do.
  const briefByEngagement = new Map<string, BriefRow>();
  for (const b of briefs) {
    if (!b.engagement_id) continue;
    if (!briefByEngagement.has(b.engagement_id)) {
      briefByEngagement.set(b.engagement_id, b);
    }
  }

  const slugByBooking = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const b of bookings) {
    const date = (b.start_time ?? b.created_at).slice(0, 10);
    const title =
      b.service_type ||
      b.meeting_type ||
      b.client_name ||
      "meeting";
    let slug = `${date}-${slugify(title)}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${b.id.slice(0, 6)}`;
    usedSlugs.add(slug);
    slugByBooking.set(b.id, slug);

    const dealSlug = b.engagement_id
      ? dealSlugByEngagementId.get(b.engagement_id)
      : undefined;
    const brief =
      b.engagement_id && briefByEngagement.get(b.engagement_id);

    const compiled: string[] = [
      `# ${title}`,
      "",
      b.client_name ? `Meeting with **${b.client_name}**${
        b.client_company ? ` from ${b.client_company}` : ""
      }.` : "",
      "",
      "## State",
      b.start_time ? `- Start: ${b.start_time}` : null,
      b.end_time ? `- End: ${b.end_time}` : null,
      b.duration_minutes ? `- Duration: ${b.duration_minutes} min` : null,
      b.meeting_type ? `- Type: ${b.meeting_type}` : null,
      b.service_type ? `- Service: ${b.service_type}` : null,
      b.status ? `- Status: ${b.status}` : null,
      b.meet_link ? `- Meet link: ${b.meet_link}` : null,
      b.client_email ? `- Attendee email: ${b.client_email}` : null,
      dealSlug ? `- Deal: [[deals/${dealSlug}]]` : null,
      "",
    ]
      .filter((s) => s !== null && s !== "")
      .join("\n");

    const timeline: TimelineEntry[] = [];
    if (b.start_time) {
      timeline.push({
        date: b.start_time.slice(0, 10),
        kind: "meeting scheduled",
        body: `${title}${b.client_name ? ` with ${b.client_name}` : ""}.`,
      });
    }
    if (b.notes_summary) {
      timeline.push({
        date: (b.start_time ?? b.created_at).slice(0, 10),
        kind: "meeting notes",
        body: b.notes_summary,
      });
    } else if (b.notes) {
      timeline.push({
        date: (b.start_time ?? b.created_at).slice(0, 10),
        kind: "meeting notes",
        body: b.notes.slice(0, 1000),
      });
    }

    const sections: string[] = [compiled];
    if (brief?.content_markdown) {
      sections.push("## Prep brief", "", brief.content_markdown.trim(), "");
    }

    const page = renderPage({
      frontmatter: {
        slug: `meetings/${slug}`,
        type: "meeting",
        source_id: b.id,
        source_table: "bookings",
        source_updated_at: b.start_time ?? b.created_at,
        synced_at: new Date().toISOString(),
        title,
        client_name: b.client_name,
        client_company: b.client_company,
        start_time: b.start_time,
        deal_slug: dealSlug,
      },
      compiled: sections.join("\n"),
      timeline,
    });
    await writeFile(join(brainDir, "meetings", `${slug}.md`), page);
  }

  return slugByBooking;
}
