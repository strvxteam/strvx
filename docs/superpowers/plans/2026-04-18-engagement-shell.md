# Engagement Entity Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a unified, tabbed detail layout for engagements at `/clients/[id]` — breadcrumb, header with quick-actions, URL-backed tabs, and a persistent right-rail context panel. This is the first of three entity shells (project + contact follow in Plan 3).

**Architecture:** A generic `EntityShell` component (reusable across engagements/projects/contacts in later plans) composes four subcomponents — `Breadcrumbs`, `EntityHeader`, `EntityTabs`, `RightRail`. The shell wraps a route-segment layout at `apps/internal/src/app/(app)/clients/[id]/layout.tsx`. Tabs are URL-backed (`?tab=activity`), each tab loads its own data via its own page component at `apps/internal/src/app/(app)/clients/[id]/<tab>/page.tsx`. Primary CTA ("Log interaction") opens the palette's inline-form component inline, scoped to the current engagement.

**Tech Stack:** Next.js 16 App Router (nested layouts + parallel routes where useful), Drizzle, Tailwind v4, shadcn/ui, lucide-react. Reuses palette's `PaletteInlineForm` for quick-actions.

**Open questions resolved (from spec):**
- **Q1 (breadcrumb entity resolution):** one lightweight `resolveEntityLabel(kind, id)` helper called per segment, cached per-request via React `cache()`.
- **Q2 (right rail caching):** `unstable_cache` with 30s TTL keyed on `entityId` for the right-rail loader.
- **Q4 (breadcrumb placement):** inside `main`, scrolls with content (decided in spec).

**Spec reference:** `docs/superpowers/specs/2026-04-18-strvx-discoverability-redesign-design.md`, Section 3.

**Out of scope for this plan:**
- Project and contact shells (Plan 3)
- Nav chrome (Plan 5 — breadcrumbs used by this plan live within `main`, not in the sidebar)
- Inbox (Plan 4)

**Prerequisites:**
- Plan 1 (Palette) is merged or executing on a sibling branch — we reuse `PaletteInlineForm` and `logInteractionInline` from that surface
- `cfb4a7e` is the base main ref (Plan 1 branched here)

---

## File Structure

**Create (new):**
- `apps/internal/src/components/shell/entity-shell.tsx` — generic shell wrapper
- `apps/internal/src/components/shell/breadcrumbs.tsx` — auto-derived breadcrumb
- `apps/internal/src/components/shell/entity-header.tsx` — title + subtitle + primary CTA + overflow menu
- `apps/internal/src/components/shell/entity-tabs.tsx` — URL-backed tab bar
- `apps/internal/src/components/shell/right-rail.tsx` — linked-entities sidebar
- `apps/internal/src/lib/entity-label.ts` — `resolveEntityLabel(kind, id)` helper (React-cached)
- `apps/internal/src/app/(app)/clients/[id]/layout.tsx` — engagement shell layout
- `apps/internal/src/app/(app)/clients/[id]/activity/page.tsx` — Activity tab
- `apps/internal/src/app/(app)/clients/[id]/actions/page.tsx` — Next Actions tab
- `apps/internal/src/app/(app)/clients/[id]/tasks/page.tsx` — Tasks tab
- `apps/internal/src/app/(app)/clients/[id]/files/page.tsx` — Files tab
- `apps/internal/src/app/(app)/clients/[id]/invoices/page.tsx` — Invoices tab
- `apps/internal/src/app/(app)/clients/[id]/notes/page.tsx` — Notes tab
- `apps/internal/src/lib/engagement-shell-data.ts` — server loaders for header + right rail

**Modify:**
- `apps/internal/src/app/(app)/clients/[id]/page.tsx` — reduce to Overview content only; header/tabs move to layout
- `apps/internal/src/components/client/client-detail-view.tsx` — shrink to Overview content (most of its tab-like sections move to dedicated tab pages)

**Delete (by end of plan):**
- None this plan. `client-detail-view.tsx` is kept in slimmed form; may be further split in Plan 3.

---

## Task Sequence

1. `entity-label.ts` — pure helper with unit test
2. `breadcrumbs.tsx` — server component, renders from `pathname` + entity-label lookup
3. `entity-header.tsx` — client component, primary CTA opens palette inline form
4. `entity-tabs.tsx` — client component, URL-backed
5. `right-rail.tsx` — server component with `unstable_cache`
6. `entity-shell.tsx` — composes the four above
7. `engagement-shell-data.ts` — shell loader (header + right-rail query)
8. Engagement route restructure — new `layout.tsx` + 7 tab page files
9. Overview tab — extract from `client-detail-view.tsx`
10. Activity / Actions / Tasks / Files / Invoices / Notes tabs — wire to existing queries
11. Slim `client-detail-view.tsx`
12. Smoke pass — navigate all tabs, verify right rail, log interaction inline

---

### Task 1: `entity-label.ts` (pure helper with React cache)

**Files:**
- Create: `apps/internal/src/lib/entity-label.ts`
- Create: `apps/internal/src/lib/entity-label.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/internal/src/lib/entity-label.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./queries", () => ({
  getEngagement: vi.fn(),
  getProject: vi.fn(),
  getContact: vi.fn(),
}));

import { resolveEntityLabel } from "./entity-label";
import * as queries from "./queries";

describe("resolveEntityLabel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns company name for an engagement", async () => {
    (queries.getEngagement as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "abc", companyName: "Acme Corp", name: "Discovery"
    });
    const label = await resolveEntityLabel("engagement", "abc");
    expect(label).toBe("Acme Corp");
  });

  it("returns null when entity is missing", async () => {
    (queries.getEngagement as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const label = await resolveEntityLabel("engagement", "missing");
    expect(label).toBeNull();
  });

  it("returns project name for a project", async () => {
    (queries.getProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p1", name: "Website redesign"
    });
    const label = await resolveEntityLabel("project", "p1");
    expect(label).toBe("Website redesign");
  });

  it("returns contact name for a contact", async () => {
    (queries.getContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1", name: "Jane Doe"
    });
    const label = await resolveEntityLabel("contact", "c1");
    expect(label).toBe("Jane Doe");
  });
});
```

Run: `pnpm test src/lib/entity-label.test.ts` — expect FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
// apps/internal/src/lib/entity-label.ts
import { cache } from "react";
import { getEngagement, getProject, getContact } from "./queries";

type EntityKind = "engagement" | "project" | "contact";

export const resolveEntityLabel = cache(async (kind: EntityKind, id: string): Promise<string | null> => {
  try {
    if (kind === "engagement") {
      const e = await getEngagement(id);
      return e?.companyName ?? null;
    }
    if (kind === "project") {
      const p = await getProject(id);
      return p?.name ?? null;
    }
    if (kind === "contact") {
      const c = await getContact(id);
      return c?.name ?? null;
    }
  } catch {
    return null;
  }
  return null;
});
```

If any of `getEngagement`, `getProject`, `getContact` doesn't exist in `queries.ts`, add minimal versions first (or adapt to the existing `getEngagement(id)` signature — that one definitely exists).

- [ ] **Step 3: Run test, verify pass**

- [ ] **Step 4: Commit**

```bash
git add apps/internal/src/lib/entity-label.ts apps/internal/src/lib/entity-label.test.ts
git commit -m "feat(internal): add entity-label resolver for breadcrumbs"
```

---

### Task 2: `breadcrumbs.tsx` (server component)

**Files:**
- Create: `apps/internal/src/components/shell/breadcrumbs.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/internal/src/components/shell/breadcrumbs.tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { resolveEntityLabel } from "@/lib/entity-label";
import { resolveRouteContext } from "@/lib/route-context";

type Crumb = { label: string; href?: string };

export async function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = await buildCrumbs(pathname);
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-[12px] text-[#777]">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} strokeWidth={1.5} className="text-[#bbb]" />}
            {c.href && !last ? (
              <Link href={c.href} className="hover:text-[#222]">{c.label}</Link>
            ) : (
              <span className={last ? "text-[#222] font-medium" : undefined}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

async function buildCrumbs(pathname: string): Promise<Crumb[]> {
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let href = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    href += "/" + seg;
    // Translate route segments
    if (seg === "clients" && i === 0) { crumbs.push({ label: "Clients", href: "/clients" }); continue; }
    if (seg === "projects" && i === 0) { crumbs.push({ label: "Projects", href: "/projects" }); continue; }
    if (seg === "contacts" && i === 0) { crumbs.push({ label: "Contacts", href: "/contacts" }); continue; }
    // Entity detail
    const ctx = resolveRouteContext(href);
    if (ctx && ctx.id === seg) {
      const label = await resolveEntityLabel(ctx.kind, ctx.id);
      crumbs.push({ label: label ?? seg, href });
      continue;
    }
    // Tab subpath
    crumbs.push({ label: titleCase(seg) });
  }
  return crumbs;
}

function titleCase(s: string): string {
  return s.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/components/shell/breadcrumbs.tsx
git commit -m "feat(internal/shell): add server-side breadcrumbs with entity-name resolution"
```

---

### Task 3: `entity-header.tsx` (client component, primary CTA + overflow menu)

**Files:**
- Create: `apps/internal/src/components/shell/entity-header.tsx`

The header renders:
- Left: title (h1, 22px) + subtitle (13px, metadata like "Discovery · $24k · 70%")
- Right: primary CTA button + overflow menu (three-dot)

Primary CTA opens `PaletteInlineForm` (reused from palette) scoped to the current engagement. Overflow menu has: Add next action, Add task, New invoice, Add follow-up link, Pin (stub until Plan 5), Archive.

```tsx
"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { PaletteInlineForm } from "@/components/palette/palette-form";
import { logInteractionInline, addNextActionInline, createTaskInline } from "@/app/actions/palette";
import { toast } from "sonner";

type Action =
  | { id: "log-interaction"; engagementId: string }
  | { id: "add-next-action"; engagementId: string }
  | { id: "new-task"; engagementId: string };

export function EntityHeader({
  title, subtitle, engagementId,
}: {
  title: string;
  subtitle?: string;
  engagementId: string;
}) {
  const [active, setActive] = useState<Action | null>(null);

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[#111]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-[#888]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActive({ id: "log-interaction", engagementId })}
            className="rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white"
          >
            Log interaction
          </button>
          <OverflowMenu
            onAddNextAction={() => setActive({ id: "add-next-action", engagementId })}
            onAddTask={() => setActive({ id: "new-task", engagementId })}
          />
        </div>
      </header>
      {active && (
        <FormOverlay
          action={active}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

function OverflowMenu({ onAddNextAction, onAddTask }: { onAddNextAction: () => void; onAddTask: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label="More actions"
        className="rounded-md border border-[#e0e0e0] bg-white p-1.5 text-[#555]">
        <MoreHorizontal size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-[#e0e0e0] bg-white py-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}>
          <button onClick={() => { onAddNextAction(); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f5f5f5]">Add next action</button>
          <button onClick={() => { onAddTask(); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f5f5f5]">Add task</button>
        </div>
      )}
    </div>
  );
}

function FormOverlay({ action, onClose }: { action: Action; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[15vh]" onClick={onClose} role="presentation">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-[#e0e0e0] bg-white"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Inline form">
        {action.id === "log-interaction" && (
          <PaletteInlineForm
            title="Log interaction"
            fields={[
              { key: "type", label: "Type", type: "select", required: true, options: [
                { value: "note", label: "Note" }, { value: "meeting", label: "Meeting" },
              ]},
              { key: "content", label: "Content", type: "textarea", required: true, rows: 3 },
            ]}
            onCancel={onClose}
            onSubmit={async (v) => {
              const res = await logInteractionInline({
                engagementId: action.engagementId,
                type: v.type as "note" | "meeting",
                content: v.content,
              });
              return res.success ? { success: true } : { success: false, error: res.error };
            }}
            onSuccess={() => { toast.success("Interaction logged"); onClose(); }}
          />
        )}
        {action.id === "add-next-action" && (
          <PaletteInlineForm
            title="Add next action"
            fields={[
              { key: "description", label: "Description", type: "text", required: true },
              { key: "dueDate", label: "Due", type: "date" },
            ]}
            onCancel={onClose}
            onSubmit={async (v) => {
              const res = await addNextActionInline({
                engagementId: action.engagementId,
                description: v.description,
                dueDate: v.dueDate || undefined,
              });
              return res.success ? { success: true } : { success: false, error: res.error };
            }}
            onSuccess={() => { toast.success("Next action added"); onClose(); }}
          />
        )}
        {action.id === "new-task" && (
          <PaletteInlineForm
            title="New task"
            fields={[
              { key: "title", label: "Title", type: "text", required: true },
              { key: "dueDate", label: "Due", type: "date" },
            ]}
            onCancel={onClose}
            onSubmit={async (v) => {
              const res = await createTaskInline({
                title: v.title,
                dueDate: v.dueDate || undefined,
                engagementId: action.engagementId,
              });
              return res.success ? { success: true } : { success: false, error: res.error };
            }}
            onSuccess={() => { toast.success("Task created"); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}
```

Commit:
```bash
git add apps/internal/src/components/shell/entity-header.tsx
git commit -m "feat(internal/shell): add entity header with inline quick-actions"
```

---

### Task 4: `entity-tabs.tsx` (URL-backed tabs)

**Files:**
- Create: `apps/internal/src/components/shell/entity-tabs.tsx`

Simple tabs driven by `useSearchParams`. Each tab has `{ key, label, href }` — href points to the route segment.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { key: string; label: string; href: string };

export function EntityTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex gap-5 border-b border-[#e8e8e8]">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative -mb-px border-b-2 pb-2 pt-1 text-[13px] ${
              active ? "border-[#111] font-medium text-[#111]" : "border-transparent text-[#777] hover:text-[#333]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

Commit:
```bash
git add apps/internal/src/components/shell/entity-tabs.tsx
git commit -m "feat(internal/shell): add URL-backed entity tabs"
```

---

### Task 5: `right-rail.tsx` (server component with unstable_cache)

**Files:**
- Create: `apps/internal/src/components/shell/right-rail.tsx`

Renders linked entities for the current engagement. Content is fetched by the layout loader (Task 7) and passed as props.

```tsx
import Link from "next/link";

export type RightRailData = {
  company: { id: string; name: string };
  primaryContact?: { id: string; name: string };
  otherContacts: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  openInvoices: { id: string; number: string; amount: number }[];
};

export function RightRail({ data }: { data: RightRailData }) {
  return (
    <aside className="w-[280px] shrink-0 border-l border-[#eee] pl-5 text-[13px]">
      <Section title="Company">
        <Link href={`/clients?companyId=${data.company.id}`} className="block py-1 hover:text-[#111]">
          {data.company.name}
        </Link>
      </Section>

      {data.primaryContact && (
        <Section title="Primary contact">
          <Link href={`/contacts/${data.primaryContact.id}`} className="block py-1 hover:text-[#111]">
            {data.primaryContact.name}
          </Link>
        </Section>
      )}

      {data.otherContacts.length > 0 && (
        <Section title="Other contacts">
          {data.otherContacts.map((c) => (
            <Link key={c.id} href={`/contacts/${c.id}`} className="block py-1 hover:text-[#111]">{c.name}</Link>
          ))}
        </Section>
      )}

      {data.projects.length > 0 && (
        <Section title="Projects">
          {data.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block py-1 hover:text-[#111]">{p.name}</Link>
          ))}
        </Section>
      )}

      {data.openInvoices.length > 0 && (
        <Section title="Open invoices">
          {data.openInvoices.map((inv) => (
            <Link key={inv.id} href={`/invoices?invoiceId=${inv.id}`} className="flex justify-between py-1 hover:text-[#111]">
              <span>{inv.number}</span>
              <span className="text-[#888]">${inv.amount.toLocaleString()}</span>
            </Link>
          ))}
        </Section>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[#888]">{title}</div>
      <div className="text-[13px] text-[#333]">{children}</div>
    </div>
  );
}
```

Commit:
```bash
git add apps/internal/src/components/shell/right-rail.tsx
git commit -m "feat(internal/shell): add right-rail linked-entities sidebar"
```

---

### Task 6: `entity-shell.tsx` (composes the four pieces)

**Files:**
- Create: `apps/internal/src/components/shell/entity-shell.tsx`

```tsx
import type { ReactNode } from "react";
import { Breadcrumbs } from "./breadcrumbs";
import { EntityHeader } from "./entity-header";
import { EntityTabs, type Tab } from "./entity-tabs";
import { RightRail, type RightRailData } from "./right-rail";

export async function EntityShell({
  pathname, title, subtitle, engagementId, tabs, rightRail, children,
}: {
  pathname: string;
  title: string;
  subtitle?: string;
  engagementId: string;
  tabs: Tab[];
  rightRail: RightRailData;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <Breadcrumbs pathname={pathname} />
        <EntityHeader title={title} subtitle={subtitle} engagementId={engagementId} />
        <EntityTabs tabs={tabs} />
        <div className="min-w-0">{children}</div>
      </div>
      <RightRail data={rightRail} />
    </div>
  );
}
```

Commit:
```bash
git add apps/internal/src/components/shell/entity-shell.tsx
git commit -m "feat(internal/shell): compose entity shell wrapper"
```

---

### Task 7: Shell data loader

**Files:**
- Create: `apps/internal/src/lib/engagement-shell-data.ts`

Loads header data + right-rail data for an engagement. Uses `unstable_cache` with 30s TTL, keyed on engagementId.

```ts
import "server-only";
import { unstable_cache } from "next/cache";
import { getEngagement, getContactsByCompany, getProjectsByEngagement, getInvoicesByEngagement } from "./queries";
import type { RightRailData } from "@/components/shell/right-rail";

export async function loadEngagementShell(engagementId: string) {
  return cachedLoader(engagementId);
}

const cachedLoader = unstable_cache(
  async (engagementId: string) => {
    const engagement = await getEngagement(engagementId);
    if (!engagement) return null;

    const [contacts, projects, invoices] = await Promise.all([
      getContactsByCompany(engagement.companyId),
      getProjectsByEngagement(engagementId),
      getInvoicesByEngagement(engagementId),
    ]);

    const openInvoices = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
    const primary = engagement.primaryContactId
      ? contacts.find((c) => c.id === engagement.primaryContactId)
      : undefined;
    const other = contacts.filter((c) => c.id !== primary?.id).slice(0, 5);

    const subtitle = [
      engagement.stage,
      engagement.dealValue ? `$${Number(engagement.dealValue).toLocaleString()}` : null,
      engagement.probability ? `${engagement.probability}%` : null,
    ].filter(Boolean).join(" · ");

    const rightRail: RightRailData = {
      company: { id: engagement.companyId, name: engagement.companyName },
      primaryContact: primary ? { id: primary.id, name: primary.name } : undefined,
      otherContacts: other.map((c) => ({ id: c.id, name: c.name })),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      openInvoices: openInvoices.map((i) => ({
        id: i.id,
        number: i.invoiceNumber,
        amount: Number(i.amount),
      })),
    };

    return {
      engagement,
      title: engagement.companyName,
      subtitle,
      rightRail,
    };
  },
  ["engagement-shell-data"],
  { revalidate: 30 }
);
```

**If `getProjectsByEngagement` or `getInvoicesByEngagement` don't exist in `queries.ts`**, add them as minimal queries first:

```ts
// queries.ts additions
export async function getProjectsByEngagement(engagementId: string) {
  return db.select().from(projects).where(eq(projects.engagementId, engagementId));
}
export async function getInvoicesByEngagement(engagementId: string) {
  return db.select().from(invoices).where(eq(invoices.engagementId, engagementId)).orderBy(desc(invoices.createdAt));
}
```

Commit:
```bash
git add apps/internal/src/lib/engagement-shell-data.ts apps/internal/src/lib/queries.ts
git commit -m "feat(internal): add engagement shell loader with 30s cache"
```

---

### Task 8: Engagement route restructure — layout + 7 tab pages

**Files:**
- Create: `apps/internal/src/app/(app)/clients/[id]/layout.tsx`
- Create: 6 tab page files under `clients/[id]/<tab>/page.tsx` (activity, actions, tasks, files, invoices, notes)
- Modify: `apps/internal/src/app/(app)/clients/[id]/page.tsx` → Overview tab

Route layout:

```tsx
// apps/internal/src/app/(app)/clients/[id]/layout.tsx
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { EntityShell } from "@/components/shell/entity-shell";
import { loadEngagementShell } from "@/lib/engagement-shell-data";

export default async function EngagementLayout({
  params, children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const data = await loadEngagementShell(id);
  if (!data) return notFound();

  const h = await headers();
  const pathname = h.get("x-pathname") ?? `/clients/${id}`;

  const tabs = [
    { key: "overview", label: "Overview", href: `/clients/${id}` },
    { key: "activity", label: "Activity", href: `/clients/${id}/activity` },
    { key: "actions", label: "Next Actions", href: `/clients/${id}/actions` },
    { key: "tasks", label: "Tasks", href: `/clients/${id}/tasks` },
    { key: "files", label: "Files", href: `/clients/${id}/files` },
    { key: "invoices", label: "Invoices", href: `/clients/${id}/invoices` },
    { key: "notes", label: "Notes", href: `/clients/${id}/notes` },
  ];

  return (
    <EntityShell
      pathname={pathname}
      title={data.title}
      subtitle={data.subtitle}
      engagementId={id}
      tabs={tabs}
      rightRail={data.rightRail}
    >
      {children}
    </EntityShell>
  );
}
```

**Note:** `x-pathname` header isn't standard in Next.js — it needs to be added by middleware. If middleware doesn't exist or doesn't set it, the breadcrumb falls back to `/clients/${id}` (no tab segment). Fix by adding to existing `middleware.ts`:

```ts
// In apps/internal/src/middleware.ts, add at the top of the handler:
const res = NextResponse.next();
res.headers.set("x-pathname", req.nextUrl.pathname);
return res;
```

Alternate pattern: pass `pathname` down via searchParams or use a client component wrapper that reads `usePathname()`. If middleware wiring is tricky, fall back to reading pathname in a thin client wrapper inside the layout.

Tab pages (one per tab, each loads its own data):

```tsx
// apps/internal/src/app/(app)/clients/[id]/activity/page.tsx
import { getEngagementTimeline } from "@/lib/queries";
import { ActivityList } from "@/components/client/activity-list";

export default async function ActivityTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const timeline = await getEngagementTimeline(id);
  return <ActivityList entries={timeline} />;
}
```

Repeat pattern for `actions`, `tasks`, `files`, `invoices`, `notes` — each page imports the relevant query and renders an existing sub-component from `client-detail-view.tsx` (extract as part of Task 10).

Commit after layout + 7 page files land:
```bash
git add apps/internal/src/app/\(app\)/clients/\[id\]
git commit -m "feat(internal/engagement): restructure routes as tabbed shell"
```

---

### Task 9: Overview tab (extract from existing ClientDetailView)

**Files:**
- Modify: `apps/internal/src/app/(app)/clients/[id]/page.tsx` (becomes the Overview)
- Modify: `apps/internal/src/components/client/client-detail-view.tsx` (slim to Overview-only)

The existing `client-detail-view.tsx` renders the whole detail page. Extract the "Overview" portion (engagement fields, stage, value, primary contact) into an `Overview` component, and wire it into `page.tsx`. Everything else moves to the tab pages in Task 10.

If the existing `ClientDetailView` has internal tab state, preserve the overview fields but drop the tab switcher — the URL-backed `EntityTabs` at the layout level replaces it.

Commit:
```bash
git add apps/internal/src/app/\(app\)/clients/\[id\]/page.tsx apps/internal/src/components/client/client-detail-view.tsx
git commit -m "feat(internal/engagement): migrate overview to shell's default tab"
```

---

### Task 10: Remaining tabs (Activity, Next Actions, Tasks, Files, Invoices, Notes)

For each tab, the page component:
1. Reads `{ id }` from params
2. Calls the relevant query
3. Renders an existing sub-component (or a new thin one if no existing component exists)

Tabs and their queries (all exist in `queries.ts` already):

| Tab | Query | Reused component |
|---|---|---|
| Activity | `getEngagementTimeline(id)` | Extract from `client-detail-view.tsx` |
| Next Actions | `getEngagementActions(id)` | Extract from `client-detail-view.tsx` |
| Tasks | `getTasks()` filtered by `engagementId` | Task list sub-component |
| Files | `getFilesForEngagement(id)` — add if missing | Simple list |
| Invoices | `getInvoicesByEngagement(id)` (added in Task 7) | Simple list with status badges |
| Notes | Re-use interactions filtered by type=`note` | Existing note renderer |

Each tab gets one commit:
```bash
git add apps/internal/src/app/\(app\)/clients/\[id\]/<tab>/page.tsx
git commit -m "feat(internal/engagement): add <tab> tab"
```

---

### Task 11: Slim `client-detail-view.tsx`

Most of the existing component becomes dead code once tabs are independent routes. Remove:
- Internal tab switcher state
- Per-tab renderers (now live in their respective pages)

Keep only the Overview content used by the default route. If the file is tiny after this, rename it to `overview.tsx` (under `components/client/`) for clarity.

Commit:
```bash
git add apps/internal/src/components/client/
git commit -m "refactor(internal/client): slim client-detail-view to overview-only"
```

---

### Task 12: Smoke pass

Checklist (run in dev server):

- [ ] Visit `/clients/<any-id>` — shows Overview with breadcrumb, header, tabs, right rail
- [ ] Click each tab — URL updates, content swaps, breadcrumb updates with tab name
- [ ] Click "Log interaction" — form opens inline, submitting adds to Activity tab
- [ ] Click overflow → "Add next action" — form opens, creates action
- [ ] Right rail: click Company, primary contact, a project, an invoice — each routes correctly
- [ ] Breadcrumb last segment shows company name (not UUID) on all tabs
- [ ] Refresh page on a tab (e.g. `/clients/xxx/activity`) — shell re-renders correctly

If anything breaks, file a follow-up fix task with specifics. Do not mask failures.

Final cleanup commit (if needed):
```bash
git add -A
git commit -m "fix(internal/engagement): smoke-test fixes"
```

---

## Self-Review

**Spec coverage (Section 3):**
- Breadcrumb at top of main, entity-name resolution — Task 2 ✓
- Header with title, subtitle, primary CTA, overflow — Task 3 ✓
- 7 tabs (Overview, Activity, Next Actions, Tasks, Files, Invoices, Notes) — Tasks 8–10 ✓
- Right rail with linked entities (Company, Primary Contact, other Contacts, Projects, Open Invoices) — Task 5 ✓
- URL-backed tabs — Task 4 ✓
- Data loading: header + right rail from a single loader with cache; each tab loads its own — Tasks 7, 8 ✓
- Q1 entity-name resolver with React cache — Task 1 ✓
- Q2 right rail `unstable_cache` 30s TTL — Task 7 ✓
- Q4 breadcrumb placement inside main — Task 6 ✓

**Known deferrals:**
- Project + Contact shells (Plan 3)
- Pin/Unpin quick-action — stub in overflow until Plan 5 wires `user_pins`
- Archive quick-action — stub or hide until server action exists
- Files tab — depends on whether `getFilesForEngagement` exists. If no file storage is live yet, tab shows empty state.

**Placeholder scan:** No TBDs. Every task has concrete code or file paths.

**Type consistency:** `RightRailData` defined in Task 5 and consumed in Tasks 6, 7. `Tab` type defined in Task 4 and consumed in Tasks 6, 8. `resolveEntityLabel` defined in Task 1 and consumed in Task 2.

**Risk callouts:**
- Task 8's `x-pathname` header pattern requires middleware cooperation. If adapting isn't straightforward, switch to a client-side `usePathname()` wrapper passed into `Breadcrumbs` as a prop. This may require making `Breadcrumbs` a client component (and pre-fetching entity labels via a different path).
- Task 11 (slimming `client-detail-view.tsx`) may touch more code than expected if the existing component is tangled. If it grows unwieldy, stop and file a refactor task separately.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-engagement-shell.md`.**

Run with `superpowers:subagent-driven-development` once Plan 1 (palette) is merged to main — this plan imports `PaletteInlineForm` and the inline-create server actions from the palette code.
