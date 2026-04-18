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

// NOTE: Results are not user/tenant-filtered beyond the `getCurrentUser()` auth gate.
// Acceptable for the current single-tenant strvx-internal app, but this action will
// need per-user scoping (or the schema equivalent of RLS) if/when multi-user isolation
// becomes a requirement. See follow-up review comment #3.
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

// ── Inline create wrappers ──────────────────────────────────────
//
// Thin, minimal-field delegations to existing create actions in ../actions.
// Each returns a discriminated union { success: true, id } | { success: false, error }
// so palette call-sites never throw. Validation is done with Zod up-front.
//
// Notes on adaptations from the original plan template:
//   - createEngagement/createContact take FormData, not plain objects — wrappers build FormData.
//   - createTask returns a row object with .id, not a raw id string.
//   - createTask uses priority "normal" (enum: urgent|high|normal|low); there is no "medium".
//   - createFollowUpLink(engagementId, meetingType) — its real shape is an engagement-scoped
//     meeting-type token, not a free-form { url, label } link. Wrapper reflects the real shape.
//   - createInteraction / createNextAction do NOT exist as standalone actions. The existing
//     `quickAdd(formData)` handles both: plain content → interaction; "/action " prefix →
//     interaction + next_action row. Wrappers delegate to quickAdd accordingly.

const inlineTaskSchema = z.object({
  title: z.string().min(1).max(500),
  dueDate: z.string().optional(), // YYYY-MM-DD
  assigneeId: z.string().uuid().optional(),
  engagementId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

export async function createTaskInline(input: z.infer<typeof inlineTaskSchema>) {
  const parsed = inlineTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { createTask } = await import("../actions");
  try {
    const task = await createTask({
      title: parsed.data.title,
      status: "todo",
      priority: "normal",
      dueDate: parsed.data.dueDate,
      assigneeIds: parsed.data.assigneeId ? [parsed.data.assigneeId] : undefined,
      engagementId: parsed.data.engagementId,
      projectId: parsed.data.projectId,
    });
    return { success: true as const, id: task.id };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

const inlineEngagementSchema = z.object({
  name: z.string().min(1).max(200),
  companyName: z.string().min(1).max(200),
});

export async function createEngagementInline(input: z.infer<typeof inlineEngagementSchema>) {
  const parsed = inlineEngagementSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { createEngagement } = await import("../actions");
  try {
    const formData = new FormData();
    formData.append("companyName", parsed.data.companyName);
    formData.append("engagementName", parsed.data.name);
    formData.append("stage", "lead");
    const engagement = await createEngagement(formData);
    return { success: true as const, id: engagement.id };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

const inlineContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  companyId: z.string().uuid(),
});

export async function createContactInline(input: z.infer<typeof inlineContactSchema>) {
  const parsed = inlineContactSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { createContact } = await import("../actions");
  try {
    const formData = new FormData();
    formData.append("name", parsed.data.name);
    if (parsed.data.email) formData.append("email", parsed.data.email);
    formData.append("companyId", parsed.data.companyId);
    const contact = await createContact(formData);
    return { success: true as const, id: contact.id };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Interactions: `createInteractionAction` doesn't exist. Delegate to `quickAdd`,
// which inserts into the `interactions` table. The real interactionTypeEnum only
// accepts "note" | "meeting" | "action" | "stage_change" — we expose "note" and
// "meeting" here as the user-facing types for palette quick-log.
const inlineInteractionSchema = z.object({
  engagementId: z.string().uuid(),
  type: z.enum(["note", "meeting"]),
  content: z.string().min(1).max(10_000),
  scheduledAt: z.string().optional(),
});

export async function logInteractionInline(input: z.infer<typeof inlineInteractionSchema>) {
  const parsed = inlineInteractionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { quickAdd } = await import("../actions");
  try {
    const formData = new FormData();
    // quickAdd parses a type prefix on the content string.
    const prefix = parsed.data.type === "meeting" ? "/meeting " : "/note ";
    formData.append("content", `${prefix}${parsed.data.content}`);
    formData.append("engagementId", parsed.data.engagementId);
    if (parsed.data.scheduledAt) formData.append("scheduledAt", parsed.data.scheduledAt);
    await quickAdd(formData);
    return { success: true as const, id: parsed.data.engagementId };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Next actions: `createNextActionAction` doesn't exist standalone.
// quickAdd with the "/action " prefix writes a next_action row (plus an interaction).
const inlineNextActionSchema = z.object({
  engagementId: z.string().uuid(),
  description: z.string().min(1).max(500),
  dueDate: z.string().optional(),
});

export async function addNextActionInline(input: z.infer<typeof inlineNextActionSchema>) {
  const parsed = inlineNextActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { quickAdd } = await import("../actions");
  try {
    const formData = new FormData();
    formData.append("content", `/action ${parsed.data.description}`);
    formData.append("engagementId", parsed.data.engagementId);
    if (parsed.data.dueDate) formData.append("dueDate", parsed.data.dueDate);
    await quickAdd(formData);
    return { success: true as const, id: parsed.data.engagementId };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Follow-up links: real signature is (engagementId, meetingType) — not (url, label).
// The returned token is what the palette uses to build the public share URL.
const inlineFollowupLinkSchema = z.object({
  engagementId: z.string().uuid(),
  meetingType: z.enum(["proposal", "revision", "in_person"]),
});

export async function addFollowupLinkInline(input: z.infer<typeof inlineFollowupLinkSchema>) {
  const parsed = inlineFollowupLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { createFollowUpLink } = await import("../actions");
  try {
    const token = await createFollowUpLink(parsed.data.engagementId, parsed.data.meetingType);
    return { success: true as const, id: token };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
