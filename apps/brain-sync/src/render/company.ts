import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import { companySlug } from "../util/slug.ts";
import { renderPage, type TimelineEntry } from "../util/page.ts";

interface CompanyRow {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  created_at: string;
}

interface PartnerRow {
  id: string;
  name: string;
  website: string | null;
  stage: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface CompanyLookup {
  id: string;
  slug: string;
  name: string;
  /** Discriminates between client companies and channel partners. */
  kind: "company" | "partner";
}

/**
 * Render every company + partner as a markdown page under brain/companies/.
 * Returns a map of source_id → CompanyLookup so other renderers can resolve
 * wikilinks without re-querying.
 */
export async function renderCompanies(
  sql: postgres.Sql,
  brainDir: string,
): Promise<Map<string, CompanyLookup>> {
  const companies = await sql<CompanyRow[]>`
    SELECT id, name, industry, website,
           created_at::text AS created_at
    FROM public.companies
    ORDER BY name
  `;
  const partners = await sql<PartnerRow[]>`
    SELECT id, name, website, stage::text AS stage, email, company, notes,
           archived_at::text AS archived_at,
           created_at::text AS created_at
    FROM public.partners
    WHERE archived_at IS NULL
    ORDER BY name
  `;

  const lookup = new Map<string, CompanyLookup>();
  const usedSlugs = new Set<string>();

  for (const c of companies) {
    let slug = companySlug(c.name);
    if (usedSlugs.has(slug)) slug = `${slug}-${c.id.slice(0, 6)}`;
    usedSlugs.add(slug);
    // Bookings without a matched company create rows whose name ends "(via
    // Booking)". Keep them in the lookup so wikilinks resolve, but flag
    // them so /kg/browse and listBrainByType can filter them out.
    const isPlaceholder = /\(via booking\)\s*$/i.test(c.name);
    lookup.set(c.id, { id: c.id, slug, name: c.name, kind: "company" });

    const compiled = [
      `# ${c.name}`,
      "",
      isPlaceholder
        ? "_Auto-created from a booking with no matched company row._"
        : c.industry
          ? `Operating in **${c.industry}**.`
          : "",
      "",
      "## State",
      c.industry ? `- Industry: ${c.industry}` : null,
      c.website ? `- Website: ${c.website}` : null,
      `- Source: \`public.companies\` (${c.id})`,
      "",
    ]
      .filter((s) => s !== null && s !== "")
      .join("\n");

    const timeline: TimelineEntry[] = [
      {
        date: c.created_at.slice(0, 10),
        kind: "added to CRM",
        body: `Imported from \`public.companies\` (id ${c.id}).`,
      },
    ];

    const page = renderPage({
      frontmatter: {
        slug: `companies/${slug}`,
        type: "company",
        company_kind: isPlaceholder ? "placeholder" : "client",
        source_id: c.id,
        source_table: "companies",
        source_updated_at: c.created_at,
        synced_at: new Date().toISOString(),
        name: c.name,
        industry: c.industry,
        website: c.website,
      },
      compiled,
      timeline,
    });
    await writeFile(join(brainDir, "companies", `${slug}.md`), page);
  }

  for (const p of partners) {
    let slug = companySlug(p.name);
    if (usedSlugs.has(slug)) slug = `${slug}-partner`;
    usedSlugs.add(slug);
    lookup.set(p.id, { id: p.id, slug, name: p.name, kind: "partner" });

    const compiled = [
      `# ${p.name}`,
      "",
      "_Channel partner._",
      "",
      "## State",
      p.stage ? `- Partnership stage: ${p.stage}` : null,
      p.company ? `- Company: ${p.company}` : null,
      p.website ? `- Website: ${p.website}` : null,
      p.email ? `- Email: ${p.email}` : null,
      p.notes ? `\n${p.notes}` : null,
      "",
    ]
      .filter((s) => s !== null && s !== "")
      .join("\n");

    const page = renderPage({
      frontmatter: {
        slug: `companies/${slug}`,
        type: "company",
        company_kind: "partner",
        source_id: p.id,
        source_table: "partners",
        synced_at: new Date().toISOString(),
        name: p.name,
        partnership_stage: p.stage,
      },
      compiled,
      timeline: [
        {
          date: p.created_at.slice(0, 10),
          kind: "added as partner",
          body: `Imported from \`public.partners\` (id ${p.id}).`,
        },
      ],
    });
    await writeFile(join(brainDir, "companies", `${slug}.md`), page);
  }

  return lookup;
}
