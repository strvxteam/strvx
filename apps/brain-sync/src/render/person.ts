import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import { personSlug } from "../util/slug.ts";
import { renderPage, type TimelineEntry } from "../util/page.ts";

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  linkedin_url: string | null;
  company_id: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  is_active: boolean | null;
}

interface CompanyLookup {
  id: string;
  slug: string;
  name: string;
}

/**
 * Render every contact + team user as a markdown page under brain/people/.
 * Returns a map of source_id → slug so other renderers can build wikilinks.
 */
export async function renderPeople(
  sql: postgres.Sql,
  brainDir: string,
  companies: Map<string, CompanyLookup>,
): Promise<Map<string, string>> {
  const contacts = await sql<ContactRow[]>`
    SELECT id, name, email, phone, role, linkedin_url, company_id,
           created_at::text AS created_at
    FROM public.contacts
    WHERE archived_at IS NULL
    ORDER BY name
  `;
  const users = await sql<UserRow[]>`
    SELECT id, name, email, is_active
    FROM public.users
    ORDER BY name
  `;

  const slugByContactId = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const c of contacts) {
    const name = c.name?.trim() || "unknown";
    let slug = personSlug(name);
    if (usedSlugs.has(slug)) slug = `${slug}-${c.id.slice(0, 6)}`;
    usedSlugs.add(slug);
    slugByContactId.set(c.id, slug);

    const company = c.company_id ? companies.get(c.company_id) : undefined;

    const compiledLines: string[] = [`# ${name}`, ""];
    if (c.role || company) {
      const roleParts: string[] = [];
      if (c.role) roleParts.push(c.role);
      if (company) roleParts.push(`at [[companies/${company.slug}]]`);
      compiledLines.push(roleParts.join(" "));
      compiledLines.push("");
    }

    compiledLines.push("## State");
    if (c.email) compiledLines.push(`- Email: ${c.email}`);
    if (c.phone) compiledLines.push(`- Phone: ${c.phone}`);
    if (c.role) compiledLines.push(`- Role: ${c.role}`);
    if (c.linkedin_url) compiledLines.push(`- LinkedIn: ${c.linkedin_url}`);
    if (company) compiledLines.push(`- Company: [[companies/${company.slug}]]`);
    compiledLines.push("");

    const timeline: TimelineEntry[] = [];
    if (c.created_at) {
      timeline.push({
        date: c.created_at.slice(0, 10),
        kind: "added to CRM",
        body: `Imported from \`public.contacts\` (id ${c.id}).`,
      });
    }

    const page = renderPage({
      frontmatter: {
        slug: `people/${slug}`,
        type: "person",
        person_kind: "contact",
        source_id: c.id,
        source_table: "contacts",
        source_updated_at: c.updated_at ?? c.created_at,
        synced_at: new Date().toISOString(),
        name,
        email: c.email,
        role: c.role,
        company_slug: company?.slug,
      },
      compiled: compiledLines.join("\n"),
      timeline,
    });
    await writeFile(join(brainDir, "people", `${slug}.md`), page);
  }

  for (const u of users) {
    const name = u.name?.trim() || u.email?.split("@")[0] || "unknown";
    let slug = personSlug(name);
    if (usedSlugs.has(slug)) slug = `${slug}-team`;
    usedSlugs.add(slug);

    const compiled = [
      `# ${name}`,
      "",
      "_Strvx team member._",
      "",
      "## State",
      u.email ? `- Email: ${u.email}` : null,
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const page = renderPage({
      frontmatter: {
        slug: `people/${slug}`,
        type: "person",
        person_kind: "team",
        source_id: u.id,
        source_table: "users",
        synced_at: new Date().toISOString(),
        name,
        email: u.email,
      },
      compiled,
      timeline: [],
    });
    await writeFile(join(brainDir, "people", `${slug}.md`), page);
  }

  return slugByContactId;
}
