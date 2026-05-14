import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import { slugify } from "../util/slug.ts";
import { renderPage, type TimelineEntry } from "../util/page.ts";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  client: string | null;
  engagement_id: string | null;
  start_date: string | null;
  end_date: string | null;
  team: string[] | null;
  github_repo: string | null;
  created_at: string;
}

export async function renderProjects(
  sql: postgres.Sql,
  brainDir: string,
  dealSlugByEngagementId: Map<string, string>,
): Promise<Map<string, string>> {
  const projects = await sql<ProjectRow[]>`
    SELECT id, name, description, status, client, engagement_id,
           start_date::text AS start_date,
           end_date::text AS end_date,
           team, github_repo,
           created_at::text AS created_at
    FROM public.projects
    ORDER BY created_at DESC
  `;

  const slugByProject = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const p of projects) {
    const dealSlug = p.engagement_id
      ? dealSlugByEngagementId.get(p.engagement_id)
      : undefined;

    // Avoid `${dealSlug}-${dealSlug}-…` when project name echoes the deal.
    const nameSlug = slugify(p.name);
    let nameTail = nameSlug;
    if (dealSlug) {
      const head = `${dealSlug}-`;
      if (nameTail === dealSlug) nameTail = "";
      else if (nameTail.startsWith(head)) nameTail = nameTail.slice(head.length);
    }
    const base = dealSlug
      ? nameTail
        ? `${dealSlug}-${nameTail}`
        : dealSlug
      : nameSlug;
    let slug = base || `project-${p.id.slice(0, 6)}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${p.id.slice(0, 6)}`;
    usedSlugs.add(slug);
    slugByProject.set(p.id, slug);

    const compiled: string[] = [`# ${p.name}`, ""];
    if (p.description) {
      compiled.push(p.description);
      compiled.push("");
    }
    compiled.push("## State");
    if (p.status) compiled.push(`- Status: ${p.status}`);
    if (p.client) compiled.push(`- Client: ${p.client}`);
    if (dealSlug) compiled.push(`- Parent deal: [[deals/${dealSlug}]]`);
    if (p.start_date) compiled.push(`- Start: ${p.start_date}`);
    if (p.end_date) compiled.push(`- End: ${p.end_date}`);
    if (p.team && p.team.length > 0) compiled.push(`- Team: ${p.team.join(", ")}`);
    if (p.github_repo) compiled.push(`- Repo: ${p.github_repo}`);
    compiled.push("");

    const timeline: TimelineEntry[] = [
      {
        date: (p.start_date ?? p.created_at).slice(0, 10),
        kind: "project opened",
        body: dealSlug
          ? `Project under [[deals/${dealSlug}]].`
          : "Project opened.",
      },
    ];
    if (p.end_date) {
      timeline.push({
        date: p.end_date.slice(0, 10),
        kind: "project closed",
        body: "End date reached.",
      });
    }

    const page = renderPage({
      frontmatter: {
        slug: `projects/${slug}`,
        type: "project",
        source_id: p.id,
        source_table: "projects",
        source_updated_at: p.created_at,
        synced_at: new Date().toISOString(),
        name: p.name,
        status: p.status,
        deal_slug: dealSlug,
        github_repo: p.github_repo,
      },
      compiled: compiled.join("\n"),
      timeline,
    });
    await writeFile(join(brainDir, "projects", `${slug}.md`), page);
  }

  return slugByProject;
}
