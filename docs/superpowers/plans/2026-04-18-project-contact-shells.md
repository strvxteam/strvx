# Project + Contact Entity Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Apply the `EntityShell` pattern (from Plan 2) to projects and contacts. Projects already have a detail route; contacts currently live as a modal inside `/clients` and need to be promoted to `/contacts/[id]`.

**Architecture:** Thin — most heavy lifting done in Plan 2. Projects get a shell with 5 tabs; contacts get a new route + shell with 5 tabs. Generalize `engagement-shell-data.ts` into a polymorphic `shell-data.ts` keyed by entity kind.

**Tech Stack:** Next.js 16 App Router, Drizzle, Tailwind v4, shadcn/ui, lucide-react. Reuses `EntityShell`, `PaletteInlineForm`, and palette inline-create actions.

**Spec reference:** `docs/superpowers/specs/2026-04-18-strvx-discoverability-redesign-design.md` Section 3.

**Prerequisites:**
- Plan 2 (engagement shell) merged — provides `EntityShell`, `Breadcrumbs`, `EntityHeader`, `EntityTabs`, `RightRail`, `resolveEntityLabel`

---

## File Structure

**Create:**
- `apps/internal/src/lib/shell-data.ts` — polymorphic shell loader replacing `engagement-shell-data.ts`
- `apps/internal/src/components/shell/entity-header.tsx` — extend to accept polymorphic entity kind + actions

Project routes:
- `apps/internal/src/app/(app)/projects/[id]/layout.tsx`
- `apps/internal/src/app/(app)/projects/[id]/page.tsx` (Overview)
- `apps/internal/src/app/(app)/projects/[id]/activity/page.tsx`
- `apps/internal/src/app/(app)/projects/[id]/tasks/page.tsx`
- `apps/internal/src/app/(app)/projects/[id]/files/page.tsx`
- `apps/internal/src/app/(app)/projects/[id]/invoices/page.tsx`

Contact routes (new):
- `apps/internal/src/app/(app)/contacts/page.tsx` — Contacts list (new index page)
- `apps/internal/src/app/(app)/contacts/[id]/layout.tsx`
- `apps/internal/src/app/(app)/contacts/[id]/page.tsx` (Overview)
- `apps/internal/src/app/(app)/contacts/[id]/activity/page.tsx`
- `apps/internal/src/app/(app)/contacts/[id]/engagements/page.tsx`
- `apps/internal/src/app/(app)/contacts/[id]/tasks/page.tsx`
- `apps/internal/src/app/(app)/contacts/[id]/files/page.tsx`

**Modify:**
- `apps/internal/src/components/shell/entity-header.tsx` — add polymorphic `entityKind` prop + per-kind CTA map
- `apps/internal/src/components/layout/sidebar.tsx` — add `{ href: "/contacts", label: "Contacts" }` under Sales
- `apps/internal/src/app/(app)/clients/clients-table.tsx` — rows link to `/clients/[id]`; contact sub-rows link to `/contacts/[id]` (promote away from modal)

---

## Task Sequence

1. Generalize `engagement-shell-data.ts` → `shell-data.ts` (polymorphic)
2. Extend `EntityHeader` to accept kind-specific CTAs
3. Project shell layout + 5 tab pages
4. Extract existing project detail content into the new Overview tab
5. Contact list page at `/contacts` (new)
6. Contact shell layout + 5 tab pages
7. Add Contacts link to sidebar (Sales section)
8. Clients table: contacts link to `/contacts/[id]` instead of opening modal
9. Smoke pass

---

### Task 1: Generalize shell data loader

**Files:**
- Create: `apps/internal/src/lib/shell-data.ts`
- Delete (after this plan): `apps/internal/src/lib/engagement-shell-data.ts` (consumers migrate)

```ts
// apps/internal/src/lib/shell-data.ts
import "server-only";
import { unstable_cache } from "next/cache";
import {
  getEngagement, getProject, getContact,
  getContactsByCompany, getProjectsByEngagement, getInvoicesByEngagement,
  getEngagementsByContact,
} from "./queries";
import type { RightRailData } from "@/components/shell/right-rail";

type EntityKind = "engagement" | "project" | "contact";

export type ShellData = {
  title: string;
  subtitle?: string;
  rightRail: RightRailData;
};

export async function loadShellData(kind: EntityKind, id: string): Promise<ShellData | null> {
  if (kind === "engagement") return loadEngagementShell(id);
  if (kind === "project") return loadProjectShell(id);
  if (kind === "contact") return loadContactShell(id);
  return null;
}

const loadEngagementShell = unstable_cache(
  async (id: string): Promise<ShellData | null> => {
    const eng = await getEngagement(id);
    if (!eng) return null;
    const [contacts, projects, invoices] = await Promise.all([
      getContactsByCompany(eng.companyId),
      getProjectsByEngagement(id),
      getInvoicesByEngagement(id),
    ]);
    const openInvoices = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
    const primary = eng.primaryContactId ? contacts.find((c) => c.id === eng.primaryContactId) : undefined;
    return {
      title: eng.companyName,
      subtitle: [eng.stage, eng.dealValue ? `$${Number(eng.dealValue).toLocaleString()}` : null, eng.probability ? `${eng.probability}%` : null].filter(Boolean).join(" · "),
      rightRail: {
        company: { id: eng.companyId, name: eng.companyName },
        primaryContact: primary ? { id: primary.id, name: primary.name } : undefined,
        otherContacts: contacts.filter((c) => c.id !== primary?.id).slice(0, 5).map((c) => ({ id: c.id, name: c.name })),
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        openInvoices: openInvoices.map((i) => ({ id: i.id, number: i.invoiceNumber, amount: Number(i.amount) })),
      },
    };
  },
  ["shell-engagement"],
  { revalidate: 30 }
);

const loadProjectShell = unstable_cache(
  async (id: string): Promise<ShellData | null> => {
    const project = await getProject(id);
    if (!project) return null;
    const engagement = project.engagementId ? await getEngagement(project.engagementId) : null;
    return {
      title: project.name,
      subtitle: [project.client, project.status].filter(Boolean).join(" · "),
      rightRail: {
        company: engagement ? { id: engagement.companyId, name: engagement.companyName } : { id: "", name: project.client ?? "" },
        primaryContact: undefined,
        otherContacts: [],
        projects: [],
        openInvoices: [],
      },
    };
  },
  ["shell-project"],
  { revalidate: 30 }
);

const loadContactShell = unstable_cache(
  async (id: string): Promise<ShellData | null> => {
    const contact = await getContact(id);
    if (!contact) return null;
    const [companyContacts, engagements] = await Promise.all([
      getContactsByCompany(contact.companyId),
      getEngagementsByContact(id),
    ]);
    return {
      title: contact.name,
      subtitle: [contact.role, contact.email].filter(Boolean).join(" · "),
      rightRail: {
        company: { id: contact.companyId, name: companyContacts[0]?.companyName ?? "" },
        primaryContact: undefined,
        otherContacts: companyContacts.filter((c) => c.id !== id).slice(0, 5).map((c) => ({ id: c.id, name: c.name })),
        projects: [],
        openInvoices: [],
      },
    };
  },
  ["shell-contact"],
  { revalidate: 30 }
);
```

Add missing queries to `queries.ts` if needed: `getEngagementsByContact(contactId)`, `getProject(id)` (if not exported), `getContact(id)` (if not exported).

Commit: `feat(internal): generalize shell-data loader for polymorphic entity kinds`

---

### Task 2: Extend EntityHeader for polymorphic CTAs

**Files:**
- Modify: `apps/internal/src/components/shell/entity-header.tsx`

Change the component signature to accept `entityKind` and a CTA map:

```tsx
type EntityKind = "engagement" | "project" | "contact";
export function EntityHeader({ title, subtitle, kind, entityId, engagementId }: {
  title: string;
  subtitle?: string;
  kind: EntityKind;
  entityId: string;
  engagementId?: string; // optional for non-engagement kinds; used to scope contextual actions
}) { /* ... */ }
```

Per-kind primary CTA:
- engagement: "Log interaction" (existing)
- project: "Add task" — opens `createTaskInline({ title, dueDate, projectId })` — wrapper needs extending or use existing with `projectId` if the plan1 wrapper supports it (it does accept `engagementId` but not `projectId` currently — add an optional `projectId` to the task wrapper signature)
- contact: "Log interaction" — requires `engagementId` context; if the contact has no current engagement, disable the primary CTA and show "Link to engagement" in the overflow

Update `apps/internal/src/app/actions/palette.ts` to add `projectId?` to `createTaskInline` and pass through to the existing `createTask` action. If `createTask`'s signature accepts `projectId`, this is a 1-line change.

Commit: `feat(internal/shell): polymorphic entity header with per-kind CTAs`

---

### Task 3: Project shell layout + tab pages

Follow the same pattern as Plan 2 Task 8:

```tsx
// apps/internal/src/app/(app)/projects/[id]/layout.tsx
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { EntityShell } from "@/components/shell/entity-shell";
import { loadShellData } from "@/lib/shell-data";

export default async function ProjectLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode; }) {
  const { id } = await params;
  const data = await loadShellData("project", id);
  if (!data) return notFound();
  const h = await headers();
  const pathname = h.get("x-pathname") ?? `/projects/${id}`;

  const tabs = [
    { key: "overview", label: "Overview", href: `/projects/${id}` },
    { key: "activity", label: "Activity", href: `/projects/${id}/activity` },
    { key: "tasks", label: "Tasks", href: `/projects/${id}/tasks` },
    { key: "files", label: "Files", href: `/projects/${id}/files` },
    { key: "invoices", label: "Invoices", href: `/projects/${id}/invoices` },
  ];

  return <EntityShell pathname={pathname} title={data.title} subtitle={data.subtitle} kind="project" entityId={id} tabs={tabs} rightRail={data.rightRail}>{children}</EntityShell>;
}
```

Tab pages follow the same thin pattern as Plan 2's engagement tabs (read id from params, call a query, render an existing sub-component or a new list).

Commits (one per logical group):
- `feat(internal/project): add project shell layout + tab routes`
- `feat(internal/project): wire overview, activity, tasks, files, invoices tabs`

---

### Task 4: Extract existing project detail → Overview tab

The current project detail page lives at `apps/internal/src/app/(app)/projects/[id]/page.tsx`. Slim it to render only the Overview content (name, client, engagement link, status, dates). Activity/tasks/files/invoices move to their own tab pages (Task 3).

Commit: `feat(internal/project): migrate project overview to shell default tab`

---

### Task 5: Contact list page at `/contacts`

**File:** `apps/internal/src/app/(app)/contacts/page.tsx` (new)

The app currently manages contacts via a modal on `/clients`. Create a dedicated list page so the entity shell has a valid "list" breadcrumb parent.

```tsx
import { getContacts } from "@/lib/queries";
import Link from "next/link";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const contacts = await getContacts();
  return (
    <div>
      <h1 className="mb-5 text-[22px] font-bold">Contacts</h1>
      <div className="overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
        <table className="w-full text-[13px]">
          <thead className="bg-[#fafafa]">
            <tr>
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-[#888]">Name</th>
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-[#888]">Email</th>
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-[#888]">Company</th>
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-[#888]">Role</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-[#f0f0f0] hover:bg-[#fafafa]">
                <td className="px-4 py-2.5"><Link href={`/contacts/${c.id}`} className="text-[#1a73e8] hover:underline">{c.name}</Link></td>
                <td className="px-4 py-2.5 text-[#555]">{c.email}</td>
                <td className="px-4 py-2.5 text-[#555]">{c.companyName}</td>
                <td className="px-4 py-2.5 text-[#555]">{c.role ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Commit: `feat(internal/contacts): add contacts list page`

---

### Task 6: Contact shell layout + tab pages

Follow the same pattern as Task 3. Tabs: Overview, Activity (interactions involving this contact), Engagements (engagements at their company), Tasks, Files.

Contact-specific queries to add if missing:
- `getInteractionsByContact(contactId)` — interactions where this contact is the subject (schema may not support this directly; if interactions are engagement-scoped, fall back to engagement interactions where `primaryContactId === contactId`).
- `getEngagementsByContact(contactId)` — already referenced in Task 1.

Commits:
- `feat(internal/contact): add contact shell layout + tab routes`
- `feat(internal/contact): wire overview, activity, engagements, tasks, files tabs`

---

### Task 7: Add Contacts link to sidebar

**File:** `apps/internal/src/components/layout/sidebar.tsx`

In the Sales section (`{ label: "Sales", icon: Handshake, items: [...] }`), add `{ href: "/contacts", label: "Contacts", icon: Users }` after Clients. Icon already imported.

Commit: `feat(internal/sidebar): add Contacts link under Sales`

---

### Task 8: Clients table — route contact rows to `/contacts/[id]`

**File:** `apps/internal/src/app/(app)/clients/clients-table.tsx`

The clients table currently shows contact sub-rows that open a modal. Change them to link to `/contacts/[id]` instead. If the modal is used for editing, keep the edit trigger as a separate button but make the name itself a route link.

Commit: `refactor(internal/clients): link contact rows to dedicated contact page`

---

### Task 9: Smoke pass

- [ ] Visit `/projects/<id>` — shell renders, 5 tabs work, right rail shows engagement link
- [ ] Visit `/contacts` — list renders
- [ ] Visit `/contacts/<id>` — shell renders, 5 tabs work
- [ ] Sidebar shows "Contacts" under Sales; click → routes to `/contacts`
- [ ] `/clients` contact row click → `/contacts/<id>` (not a modal)
- [ ] Breadcrumbs work on all new routes; entity names resolve (not UUIDs)
- [ ] Right rail: project → Company link; contact → Company + other Contacts

If anything fails, file specific fix tasks. Do not mask failures.

---

## Self-Review

**Spec coverage (Section 3):**
- Project shell ✓ (Task 3)
- Contact shell ✓ (Task 6)
- Contact promoted to dedicated route ✓ (Tasks 5, 6, 8)
- Right rail varies by entity kind ✓ (Task 1)
- All tab sets match the spec's tab tables (projects: Overview/Activity/Tasks/Files/Invoices; contacts: Overview/Activity/Engagements/Tasks/Files) ✓

**Deferrals:**
- "Team" column on project right rail — schema doesn't have project members table populated yet; defer until it does, leave empty list
- Contact activity tab shape — may need a schema-side adjustment if interactions aren't queryable by contact; fall back to engagement-filtered if needed, note in code

**Risks:**
- Task 5 list page duplicates data now shown in the clients-page contacts modal. Fine short-term; long-term consolidate.
- If `createTask`'s signature doesn't accept `projectId`, Task 2's project primary CTA needs a new inline wrapper (`createTaskForProject`). Audit first.

---

## Execution Handoff

Run with `superpowers:subagent-driven-development` after Plan 2 (engagement shell) merges.
