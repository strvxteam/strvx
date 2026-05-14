import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import { slugify } from "../util/slug.ts";
import { renderPage, type TimelineEntry } from "../util/page.ts";
import type { CompanyLookup } from "./company.ts";

interface EngagementRow {
  id: string;
  company_id: string | null;
  primary_contact_id: string | null;
  name: string;
  stage: string | null;
  stage_entered_at: string | null;
  deal_value: string | null;
  expected_close_date: string | null;
  probability: string | null;
  source: string | null;
  maintenance_opted_in: boolean | null;
  maintenance_monthly_fee: string | null;
  tags: string[] | null;
  archived_at: string | null;
  created_at: string;
}

interface StageRow {
  engagement_id: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
}

interface InteractionRow {
  engagement_id: string;
  author_id: string | null;
  type: string;
  content: string | null;
  scheduled_at: string | null;
  created_at: string;
}

interface EmailThreadRow {
  id: string;
  engagement_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  subject: string | null;
  last_message_at: string | null;
  message_count: number | null;
  agent_urgency: string | null;
  agent_category: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  engagement_id: string | null;
  project_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

interface NextActionRow {
  engagement_id: string | null;
  description: string;
  priority: string | null;
  due_date: string | null;
  completed: boolean | null;
  completed_at: string | null;
  created_at: string;
}

/**
 * Render every engagement as a markdown deal page. The deal is the central
 * entity here: its timeline absorbs stage_history, interactions, email_threads,
 * completed tasks, and resolved next_actions. Open tasks + uncompleted
 * next_actions live above the line as Open Threads.
 */
export async function renderDeals(
  sql: postgres.Sql,
  brainDir: string,
  companies: Map<string, CompanyLookup>,
  peopleSlugByContactId: Map<string, string>,
): Promise<Map<string, string>> {
  const engagements = await sql<EngagementRow[]>`
    SELECT id, company_id, primary_contact_id, name,
           stage::text AS stage,
           stage_entered_at::text AS stage_entered_at,
           deal_value::text AS deal_value,
           expected_close_date::text AS expected_close_date,
           probability::text AS probability,
           source,
           maintenance_opted_in,
           maintenance_monthly_fee::text AS maintenance_monthly_fee,
           tags,
           archived_at::text AS archived_at,
           created_at::text AS created_at
    FROM public.engagements
    WHERE archived_at IS NULL
    ORDER BY created_at DESC
  `;
  const engagementIds = engagements.map((e) => e.id);
  if (engagementIds.length === 0) return new Map();

  // Load every supporting feed in parallel.
  const [stages, interactions, threads, tasks, nextActions] = await Promise.all([
    sql<StageRow[]>`
      SELECT engagement_id, stage::text AS stage,
             entered_at::text AS entered_at,
             exited_at::text AS exited_at
      FROM public.stage_history
      WHERE engagement_id = ANY(${engagementIds})
      ORDER BY entered_at
    `,
    sql<InteractionRow[]>`
      SELECT engagement_id, author_id, type::text AS type, content,
             scheduled_at::text AS scheduled_at,
             created_at::text AS created_at
      FROM public.interactions
      WHERE engagement_id = ANY(${engagementIds})
      ORDER BY created_at
    `,
    sql<EmailThreadRow[]>`
      SELECT id, engagement_id, contact_id, company_id, subject,
             last_message_at::text AS last_message_at,
             message_count,
             agent_urgency::text AS agent_urgency,
             agent_category::text AS agent_category
      FROM public.email_threads
      WHERE engagement_id = ANY(${engagementIds})
        AND archived_at IS NULL
      ORDER BY last_message_at DESC NULLS LAST
    `,
    sql<TaskRow[]>`
      SELECT id, title, status, priority, engagement_id, project_id,
             due_date::text AS due_date,
             completed_at::text AS completed_at,
             created_at::text AS created_at
      FROM public.tasks
      WHERE engagement_id = ANY(${engagementIds})
      ORDER BY created_at
    `,
    sql<NextActionRow[]>`
      SELECT engagement_id, description, priority::text AS priority,
             due_date::text AS due_date,
             completed,
             completed_at::text AS completed_at,
             created_at::text AS created_at
      FROM public.next_actions
      WHERE engagement_id = ANY(${engagementIds})
        AND archived_at IS NULL
      ORDER BY created_at
    `,
  ]);

  // Bucket feeds by engagement_id for O(1) lookup per page.
  const stagesByEng = bucket(stages, (s) => s.engagement_id);
  const interactionsByEng = bucket(interactions, (i) => i.engagement_id);
  const threadsByEng = bucket(threads, (t) => t.engagement_id ?? "");
  const tasksByEng = bucket(tasks, (t) => t.engagement_id ?? "");
  const nextActionsByEng = bucket(nextActions, (n) => n.engagement_id ?? "");

  const slugByEng = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const e of engagements) {
    const company = e.company_id ? companies.get(e.company_id) : undefined;
    const contactSlug = e.primary_contact_id
      ? peopleSlugByContactId.get(e.primary_contact_id)
      : undefined;

    // If the deal name already starts with the company name (e.g. "Acme Q4
    // platform" under company "Acme"), the company prefix would double up
    // in the slug. Strip the redundant prefix before composing.
    const dealNameSlug = slugify(e.name);
    let nameTail = dealNameSlug;
    if (company) {
      const head = `${company.slug}-`;
      if (nameTail === company.slug) nameTail = "";
      else if (nameTail.startsWith(head)) nameTail = nameTail.slice(head.length);
    }
    const baseSlug = company
      ? nameTail
        ? `${company.slug}-${nameTail}`
        : company.slug
      : dealNameSlug || `deal-${e.id.slice(0, 6)}`;
    let slug = baseSlug;
    if (usedSlugs.has(slug)) slug = `${slug}-${e.id.slice(0, 6)}`;
    usedSlugs.add(slug);
    slugByEng.set(e.id, slug);

    const open: string[] = [];
    for (const t of tasksByEng.get(e.id) ?? []) {
      if (t.completed_at) continue;
      if (t.status === "done" || t.status === "completed") continue;
      const bits = [`[ ] ${t.title}`];
      if (t.due_date) bits.push(`(due ${t.due_date.slice(0, 10)})`);
      if (t.priority) bits.push(`[${t.priority}]`);
      open.push(`- ${bits.join(" ")}`);
    }
    for (const n of nextActionsByEng.get(e.id) ?? []) {
      if (n.completed) continue;
      const bits = [`[ ] ${n.description}`];
      if (n.due_date) bits.push(`(due ${n.due_date.slice(0, 10)})`);
      if (n.priority) bits.push(`[${n.priority}]`);
      open.push(`- ${bits.join(" ")}`);
    }

    const compiled: string[] = [`# ${e.name}`, ""];
    const summaryBits: string[] = [];
    if (company) summaryBits.push(`Engagement with [[companies/${company.slug}]]`);
    if (contactSlug) summaryBits.push(`primary contact [[people/${contactSlug}]]`);
    if (e.stage) summaryBits.push(`currently in **${e.stage}**`);
    if (summaryBits.length > 0) {
      compiled.push(summaryBits.join(", ") + ".");
      compiled.push("");
    }

    compiled.push("## State");
    if (e.stage) compiled.push(`- Stage: ${e.stage}`);
    if (e.stage_entered_at) compiled.push(`- Stage entered: ${e.stage_entered_at.slice(0, 10)}`);
    if (e.deal_value) compiled.push(`- Deal value: $${e.deal_value}`);
    if (e.expected_close_date) compiled.push(`- Expected close: ${e.expected_close_date}`);
    if (e.probability) compiled.push(`- Probability: ${e.probability}`);
    if (e.source) compiled.push(`- Source: ${e.source}`);
    if (e.maintenance_opted_in)
      compiled.push(`- Maintenance: $${e.maintenance_monthly_fee ?? "0"} / month`);
    if (e.tags && e.tags.length > 0) compiled.push(`- Tags: ${e.tags.join(", ")}`);
    compiled.push("");

    if (open.length > 0) {
      compiled.push("## Open Threads");
      compiled.push(...open);
      compiled.push("");
    }

    const seeAlso: string[] = [];
    if (company) seeAlso.push(`- [[companies/${company.slug}]]`);
    if (contactSlug) seeAlso.push(`- [[people/${contactSlug}]]`);
    if (seeAlso.length > 0) {
      compiled.push("## See Also");
      compiled.push(...seeAlso);
      compiled.push("");
    }

    const timeline: TimelineEntry[] = [];
    timeline.push({
      date: e.created_at.slice(0, 10),
      kind: "deal opened",
      body: `[[deals/${slug}]] created in CRM.${
        company ? ` Counter-party: [[companies/${company.slug}]].` : ""
      }`,
    });
    for (const s of stagesByEng.get(e.id) ?? []) {
      timeline.push({
        date: s.entered_at.slice(0, 10),
        kind: "stage change",
        body: `Entered **${s.stage}**${
          s.exited_at ? ` (exited ${s.exited_at.slice(0, 10)})` : ""
        }.`,
      });
    }
    for (const i of interactionsByEng.get(e.id) ?? []) {
      const author = i.author_id ? `(author ${i.author_id.slice(0, 8)})` : "";
      timeline.push({
        date: (i.scheduled_at ?? i.created_at).slice(0, 10),
        kind: i.type ?? "interaction",
        body: `${i.content ? trim(i.content, 600) : "(no content)"} ${author}`.trim(),
      });
    }
    for (const t of threadsByEng.get(e.id) ?? []) {
      const subject = t.subject ?? "(no subject)";
      const date = (t.last_message_at ?? "").slice(0, 10) || e.created_at.slice(0, 10);
      const contactLink = t.contact_id
        ? peopleSlugByContactId.get(t.contact_id)
        : undefined;
      const companyLink = t.company_id ? companies.get(t.company_id) : undefined;
      const bits: string[] = [`**${subject}** — ${t.message_count ?? "?"} messages.`];
      if (contactLink) bits.push(`with [[people/${contactLink}]]`);
      if (companyLink) bits.push(`at [[companies/${companyLink.slug}]]`);
      if (t.agent_urgency) bits.push(`(urgency: ${t.agent_urgency})`);
      timeline.push({ date, kind: "email thread", body: bits.join(" ") });
    }
    for (const t of tasksByEng.get(e.id) ?? []) {
      if (!t.completed_at) continue;
      timeline.push({
        date: t.completed_at.slice(0, 10),
        kind: "task done",
        body: `~~${t.title}~~ completed.`,
      });
    }
    for (const n of nextActionsByEng.get(e.id) ?? []) {
      if (!n.completed_at) continue;
      timeline.push({
        date: n.completed_at.slice(0, 10),
        kind: "action done",
        body: `~~${n.description}~~ completed.`,
      });
    }

    const page = renderPage({
      frontmatter: {
        slug: `deals/${slug}`,
        type: "deal",
        source_id: e.id,
        source_table: "engagements",
        source_updated_at: e.stage_entered_at ?? e.created_at,
        synced_at: new Date().toISOString(),
        name: e.name,
        stage: e.stage,
        deal_value: e.deal_value ? Number(e.deal_value) : null,
        expected_close_date: e.expected_close_date,
        probability: e.probability ? Number(e.probability) : null,
        company_slug: company?.slug,
        primary_contact_slug: contactSlug,
      },
      compiled: compiled.join("\n"),
      timeline,
    });
    await writeFile(join(brainDir, "deals", `${slug}.md`), page);
  }

  return slugByEng;
}

function bucket<T, K extends string>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}

function trim(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trimEnd()}…`;
}
