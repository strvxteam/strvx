"use server";

import { db } from "@/lib/db";
import {
  engagements,
  companies,
  contacts,
  tasks,
  projects,
  invoices,
  documents,
  skills,
} from "@strvx/db/schema";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "../actions";

export type PaletteGroupKey =
  | "engagements"
  | "contacts"
  | "tasks"
  | "projects"
  | "invoices"
  | "docs"
  | "skills"
  | "pages";

export type PaletteResult = {
  group: PaletteGroupKey;
  id: string; // entity uuid or page path
  label: string;
  sublabel?: string;
  href: string;
};

const queryShape = z.string().min(1).max(100);
const LIMIT = 5;

export async function searchAll(query: string): Promise<PaletteResult[]> {
  const parsed = queryShape.safeParse(query);
  if (!parsed.success) return [];
  await getCurrentUser();

  const q = `%${parsed.data}%`;

  const [engRows, contactRows, taskRows, projectRows, invoiceRows, docRows, skillRows] =
    await Promise.all([
      db
        .select({
          id: engagements.id,
          engagementName: engagements.name,
          companyName: companies.name,
        })
        .from(engagements)
        .innerJoin(companies, eq(engagements.companyId, companies.id))
        .where(
          and(
            isNull(engagements.archivedAt),
            or(ilike(engagements.name, q), ilike(companies.name, q))!,
          ),
        )
        .orderBy(desc(engagements.createdAt))
        .limit(LIMIT),

      db
        .select({
          id: contacts.id,
          name: contacts.name,
          email: contacts.email,
          companyName: companies.name,
        })
        .from(contacts)
        .innerJoin(companies, eq(contacts.companyId, companies.id))
        .where(
          and(
            isNull(contacts.archivedAt),
            or(ilike(contacts.name, q), ilike(contacts.email, q))!,
          ),
        )
        .limit(LIMIT),

      db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(ilike(tasks.title, q))
        .orderBy(desc(tasks.createdAt))
        .limit(LIMIT),

      db
        .select({ id: projects.id, name: projects.name, client: projects.client })
        .from(projects)
        .where(or(ilike(projects.name, q), ilike(projects.client, q))!)
        .orderBy(desc(projects.createdAt))
        .limit(LIMIT),

      db
        .select({
          id: invoices.id,
          number: invoices.invoiceNumber,
          clientName: invoices.clientName,
        })
        .from(invoices)
        .where(or(ilike(invoices.invoiceNumber, q), ilike(invoices.clientName, q))!)
        .orderBy(desc(invoices.createdAt))
        .limit(LIMIT),

      db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(ilike(documents.title, q))
        .limit(LIMIT),

      db
        .select({ id: skills.id, name: skills.name })
        .from(skills)
        .where(ilike(skills.name, q))
        .limit(LIMIT),
    ]);

  const results: PaletteResult[] = [];

  for (const r of engRows) {
    results.push({
      group: "engagements",
      id: r.id,
      label: r.companyName,
      sublabel: r.engagementName,
      href: `/clients/${r.id}`,
    });
  }
  for (const r of contactRows) {
    results.push({
      group: "contacts",
      id: r.id,
      label: r.name,
      sublabel: r.companyName ?? r.email ?? "",
      href: `/contacts/${r.id}`,
    });
  }
  for (const r of taskRows) {
    results.push({
      group: "tasks",
      id: r.id,
      label: r.title,
      href: `/tasks?taskId=${r.id}`,
    });
  }
  for (const r of projectRows) {
    results.push({
      group: "projects",
      id: r.id,
      label: r.name,
      sublabel: r.client ?? undefined,
      href: `/projects/${r.id}`,
    });
  }
  for (const r of invoiceRows) {
    results.push({
      group: "invoices",
      id: r.id,
      label: r.number,
      sublabel: r.clientName ?? undefined,
      href: `/invoices?invoiceId=${r.id}`,
    });
  }
  for (const r of docRows) {
    results.push({
      group: "docs",
      id: r.id,
      label: r.title,
      href: `/docs/${r.id}`,
    });
  }
  for (const r of skillRows) {
    results.push({
      group: "skills",
      id: r.id,
      label: r.name,
      href: `/skills/${r.id}`,
    });
  }

  const needle = parsed.data.toLowerCase();
  const pageMatches = PAGES.filter(
    (p) => p.label.toLowerCase().includes(needle) || p.href.toLowerCase().includes(needle),
  ).slice(0, LIMIT);
  for (const p of pageMatches) {
    results.push({ group: "pages", id: p.href, label: p.label, href: p.href });
  }

  return results;
}

const PAGES: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Tasks", href: "/tasks" },
  { label: "Projects", href: "/projects" },
  { label: "Calendar", href: "/calendar" },
  { label: "Availability", href: "/availability" },
  { label: "Goals", href: "/goals" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Clients", href: "/clients" },
  { label: "Partners Pipeline", href: "/partners/pipeline" },
  { label: "Partners Directory", href: "/partners" },
  { label: "Finances", href: "/finances" },
  { label: "Invoices", href: "/invoices" },
  { label: "Development", href: "/development" },
  { label: "Deployments", href: "/development/deployments" },
  { label: "Pull Requests", href: "/development/pull-requests" },
  { label: "Actions", href: "/development/actions" },
  { label: "Monitoring", href: "/development/monitoring" },
  { label: "Repos", href: "/development/repos" },
  { label: "Docs", href: "/docs" },
  { label: "Assets", href: "/assets" },
  { label: "Skills", href: "/skills" },
  { label: "Components", href: "/skills/components" },
  { label: "Rules", href: "/skills/rules" },
  { label: "Patterns", href: "/skills/patterns" },
  { label: "Corrections", href: "/skills/corrections" },
  { label: "Agents", href: "/skills/agents" },
];
