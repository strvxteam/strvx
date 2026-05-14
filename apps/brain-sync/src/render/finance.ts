import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import { slugify } from "../util/slug.ts";
import { renderPage, type TimelineEntry } from "../util/page.ts";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  engagement_id: string | null;
  client_name: string | null;
  amount: string | null;
  status: string | null;
  issued_date: string | null;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
}

interface ExpenseRow {
  id: string;
  description: string;
  amount: string | null;
  category: string | null;
  vendor: string | null;
  date: string | null;
  recurring: boolean | null;
  notes: string | null;
  created_at: string;
}

export async function renderFinances(
  sql: postgres.Sql,
  brainDir: string,
  dealSlugByEngagementId: Map<string, string>,
): Promise<void> {
  const invoices = await sql<InvoiceRow[]>`
    SELECT id, invoice_number, engagement_id, client_name,
           amount::text AS amount, status,
           issued_date::text AS issued_date,
           due_date::text AS due_date,
           paid_date::text AS paid_date,
           notes,
           created_at::text AS created_at
    FROM public.invoices
    ORDER BY issued_date DESC NULLS LAST
  `;
  const expenses = await sql<ExpenseRow[]>`
    SELECT id, description, amount::text AS amount, category, vendor,
           date::text AS date, recurring, notes,
           created_at::text AS created_at
    FROM public.expenses
    ORDER BY date DESC NULLS LAST
  `;

  const usedSlugs = new Set<string>();

  for (const inv of invoices) {
    let slug = `inv-${slugify(inv.invoice_number)}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${inv.id.slice(0, 6)}`;
    usedSlugs.add(slug);

    const dealSlug = inv.engagement_id
      ? dealSlugByEngagementId.get(inv.engagement_id)
      : undefined;

    const compiled = [
      `# Invoice ${inv.invoice_number}`,
      "",
      inv.client_name ? `Issued to **${inv.client_name}**.` : "",
      "",
      "## State",
      inv.amount ? `- Amount: $${inv.amount}` : null,
      inv.status ? `- Status: ${inv.status}` : null,
      inv.issued_date ? `- Issued: ${inv.issued_date}` : null,
      inv.due_date ? `- Due: ${inv.due_date}` : null,
      inv.paid_date ? `- Paid: ${inv.paid_date}` : null,
      dealSlug ? `- Deal: [[deals/${dealSlug}]]` : null,
      inv.notes ? `\n${inv.notes}` : null,
      "",
    ]
      .filter((s) => s !== null && s !== "")
      .join("\n");

    const timeline: TimelineEntry[] = [];
    if (inv.issued_date) {
      timeline.push({
        date: inv.issued_date,
        kind: "invoice issued",
        body: `${inv.invoice_number} for $${inv.amount ?? "?"}.`,
      });
    }
    if (inv.paid_date) {
      timeline.push({
        date: inv.paid_date,
        kind: "invoice paid",
        body: `${inv.invoice_number} settled.`,
      });
    }

    const page = renderPage({
      frontmatter: {
        slug: `finances/${slug}`,
        type: "invoice",
        source_id: inv.id,
        source_table: "invoices",
        source_updated_at: inv.issued_date ?? inv.created_at,
        synced_at: new Date().toISOString(),
        invoice_number: inv.invoice_number,
        client: inv.client_name,
        amount: inv.amount ? Number(inv.amount) : null,
        status: inv.status,
        deal_slug: dealSlug,
      },
      compiled,
      timeline,
    });
    await writeFile(join(brainDir, "finances", `${slug}.md`), page);
  }

  for (const ex of expenses) {
    const date = (ex.date ?? ex.created_at).slice(0, 10);
    let slug = `exp-${date}-${slugify(ex.description).slice(0, 30)}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${ex.id.slice(0, 6)}`;
    usedSlugs.add(slug);

    const compiled = [
      `# ${ex.description}`,
      "",
      ex.vendor ? `Paid to **${ex.vendor}**.` : "",
      "",
      "## State",
      ex.amount ? `- Amount: $${ex.amount}` : null,
      ex.category ? `- Category: ${ex.category}` : null,
      ex.date ? `- Date: ${ex.date}` : null,
      ex.recurring ? `- Recurring: yes` : null,
      ex.notes ? `\n${ex.notes}` : null,
      "",
    ]
      .filter((s) => s !== null && s !== "")
      .join("\n");

    const page = renderPage({
      frontmatter: {
        slug: `finances/${slug}`,
        type: "expense",
        source_id: ex.id,
        source_table: "expenses",
        source_updated_at: ex.date ?? ex.created_at,
        synced_at: new Date().toISOString(),
        description: ex.description,
        amount: ex.amount ? Number(ex.amount) : null,
        category: ex.category,
        vendor: ex.vendor,
      },
      compiled,
      timeline: [
        {
          date,
          kind: "expense recorded",
          body: `${ex.description}${ex.amount ? ` — $${ex.amount}` : ""}.`,
        },
      ],
    });
    await writeFile(join(brainDir, "finances", `${slug}.md`), page);
  }
}
