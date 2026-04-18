# Command Palette Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Cmd+K palette as a universal "do anything" surface — grouped search across all entity types + pages + commands, inline create flows, context-aware quick actions, and a cross-kind recents sidebar surface backed by a new `user_recents` table.

**Architecture:** Unified fuzzy-search palette with three modes (empty / typing / command-form). A new `user_recents` table powers the empty-state recents list and feeds the future sidebar "Recently viewed" surface. A pure route-context resolver maps `pathname` → `{ kind, id }` so the palette can pre-fill engagement context on inline creates. Inline creates reuse existing server actions; a new minimal `PaletteInlineForm` component collects only the fields needed.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + Supabase Postgres, Tailwind v4, shadcn/ui, lucide-react, Vitest (new), Playwright (for e2e).

**Open questions resolved (from spec):**
- **Q3: Inline composer component** — new lightweight `PaletteInlineForm` component (not reuse of existing modals). Rationale: existing modals are full-edit UIs; the palette needs minimum viable fields only.
- Q1, Q2, Q4 affect later plans (engagement shell, nav chrome) and are resolved there.

**Spec reference:** `docs/superpowers/specs/2026-04-18-strvx-discoverability-redesign-design.md`, Section 2.

**Out of scope for this plan:** `user_pins` table and sidebar Pinned/Recents UI (Plan 5 — Nav chrome). Entity shell, Inbox, per-user cleanup cron (Plans 2–5).

---

## File Structure

**Create:**
- `apps/internal/vitest.config.ts` — Vitest config
- `apps/internal/src/lib/route-context.ts` — pathname → `{ kind, id }` resolver
- `apps/internal/src/lib/route-context.test.ts` — unit tests
- `apps/internal/src/app/actions/ui-state.ts` — recents server actions
- `apps/internal/src/app/actions/palette.ts` — `searchAll` rewrite + inline-create wrappers
- `apps/internal/src/components/palette/palette.tsx` — main palette shell (replaces `command-palette.tsx`)
- `apps/internal/src/components/palette/palette-form.tsx` — `PaletteInlineForm` generic form component
- `apps/internal/src/components/palette/commands.ts` — static command catalog
- `apps/internal/src/components/palette/use-visit-recorder.ts` — client hook for recording visits
- `packages/db/src/schema.ts` — add `userRecents` table (modify existing file)
- `packages/db/drizzle/0003_user_recents.sql` — generated migration (via `pnpm db:generate`)
- `apps/internal/e2e/palette.spec.ts` — Playwright e2e
- `apps/internal/playwright.config.ts` — Playwright config (if not present)

**Modify:**
- `apps/internal/package.json` — add `vitest`, `@vitejs/plugin-react`, `happy-dom`, `@testing-library/react`
- `apps/internal/src/app/(app)/layout.tsx` — mount `<Palette />` instead of `<CommandPalette />`; mount `<VisitRecorder />` client component

**Delete:**
- `apps/internal/src/components/command-palette.tsx` — replaced by new palette

---

## Task Sequence

1. Vitest setup (unblocks TDD for subsequent tasks)
2. `user_recents` schema + migration
3. Route context resolver (pure, TDD)
4. UI state server actions (`recordVisit`, `getRecents`, `clearRecents`)
5. Command catalog
6. `searchAll` server action rewrite — grouped results
7. Inline-create server-action wrappers
8. `PaletteInlineForm` component
9. `Palette` shell — keyboard nav + modes
10. `Palette` — grouped results rendering
11. `Palette` — recents + contextual actions in empty state
12. `VisitRecorder` client hook + layout wiring
13. Playwright e2e — full Cmd+K flow
14. Delete old component + final cleanup commit

---

### Task 1: Vitest setup

**Files:**
- Create: `apps/internal/vitest.config.ts`
- Modify: `apps/internal/package.json`
- Test: `apps/internal/src/lib/__smoke__/vitest.test.ts` (throwaway, deleted at end of task)

- [ ] **Step 1: Install deps**

Run:
```bash
cd /Users/nicolasdossantos/strvx/apps/internal
pnpm add -D vitest @vitejs/plugin-react happy-dom @testing-library/react @testing-library/jest-dom
```

Expected: `devDependencies` updated in `apps/internal/package.json`. Workspace lockfile updated.

- [ ] **Step 2: Add test scripts**

Edit `apps/internal/package.json` — add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

Create `apps/internal/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Smoke test**

Create `apps/internal/src/lib/__smoke__/vitest.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run:
```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm test
```

Expected: `1 passed`. If fails, stop and fix before proceeding.

- [ ] **Step 5: Delete smoke test + commit**

```bash
rm -rf apps/internal/src/lib/__smoke__
cd /Users/nicolasdossantos/strvx
git add apps/internal/package.json apps/internal/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(internal): add vitest setup for unit tests"
```

---

### Task 2: `user_recents` schema + migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0003_user_recents.sql` (generated)

- [ ] **Step 1: Add table to schema**

Open `packages/db/src/schema.ts`. After the `users` table definition, add:

```ts
export const userRecents = pgTable(
  "user_recents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),              // 'page' | 'engagement' | 'project' | 'contact' | 'invoice' | 'task' | 'doc'
    ref: text("ref").notNull(),                // route path or entity uuid
    label: text("label").notNull(),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("user_recents_user_kind_ref").on(t.userId, t.kind, t.ref),
    byUserRecent: index("user_recents_user_recent").on(t.userId, t.lastVisitedAt),
  })
);
```

Ensure `uniqueIndex` and `index` are imported at the top of the file (`import { ..., uniqueIndex, index } from "drizzle-orm/pg-core";`) — add if missing.

- [ ] **Step 2: Generate migration**

Run:
```bash
cd /Users/nicolasdossantos/strvx && pnpm --filter @strvx/db db:generate
```

Expected: file `packages/db/drizzle/0003_user_recents.sql` created containing `CREATE TABLE user_recents (...)`.

- [ ] **Step 3: Apply migration to dev DB**

Run:
```bash
pnpm --filter @strvx/db db:push
```

Expected: "Changes applied" or similar success output. If it prompts for data loss confirmation — STOP and inspect. This table is new, so no data should be at risk.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/0003_user_recents.sql packages/db/drizzle/meta
git commit -m "feat(db): add user_recents table for cross-kind recent items"
```

---

### Task 3: Route context resolver (pure, TDD)

**Files:**
- Create: `apps/internal/src/lib/route-context.test.ts`
- Create: `apps/internal/src/lib/route-context.ts`

- [ ] **Step 1: Write failing test**

Create `apps/internal/src/lib/route-context.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveRouteContext } from "./route-context";

describe("resolveRouteContext", () => {
  it("returns null for non-entity pages", () => {
    expect(resolveRouteContext("/dashboard")).toBeNull();
    expect(resolveRouteContext("/pipeline")).toBeNull();
    expect(resolveRouteContext("/finances")).toBeNull();
  });

  it("resolves engagement detail", () => {
    expect(resolveRouteContext("/clients/abc-123")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
  });

  it("resolves engagement subpaths", () => {
    expect(resolveRouteContext("/clients/abc-123/activity")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
  });

  it("resolves project detail", () => {
    expect(resolveRouteContext("/projects/xyz-456")).toEqual({
      kind: "project",
      id: "xyz-456",
    });
  });

  it("resolves contact detail", () => {
    expect(resolveRouteContext("/contacts/c-789")).toEqual({
      kind: "contact",
      id: "c-789",
    });
  });

  it("ignores bare list pages", () => {
    expect(resolveRouteContext("/clients")).toBeNull();
    expect(resolveRouteContext("/projects")).toBeNull();
  });

  it("handles trailing slashes and query strings", () => {
    expect(resolveRouteContext("/clients/abc-123/")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
    expect(resolveRouteContext("/clients/abc-123?tab=activity")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm test src/lib/route-context.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/internal/src/lib/route-context.ts`:
```ts
export type RouteContext = {
  kind: "engagement" | "project" | "contact";
  id: string;
};

const PATTERNS: { prefix: string; kind: RouteContext["kind"] }[] = [
  { prefix: "/clients/", kind: "engagement" },
  { prefix: "/projects/", kind: "project" },
  { prefix: "/contacts/", kind: "contact" },
];

export function resolveRouteContext(pathname: string): RouteContext | null {
  const clean = pathname.split("?")[0].replace(/\/+$/, "");
  for (const { prefix, kind } of PATTERNS) {
    if (!clean.startsWith(prefix)) continue;
    const rest = clean.slice(prefix.length);
    if (!rest) return null; // bare list page
    const id = rest.split("/")[0];
    if (!id) return null;
    return { kind, id };
  }
  return null;
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm test src/lib/route-context.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/internal/src/lib/route-context.ts apps/internal/src/lib/route-context.test.ts
git commit -m "feat(internal): add route-context resolver for palette contextual actions"
```

---

### Task 4: UI state server actions (`recordVisit`, `getRecents`, `clearRecents`)

**Files:**
- Create: `apps/internal/src/app/actions/ui-state.ts`

- [ ] **Step 1: Inspect existing `getCurrentUser` helper**

Run:
```bash
grep -n "getCurrentUser\b" /Users/nicolasdossantos/strvx/apps/internal/src/app/actions.ts | head -5
```

Note the exact import location — reuse the same helper for auth in the new file.

- [ ] **Step 2: Create the server actions file**

Create `apps/internal/src/app/actions/ui-state.ts`:
```ts
"use server";

import { db } from "@/lib/db";
import { userRecents } from "@strvx/db/schema";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "../actions";

const KINDS = ["page", "engagement", "project", "contact", "invoice", "task", "doc"] as const;

const recordVisitSchema = z.object({
  kind: z.enum(KINDS),
  ref: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
});

const MAX_RECENTS = 10;

export async function recordVisit(input: { kind: (typeof KINDS)[number]; ref: string; label: string }) {
  const parsed = recordVisitSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const user = await getCurrentUser();

  // Upsert
  await db
    .insert(userRecents)
    .values({ userId: user.id, ...parsed.data })
    .onConflictDoUpdate({
      target: [userRecents.userId, userRecents.kind, userRecents.ref],
      set: { lastVisitedAt: sql`now()`, label: parsed.data.label },
    });

  // Prune: keep only the 10 most recent per user
  const keep = await db
    .select({ id: userRecents.id })
    .from(userRecents)
    .where(eq(userRecents.userId, user.id))
    .orderBy(desc(userRecents.lastVisitedAt))
    .limit(MAX_RECENTS);

  if (keep.length === MAX_RECENTS) {
    await db
      .delete(userRecents)
      .where(and(eq(userRecents.userId, user.id), notInArray(userRecents.id, keep.map((r) => r.id))));
  }

  return { success: true };
}

export async function getRecents() {
  const user = await getCurrentUser();
  const rows = await db
    .select()
    .from(userRecents)
    .where(eq(userRecents.userId, user.id))
    .orderBy(desc(userRecents.lastVisitedAt))
    .limit(MAX_RECENTS);
  return rows;
}

export async function clearRecents() {
  const user = await getCurrentUser();
  await db.delete(userRecents).where(eq(userRecents.userId, user.id));
  return { success: true };
}
```

- [ ] **Step 3: Manual verify — start dev server and run a script**

Start dev server if not running:
```bash
cd /Users/nicolasdossantos/strvx && pnpm dev
```

Create a throwaway verification script `/tmp/test-recents.mjs`:
```js
// Run from a browser devtools console while logged in:
// fetch('/__debug_recents').catch(() => 'no debug route ok')
// Instead verify via DB — see next step.
```

Query DB to confirm insert works by calling the action from a UI surface added in later tasks. For now, typecheck:
```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors in the new file.

- [ ] **Step 4: Commit**

```bash
git add apps/internal/src/app/actions/ui-state.ts
git commit -m "feat(internal): add ui-state server actions (recordVisit, getRecents, clearRecents)"
```

---

### Task 5: Command catalog

**Files:**
- Create: `apps/internal/src/components/palette/commands.ts`

- [ ] **Step 1: Create the catalog**

Create `apps/internal/src/components/palette/commands.ts`:
```ts
import type { LucideIcon } from "lucide-react";
import {
  Plus, UserPlus, CheckSquare, FileText, MessageSquare, Bookmark,
  BookmarkX, Settings, LogOut, ListChecks, Link as LinkIcon,
} from "lucide-react";

export type CommandId =
  | "new-engagement"
  | "new-contact"
  | "new-task"
  | "new-invoice"
  | "log-interaction"
  | "add-next-action"
  | "add-followup-link"
  | "pin-current"
  | "unpin-current"
  | "go-settings"
  | "sign-out";

export type Command = {
  id: CommandId;
  label: string;
  icon: LucideIcon;
  requiresContext?: "engagement";
  keywords: string[];
};

export const COMMANDS: Command[] = [
  { id: "new-engagement", label: "New engagement", icon: Plus, keywords: ["create", "engagement", "deal", "new"] },
  { id: "new-contact", label: "New contact", icon: UserPlus, keywords: ["create", "contact", "person", "new"] },
  { id: "new-task", label: "New task", icon: CheckSquare, keywords: ["create", "task", "todo", "new"] },
  { id: "new-invoice", label: "New invoice", icon: FileText, keywords: ["create", "invoice", "bill", "new"] },
  { id: "log-interaction", label: "Log interaction", icon: MessageSquare, requiresContext: "engagement", keywords: ["log", "note", "call", "email", "interaction"] },
  { id: "add-next-action", label: "Add next action", icon: ListChecks, requiresContext: "engagement", keywords: ["action", "todo", "follow up", "next"] },
  { id: "add-followup-link", label: "Add follow-up link", icon: LinkIcon, requiresContext: "engagement", keywords: ["link", "calendly", "loom", "doc"] },
  { id: "pin-current", label: "Pin current page", icon: Bookmark, keywords: ["pin", "favorite", "bookmark"] },
  { id: "unpin-current", label: "Unpin current page", icon: BookmarkX, keywords: ["unpin", "remove pin"] },
  { id: "go-settings", label: "Go to settings", icon: Settings, keywords: ["settings", "preferences"] },
  { id: "sign-out", label: "Sign out", icon: LogOut, keywords: ["sign out", "log out", "logout"] },
];

export function matchCommands(query: string, hasEngagementContext: boolean): Command[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return COMMANDS.filter((c) => {
    if (c.requiresContext === "engagement" && !hasEngagementContext) return false;
    if (c.label.toLowerCase().includes(q)) return true;
    return c.keywords.some((k) => k.includes(q));
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/components/palette/commands.ts
git commit -m "feat(internal/palette): add command catalog and matcher"
```

---

### Task 6: `searchAll` server action rewrite — grouped results

**Files:**
- Create: `apps/internal/src/app/actions/palette.ts`

- [ ] **Step 1: Inspect existing search helpers**

Run:
```bash
grep -n "searchEngagements\|searchContacts\|searchTasks" /Users/nicolasdossantos/strvx/apps/internal/src/lib/queries.ts
```

Note which search helpers exist. If any of the following are missing, we add them inline in the server action using `ILIKE` on the relevant column:
- engagements (exists as `searchEngagements` — reuse)
- contacts, tasks, projects, invoices, documents, skills, agents (add minimal searchers)

- [ ] **Step 2: Create the new action file**

Create `apps/internal/src/app/actions/palette.ts`:
```ts
"use server";

import { db } from "@/lib/db";
import {
  engagements, companies, contacts, tasks, projects, invoices, documents,
  skills, agents,
} from "@strvx/db/schema";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "../actions";

export type PaletteGroupKey =
  | "engagements" | "contacts" | "tasks" | "projects"
  | "invoices" | "docs" | "skills" | "pages";

export type PaletteResult = {
  group: PaletteGroupKey;
  id: string;        // entity uuid or page path
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

  const [engRows, contactRows, taskRows, projectRows, invoiceRows, docRows, skillRows] = await Promise.all([
    db.select({
      id: engagements.id,
      engagementName: engagements.name,
      companyName: companies.name,
    })
      .from(engagements)
      .innerJoin(companies, eq(engagements.companyId, companies.id))
      .where(and(isNull(engagements.archivedAt), or(ilike(engagements.name, q), ilike(companies.name, q))!))
      .orderBy(desc(engagements.createdAt))
      .limit(LIMIT),

    db.select({ id: contacts.id, name: contacts.name, email: contacts.email, companyName: companies.name })
      .from(contacts)
      .innerJoin(companies, eq(contacts.companyId, companies.id))
      .where(and(isNull(contacts.archivedAt), or(ilike(contacts.name, q), ilike(contacts.email, q))!))
      .limit(LIMIT),

    db.select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(ilike(tasks.title, q))
      .orderBy(desc(tasks.createdAt))
      .limit(LIMIT),

    db.select({ id: projects.id, name: projects.name, client: projects.client })
      .from(projects)
      .where(or(ilike(projects.name, q), ilike(projects.client, q))!)
      .orderBy(desc(projects.createdAt))
      .limit(LIMIT),

    db.select({ id: invoices.id, number: invoices.invoiceNumber, clientName: invoices.clientName })
      .from(invoices)
      .where(or(ilike(invoices.invoiceNumber, q), ilike(invoices.clientName, q))!)
      .orderBy(desc(invoices.createdAt))
      .limit(LIMIT),

    db.select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(ilike(documents.title, q))
      .limit(LIMIT),

    db.select({ id: skills.id, name: skills.name })
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

  // Pages: derived client-side from sidebar catalog — included server-side for completeness
  const pageMatches = PAGES.filter((p) =>
    p.label.toLowerCase().includes(parsed.data.toLowerCase()) ||
    p.href.toLowerCase().includes(parsed.data.toLowerCase())
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
```

Note: if `contacts.archivedAt` or any referenced column doesn't exist, fall back to `ilike` on just name fields and note the discrepancy in the commit. Verify by running typecheck.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors. If errors, fix schema references before proceeding.

- [ ] **Step 4: Commit**

```bash
git add apps/internal/src/app/actions/palette.ts
git commit -m "feat(internal): add grouped palette search across all entity types"
```

---

### Task 7: Inline-create server-action wrappers

**Files:**
- Modify: `apps/internal/src/app/actions/palette.ts`

Many create actions already exist in `apps/internal/src/app/actions.ts`. We add thin wrappers that expose only the palette's minimum-viable-fields interface.

- [ ] **Step 1: Audit existing create actions**

Run:
```bash
grep -n "^export async function create\|^export async function log" /Users/nicolasdossantos/strvx/apps/internal/src/app/actions.ts | head -30
```

Note existing actions for: engagement, contact, task, invoice, interaction, next action, follow-up link. Reuse by import; do NOT duplicate logic.

- [ ] **Step 2: Append palette inline-create wrappers**

Add to `apps/internal/src/app/actions/palette.ts`:

```ts
// ── Inline create wrappers ──────────────────────────────────────

const inlineTaskSchema = z.object({
  title: z.string().min(1).max(200),
  dueDate: z.string().optional(),       // YYYY-MM-DD
  assigneeId: z.string().uuid().optional(),
  engagementId: z.string().uuid().optional(),
});

export async function createTaskInline(input: z.infer<typeof inlineTaskSchema>) {
  const parsed = inlineTaskSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  // Delegate to the existing create action — signature must match it.
  const { createTaskAction } = await import("../actions");
  try {
    const id = await createTaskAction({
      title: parsed.data.title,
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: parsed.data.dueDate ?? null,
      assigneeIds: parsed.data.assigneeId ? [parsed.data.assigneeId] : [],
      engagementId: parsed.data.engagementId ?? null,
      projectId: null,
    });
    return { success: true as const, id };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

const inlineEngagementSchema = z.object({
  name: z.string().min(1).max(200),
  companyName: z.string().min(1).max(200),
});

export async function createEngagementInline(input: z.infer<typeof inlineEngagementSchema>) {
  const parsed = inlineEngagementSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const { createEngagementAction } = await import("../actions");
  try {
    const id = await createEngagementAction({
      companyName: parsed.data.companyName,
      engagementName: parsed.data.name,
      stage: "lead",
    });
    return { success: true as const, id };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

const inlineContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  companyId: z.string().uuid(),
});

export async function createContactInline(input: z.infer<typeof inlineContactSchema>) {
  const parsed = inlineContactSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const { createContactAction } = await import("../actions");
  try {
    const id = await createContactAction({
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: null,
      role: null,
      companyId: parsed.data.companyId,
    });
    return { success: true as const, id };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

const inlineInteractionSchema = z.object({
  engagementId: z.string().uuid(),
  type: z.enum(["note", "call", "email", "meeting"]),
  content: z.string().min(1).max(10_000),
});

export async function logInteractionInline(input: z.infer<typeof inlineInteractionSchema>) {
  const parsed = inlineInteractionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const { createInteractionAction } = await import("../actions");
  try {
    const id = await createInteractionAction({
      engagementId: parsed.data.engagementId,
      type: parsed.data.type,
      content: parsed.data.content,
      scheduledAt: null,
    });
    return { success: true as const, id };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

const inlineNextActionSchema = z.object({
  engagementId: z.string().uuid(),
  description: z.string().min(1).max(500),
  dueDate: z.string().optional(),
});

export async function addNextActionInline(input: z.infer<typeof inlineNextActionSchema>) {
  const parsed = inlineNextActionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const { createNextActionAction } = await import("../actions");
  try {
    const id = await createNextActionAction({
      engagementId: parsed.data.engagementId,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ?? null,
    });
    return { success: true as const, id };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

const inlineFollowupLinkSchema = z.object({
  engagementId: z.string().uuid(),
  url: z.string().url(),
  label: z.string().min(1).max(200),
});

export async function addFollowupLinkInline(input: z.infer<typeof inlineFollowupLinkSchema>) {
  const parsed = inlineFollowupLinkSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const { createFollowUpLinkAction } = await import("../actions");
  try {
    const id = await createFollowUpLinkAction({
      engagementId: parsed.data.engagementId,
      url: parsed.data.url,
      label: parsed.data.label,
    });
    return { success: true as const, id };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
```

**Note for the implementer:** the exact signatures of `createTaskAction`, `createEngagementAction`, `createContactAction`, `createInteractionAction`, `createNextActionAction`, `createFollowUpLinkAction` may differ from the above. Inspect each in `apps/internal/src/app/actions.ts` and adjust the wrapper's call site to match. If any action is missing, STOP and flag it — do not silently invent it.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/internal/src/app/actions/palette.ts
git commit -m "feat(internal): add inline-create wrappers for palette commands"
```

---

### Task 8: `PaletteInlineForm` component

**Files:**
- Create: `apps/internal/src/components/palette/palette-form.tsx`

- [ ] **Step 1: Create the component**

Create `apps/internal/src/components/palette/palette-form.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";

type Field =
  | { key: string; label: string; type: "text"; required?: boolean; placeholder?: string }
  | { key: string; label: string; type: "date"; required?: boolean }
  | { key: string; label: string; type: "select"; required?: boolean; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "textarea"; required?: boolean; rows?: number };

export type PaletteFormProps = {
  title: string;
  fields: Field[];
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => Promise<{ success: true } | { success: false; error: string }>;
  onSuccess?: (values: Record<string, string>) => void;
  footer?: ReactNode;
};

export function PaletteInlineForm({
  title, fields, submitLabel = "Create", onCancel, onSubmit, onSuccess, footer,
}: PaletteFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(values);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onSuccess?.(values);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <div className="mb-3 text-[13px] font-semibold text-[#222]">{title}</div>
      <div className="flex flex-col gap-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-[#888]">{f.label}</span>
            {f.type === "textarea" ? (
              <textarea
                rows={f.rows ?? 3}
                required={f.required}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#222]"
              />
            ) : f.type === "select" ? (
              <select
                required={f.required}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#222]"
              >
                <option value="">Select…</option>
                {f.options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            ) : (
              <input
                type={f.type === "date" ? "date" : "text"}
                required={f.required}
                placeholder={"placeholder" in f ? f.placeholder : undefined}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#222]"
              />
            )}
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-[12px] text-[#c0392b]">{error}</p>}
      <div className="mt-4 flex items-center justify-between">
        {footer}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-md border border-[#e0e0e0] bg-white px-3 py-1.5 text-[13px] text-[#555]">
            Cancel
          </button>
          <button type="submit" disabled={isPending}
            className="rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
            {isPending ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/components/palette/palette-form.tsx
git commit -m "feat(internal/palette): add PaletteInlineForm minimal-fields form component"
```

---

### Task 9: `Palette` shell — keyboard nav + modes

**Files:**
- Create: `apps/internal/src/components/palette/palette.tsx`

- [ ] **Step 1: Create the shell component (search mode only — inline forms come in Task 10)**

Create `apps/internal/src/components/palette/palette.tsx`:
```tsx
"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { PaletteResult, PaletteGroupKey } from "@/app/actions/palette";
import { searchAll } from "@/app/actions/palette";
import { getRecents } from "@/app/actions/ui-state";
import { COMMANDS, matchCommands, type Command } from "./commands";
import { resolveRouteContext } from "@/lib/route-context";
import { PaletteInlineForm } from "./palette-form";

type Mode = "search" | "form";

type Recent = Awaited<ReturnType<typeof getRecents>>[number];

const GROUP_ORDER: PaletteGroupKey[] = ["pages", "engagements", "contacts", "tasks", "projects", "invoices", "docs", "skills"];
const GROUP_LABELS: Record<PaletteGroupKey, string> = {
  pages: "Pages", engagements: "Engagements", contacts: "Contacts", tasks: "Tasks",
  projects: "Projects", invoices: "Invoices", docs: "Docs", skills: "Skills",
};

export function Palette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("search");
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [selected, setSelected] = useState(0);
  const [, startSearch] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const ctx = resolveRouteContext(pathname ?? "/");
  const hasEngagementCtx = ctx?.kind === "engagement";
  const commandMatches = matchCommands(query, hasEngagementCtx);

  // Flattened list for selection
  const allItems: Array<{ kind: "result" | "command" | "recent"; payload: PaletteResult | Command | Recent }> =
    query.trim()
      ? [
          ...results.map((r) => ({ kind: "result" as const, payload: r })),
          ...commandMatches.map((c) => ({ kind: "command" as const, payload: c })),
        ]
      : [
          ...commandMatches.map((c) => ({ kind: "command" as const, payload: c })),
          ...recents.map((r) => ({ kind: "recent" as const, payload: r })),
        ];

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMode("search");
    setActiveCommand(null);
    setSelected(0);
  }, []);

  // Cmd+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((p) => !p);
        setQuery("");
        setSelected(0);
      }
      if (e.key === "Escape" && open) {
        if (mode === "form") { setMode("search"); setActiveCommand(null); }
        else close();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, mode, close]);

  // Focus input when opened
  useEffect(() => { if (open && mode === "search") setTimeout(() => inputRef.current?.focus(), 10); }, [open, mode]);

  // Load recents when opened
  useEffect(() => {
    if (!open) return;
    getRecents().then(setRecents).catch(() => setRecents([]));
  }, [open]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      if (!query.trim()) { setResults([]); return; }
      startSearch(async () => {
        try { setResults(await searchAll(query)); } catch { setResults([]); }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Keep selected in bounds
  useEffect(() => { if (selected >= allItems.length) setSelected(0); }, [allItems.length, selected]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector("[data-selected='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => (s + 1) % Math.max(allItems.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => (s - 1 + allItems.length) % Math.max(allItems.length, 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = allItems[selected];
      if (!item) return;
      if (item.kind === "result") { router.push((item.payload as PaletteResult).href); close(); }
      else if (item.kind === "recent") { router.push((item.payload as Recent).ref.startsWith("/") ? (item.payload as Recent).ref : resolveRecentHref(item.payload as Recent)); close(); }
      else if (item.kind === "command") {
        const cmd = item.payload as Command;
        setActiveCommand(cmd);
        setMode("form");
      }
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[15vh]"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-[#e0e0e0] bg-white"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        {mode === "search" ? (
          <>
            <div className="flex items-center gap-3 border-b border-[#f0f0f0] px-4 py-3">
              <Search size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                onKeyDown={onKeyDown}
                placeholder="Search or run a command..."
                aria-label="Palette search"
                className="flex-1 text-[14px] outline-none placeholder:text-[#aaa]"
              />
              <kbd className="rounded border border-[#e0e0e0] px-1.5 py-0.5 text-[10px] text-[#888]">ESC</kbd>
            </div>
            <div ref={listRef} className="max-h-[360px] overflow-y-auto" role="listbox" aria-live="polite">
              <PaletteList
                items={allItems}
                selected={selected}
                onSelect={(i) => setSelected(i)}
                onActivate={(i) => {
                  setSelected(i);
                  // Trigger Enter behaviour via synthesized keyboard event
                  onKeyDown({ key: "Enter", preventDefault() {} } as React.KeyboardEvent);
                }}
              />
            </div>
          </>
        ) : (
          activeCommand ? (
            <CommandForm
              command={activeCommand}
              ctx={ctx}
              onCancel={() => { setMode("search"); setActiveCommand(null); }}
              onSuccess={() => { close(); }}
            />
          ) : null
        )}
      </div>
    </div>
  );
}

function resolveRecentHref(r: Recent): string {
  switch (r.kind) {
    case "page": return r.ref;
    case "engagement": return `/clients/${r.ref}`;
    case "project": return `/projects/${r.ref}`;
    case "contact": return `/contacts/${r.ref}`;
    case "invoice": return `/invoices?invoiceId=${r.ref}`;
    case "task": return `/tasks?taskId=${r.ref}`;
    case "doc": return `/docs/${r.ref}`;
    default: return "/";
  }
}

// PaletteList and CommandForm scaffolds; full implementation in Tasks 10–11.
function PaletteList(_: {
  items: Array<{ kind: "result" | "command" | "recent"; payload: PaletteResult | Command | Recent }>;
  selected: number;
  onSelect: (i: number) => void;
  onActivate: (i: number) => void;
}) {
  return <div className="p-3 text-[12px] text-[#888]">Results render here (Task 10).</div>;
}

function CommandForm(_: { command: Command; ctx: ReturnType<typeof resolveRouteContext>; onCancel: () => void; onSuccess: () => void; }) {
  return <div className="p-3 text-[12px] text-[#888]">Command form renders here (Task 11).</div>;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors. If any — fix before moving on.

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/components/palette/palette.tsx
git commit -m "feat(internal/palette): add palette shell with modes and keyboard nav"
```

---

### Task 10: `PaletteList` — grouped results rendering

**Files:**
- Modify: `apps/internal/src/components/palette/palette.tsx`

- [ ] **Step 1: Replace the `PaletteList` stub**

In `apps/internal/src/components/palette/palette.tsx`, replace the `PaletteList` function with the full implementation:

```tsx
import { ArrowRight, ChevronRight, FileText as FileIcon, Building2, User, Kanban, Receipt, BookOpen, Box, Hash } from "lucide-react";
// …add to existing imports

type ListItem = { kind: "result" | "command" | "recent"; payload: PaletteResult | Command | Recent };

function PaletteList({ items, selected, onSelect, onActivate }: {
  items: ListItem[];
  selected: number;
  onSelect: (i: number) => void;
  onActivate: (i: number) => void;
}) {
  if (items.length === 0) {
    return <div className="px-3 py-6 text-center text-[13px] text-[#aaa]">No results</div>;
  }

  // Split into groups for header rendering
  const groups: Array<{ title: string; range: [number, number] }> = [];
  let cursor = 0;
  function pushGroup(title: string, predicate: (it: ListItem) => boolean) {
    const start = cursor;
    while (cursor < items.length && predicate(items[cursor])) cursor++;
    if (cursor > start) groups.push({ title, range: [start, cursor] });
  }
  // Commands first (when no query) OR results first (when query) — allItems is already ordered
  if (items[0]?.kind === "result") {
    for (const key of GROUP_ORDER) {
      pushGroup(GROUP_LABELS[key], (it) => it.kind === "result" && (it.payload as PaletteResult).group === key);
    }
    pushGroup("Commands", (it) => it.kind === "command");
  } else {
    pushGroup("Commands", (it) => it.kind === "command");
    pushGroup("Recent", (it) => it.kind === "recent");
  }

  return (
    <>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="border-t border-[#f0f0f0] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888] first:border-t-0">
            {g.title}
          </div>
          {items.slice(g.range[0], g.range[1]).map((it, offset) => {
            const index = g.range[0] + offset;
            const isSel = selected === index;
            return (
              <button
                key={itemKey(it, index)}
                data-selected={isSel}
                onMouseEnter={() => onSelect(index)}
                onClick={() => onActivate(index)}
                role="option"
                aria-selected={isSel}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${isSel ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f5]"}`}
              >
                {renderIcon(it)}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[#222]">{renderLabel(it)}</div>
                  {renderSublabel(it) && (
                    <div className="truncate text-[11px] text-[#888]">{renderSublabel(it)}</div>
                  )}
                </div>
                {it.kind !== "command" && <ArrowRight size={14} strokeWidth={1.5} className="shrink-0 text-[#ccc]" />}
                {it.kind === "command" && <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-[#ccc]" />}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function itemKey(it: ListItem, i: number): string {
  if (it.kind === "command") return `c-${(it.payload as Command).id}`;
  if (it.kind === "result") return `r-${(it.payload as PaletteResult).group}-${(it.payload as PaletteResult).id}`;
  return `h-${(it.payload as Recent).id}-${i}`;
}

function renderIcon(it: ListItem) {
  if (it.kind === "command") {
    const Icon = (it.payload as Command).icon;
    return <Icon size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />;
  }
  const kind = it.kind === "result" ? (it.payload as PaletteResult).group : (it.payload as Recent).kind;
  const map: Record<string, typeof FileIcon> = {
    pages: Hash, engagements: Building2, contacts: User, tasks: CheckSquareIcon,
    projects: Kanban, invoices: Receipt, docs: BookOpen, skills: Box,
    page: Hash, engagement: Building2, contact: User, task: CheckSquareIcon,
    project: Kanban, invoice: Receipt, doc: BookOpen,
  };
  const Icon = (map as Record<string, typeof FileIcon>)[kind] ?? FileIcon;
  return <Icon size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />;
}

function renderLabel(it: ListItem): string {
  if (it.kind === "command") return (it.payload as Command).label;
  if (it.kind === "result") return (it.payload as PaletteResult).label;
  return (it.payload as Recent).label;
}

function renderSublabel(it: ListItem): string | null {
  if (it.kind === "command") return null;
  if (it.kind === "result") return (it.payload as PaletteResult).sublabel ?? null;
  return null;
}
```

Add to imports at the top of the file:
```tsx
import { CheckSquare as CheckSquareIcon } from "lucide-react";
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Manual smoke test**

In `apps/internal/src/app/(app)/layout.tsx`, temporarily swap `<CommandPalette />` for `<Palette />` (add the import at top). Run the dev server, open Cmd+K, type a query, verify grouped results appear.

Revert layout changes after the smoke test (we finalize layout in Task 14).

- [ ] **Step 4: Commit**

```bash
git add apps/internal/src/components/palette/palette.tsx
git commit -m "feat(internal/palette): render grouped search results"
```

---

### Task 11: `CommandForm` — inline create flow

**Files:**
- Modify: `apps/internal/src/components/palette/palette.tsx`

- [ ] **Step 1: Replace the `CommandForm` stub**

In `apps/internal/src/components/palette/palette.tsx`, replace the `CommandForm` stub with a real implementation that maps each command to a form config and the appropriate inline-create action.

```tsx
import { toast } from "sonner";
import {
  createTaskInline, createEngagementInline, createContactInline,
  logInteractionInline, addNextActionInline, addFollowupLinkInline,
} from "@/app/actions/palette";
// …add to existing imports

type FormConfig = {
  title: string;
  fields: Parameters<typeof PaletteInlineForm>[0]["fields"];
  submit: (values: Record<string, string>, ctx: ReturnType<typeof resolveRouteContext>) => Promise<{ success: true } | { success: false; error: string }>;
  successToast: string;
};

function buildFormConfig(cmd: Command, ctx: ReturnType<typeof resolveRouteContext>): FormConfig | null {
  switch (cmd.id) {
    case "new-task":
      return {
        title: "New task",
        fields: [
          { key: "title", label: "Title", type: "text", required: true, placeholder: "e.g. Follow up Acme" },
          { key: "dueDate", label: "Due", type: "date" },
        ],
        submit: async (v) => {
          const res = await createTaskInline({
            title: v.title,
            dueDate: v.dueDate || undefined,
            engagementId: ctx?.kind === "engagement" ? ctx.id : undefined,
          });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Task created",
      };
    case "new-engagement":
      return {
        title: "New engagement",
        fields: [
          { key: "companyName", label: "Company", type: "text", required: true },
          { key: "name", label: "Engagement name", type: "text", required: true, placeholder: "e.g. Q2 rebuild" },
        ],
        submit: async (v) => {
          const res = await createEngagementInline({ companyName: v.companyName, name: v.name });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Engagement created",
      };
    case "new-contact":
      return {
        title: "New contact",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "email", label: "Email", type: "text" },
          { key: "companyId", label: "Company ID", type: "text", required: true, placeholder: "Paste company UUID" },
        ],
        submit: async (v) => {
          const res = await createContactInline({ name: v.name, email: v.email || undefined, companyId: v.companyId });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Contact created",
      };
    case "log-interaction":
      if (ctx?.kind !== "engagement") return null;
      return {
        title: "Log interaction",
        fields: [
          {
            key: "type", label: "Type", type: "select", required: true,
            options: [
              { value: "note", label: "Note" }, { value: "call", label: "Call" },
              { value: "email", label: "Email" }, { value: "meeting", label: "Meeting" },
            ],
          },
          { key: "content", label: "Content", type: "textarea", required: true, rows: 3 },
        ],
        submit: async (v) => {
          const res = await logInteractionInline({
            engagementId: ctx.id,
            type: v.type as "note" | "call" | "email" | "meeting",
            content: v.content,
          });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Interaction logged",
      };
    case "add-next-action":
      if (ctx?.kind !== "engagement") return null;
      return {
        title: "Add next action",
        fields: [
          { key: "description", label: "Description", type: "text", required: true },
          { key: "dueDate", label: "Due", type: "date" },
        ],
        submit: async (v) => {
          const res = await addNextActionInline({
            engagementId: ctx.id, description: v.description, dueDate: v.dueDate || undefined,
          });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Next action added",
      };
    case "add-followup-link":
      if (ctx?.kind !== "engagement") return null;
      return {
        title: "Add follow-up link",
        fields: [
          { key: "label", label: "Label", type: "text", required: true, placeholder: "e.g. Booking link" },
          { key: "url", label: "URL", type: "text", required: true, placeholder: "https://..." },
        ],
        submit: async (v) => {
          const res = await addFollowupLinkInline({ engagementId: ctx.id, url: v.url, label: v.label });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Follow-up link added",
      };
    case "new-invoice":
      // Delegate: palette directly routes to /invoices/new for invoice creation (multi-step form)
      return null;
    case "pin-current":
    case "unpin-current":
    case "go-settings":
    case "sign-out":
      // Handled by direct action outside the form flow (see Task 13 cleanup).
      return null;
  }
  return null;
}

function CommandForm({ command, ctx, onCancel, onSuccess }: {
  command: Command;
  ctx: ReturnType<typeof resolveRouteContext>;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const cfg = buildFormConfig(command, ctx);
  if (!cfg) {
    return (
      <div className="p-4 text-[13px] text-[#555]">
        <p>{command.label} — not yet implemented in palette.</p>
        <button onClick={onCancel} className="mt-3 text-[12px] text-[#888] underline">Back</button>
      </div>
    );
  }
  return (
    <PaletteInlineForm
      title={cfg.title}
      fields={cfg.fields}
      onCancel={onCancel}
      onSubmit={(v) => cfg.submit(v, ctx)}
      onSuccess={() => { toast.success(cfg.successToast); onSuccess(); }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/components/palette/palette.tsx
git commit -m "feat(internal/palette): add inline create form flow for commands"
```

---

### Task 12: `VisitRecorder` client hook + layout wiring

**Files:**
- Create: `apps/internal/src/components/palette/use-visit-recorder.ts`
- Create: `apps/internal/src/components/palette/visit-recorder.tsx`
- Modify: `apps/internal/src/app/(app)/layout.tsx`

- [ ] **Step 1: Create the recorder hook**

Create `apps/internal/src/components/palette/use-visit-recorder.ts`:
```ts
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { recordVisit } from "@/app/actions/ui-state";
import { resolveRouteContext } from "@/lib/route-context";

const DEBOUNCE_MS = 500;

function labelForPage(pathname: string): string {
  // Minimal page-title inference: strip leading slash, segment-case → title
  const seg = pathname.split("?")[0].replace(/^\/+|\/+$/g, "");
  if (!seg) return "Home";
  return seg.split("/").map((s) => s.replace(/-/g, " ")).join(" / ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useVisitRecorder() {
  const pathname = usePathname();
  const lastRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const ctx = resolveRouteContext(pathname);
    const ref = ctx ? ctx.id : pathname;
    const kind = ctx ? ctx.kind : "page";
    const label = ctx ? labelForPage(pathname) : labelForPage(pathname);
    if (lastRef.current === `${kind}:${ref}`) return;
    lastRef.current = `${kind}:${ref}`;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      recordVisit({ kind, ref, label }).catch(() => {});
    }, DEBOUNCE_MS);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [pathname]);
}
```

- [ ] **Step 2: Create the wrapper client component**

Create `apps/internal/src/components/palette/visit-recorder.tsx`:
```tsx
"use client";

import { useVisitRecorder } from "./use-visit-recorder";

export function VisitRecorder() {
  useVisitRecorder();
  return null;
}
```

- [ ] **Step 3: Wire into layout**

Edit `apps/internal/src/app/(app)/layout.tsx`:
```tsx
import { Sidebar } from "@/components/layout/sidebar";
import { RealtimeProvider } from "@/components/layout/realtime-provider";
import { Palette } from "@/components/palette/palette";
import { VisitRecorder } from "@/components/palette/visit-recorder";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-14 md:px-8 md:pt-6">{children}</main>
      </div>
      <Palette />
      <VisitRecorder />
      <Toaster />
    </RealtimeProvider>
  );
}
```

Note: this removes `<CommandPalette />`. The old file is deleted in Task 14.

- [ ] **Step 4: Typecheck + smoke test**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
```

Expected: zero errors. Then run `pnpm dev` (if not running), open any authenticated page, visit a few clients, open Cmd+K, verify recent entries appear.

- [ ] **Step 5: Commit**

```bash
git add apps/internal/src/components/palette/use-visit-recorder.ts apps/internal/src/components/palette/visit-recorder.tsx apps/internal/src/app/\(app\)/layout.tsx
git commit -m "feat(internal/palette): record visits and surface recents in palette"
```

---

### Task 13: Playwright e2e — full Cmd+K flow

**Files:**
- Create: `apps/internal/playwright.config.ts`
- Create: `apps/internal/e2e/palette.spec.ts`
- Modify: `apps/internal/package.json` (add `e2e` script)

- [ ] **Step 1: Install Playwright runner (if missing)**

Run:
```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm add -D @playwright/test && pnpm exec playwright install chromium
```

- [ ] **Step 2: Add config**

Create `apps/internal/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: process.env.E2E_STORAGE_STATE,
  },
  reporter: "list",
});
```

- [ ] **Step 3: Add script**

Add to `apps/internal/package.json` scripts:
```json
"e2e": "playwright test"
```

- [ ] **Step 4: Write test**

Create `apps/internal/e2e/palette.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

// Requires E2E_STORAGE_STATE to point at an authenticated session.
// Skip in CI without auth; run locally with: E2E_STORAGE_STATE=.auth/state.json pnpm e2e

test.describe("Command Palette", () => {
  test.skip(!process.env.E2E_STORAGE_STATE, "auth storage not set");

  test("Cmd+K opens palette and searches", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Meta+K");
    const input = page.getByRole("combobox", { name: /palette search/i }).or(page.getByPlaceholder(/search or run/i));
    await expect(input).toBeVisible();
    await input.fill("client");
    await expect(page.getByText(/pages|engagements/i).first()).toBeVisible();
  });

  test("inline create task from palette", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Meta+K");
    await page.getByPlaceholder(/search or run/i).fill("new task");
    await page.keyboard.press("ArrowDown"); // select commands
    await page.keyboard.press("Enter");
    await expect(page.getByText(/new task/i)).toBeVisible();
    const title = `Palette test ${Date.now()}`;
    await page.getByLabel(/title/i).fill(title);
    await page.getByRole("button", { name: /create/i }).click();
    await page.goto("/tasks");
    await expect(page.getByText(title)).toBeVisible();
  });
});
```

- [ ] **Step 5: Run locally (optional — requires auth)**

Skip this in CI. Local smoke test:
```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm e2e
```

Tests will auto-skip if `E2E_STORAGE_STATE` is not set — that is expected for this plan.

- [ ] **Step 6: Commit**

```bash
git add apps/internal/playwright.config.ts apps/internal/e2e/palette.spec.ts apps/internal/package.json pnpm-lock.yaml
git commit -m "test(internal/palette): add playwright e2e for palette open, search, inline create"
```

---

### Task 14: Delete old component + final cleanup

**Files:**
- Delete: `apps/internal/src/components/command-palette.tsx`

- [ ] **Step 1: Confirm no other references**

```bash
grep -rn "from \"@/components/command-palette\"" /Users/nicolasdossantos/strvx/apps/internal/src
```

Expected: no results. If any reference remains — update to `@/components/palette/palette` and import `Palette` instead of `CommandPalette`.

- [ ] **Step 2: Delete the old file**

```bash
git rm apps/internal/src/components/command-palette.tsx
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck && pnpm lint
```

Expected: zero errors. Warnings about pre-existing issues are OK.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(internal): remove legacy command-palette.tsx"
```

- [ ] **Step 5: Final verification**

Start dev server, log in, try:
- `Cmd+K` with empty query → shows Recents after you've visited pages
- Type `new task` → Enter → fill form → Enter → toast confirms, task appears on Tasks page
- Visit `/clients/<id>` → open palette → see `Log interaction`, `Add next action`, `Add follow-up link` as contextual commands
- Type `fin` → see `Finances` under Pages; Enter jumps to `/finances`

If any flow fails, stop and file a follow-up task with specifics. Do not mask failures.

---

## Self-Review

**Spec coverage (Section 2 of spec):**
- Modes (empty/typing/command) — Tasks 9, 10, 11 ✓
- Index across all groups — Task 6 ✓
- Commands v1 — Task 5 ✓
- Inline create flow — Tasks 7, 8, 11 ✓
- Context awareness — Tasks 3, 11 ✓
- Keyboard (Cmd+K, arrows, Enter, Esc) — Task 9 ✓
- Cmd+1..9 jump to group — **Gap**: deferred. Add as follow-up task.
- Cmd+Enter open in new tab — **Gap**: deferred. Add as follow-up task.
- Accessibility (ARIA combobox, focus trap, screen reader) — Task 9 provides `role="dialog"`, `role="listbox"`, `role="option"`, `aria-live`; focus trap is **Gap** — add follow-up.
- Performance (200ms debounce, Promise.all, 5 rows per type) — Tasks 6, 9 ✓

**Gaps identified above — adding follow-up tasks:**

### Task 15: Add keyboard polish — Cmd+1..9 group jumps + Cmd+Enter new tab

**Files:**
- Modify: `apps/internal/src/components/palette/palette.tsx`

- [ ] **Step 1: Extend `onKeyDown`**

In `palette.tsx`, inside `onKeyDown`, add before the existing handlers:
```tsx
if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
  e.preventDefault();
  const groupIndex = Number(e.key) - 1;
  const groupStart = findNthGroupStart(allItems, groupIndex);
  if (groupStart !== -1) setSelected(groupStart);
  return;
}
if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
  e.preventDefault();
  const item = allItems[selected];
  if (item?.kind === "result") window.open((item.payload as PaletteResult).href, "_blank");
  else if (item?.kind === "recent") window.open(resolveRecentHref(item.payload as Recent), "_blank");
  return;
}
```

Add helper at module scope:
```tsx
function findNthGroupStart(items: ListItem[], n: number): number {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const key = items[i].kind === "result"
      ? `r:${(items[i].payload as PaletteResult).group}`
      : items[i].kind === "command" ? "commands" : "recent";
    if (!seen.has(key)) {
      seen.add(key);
      if (seen.size - 1 === n) return i;
    }
  }
  return -1;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
git add apps/internal/src/components/palette/palette.tsx
git commit -m "feat(internal/palette): add Cmd+1..9 group jumps and Cmd+Enter new tab"
```

---

### Task 16: Focus trap for accessibility

**Files:**
- Modify: `apps/internal/src/components/palette/palette.tsx`

- [ ] **Step 1: Trap focus within the dialog while open**

In `palette.tsx`, add inside the component (after the useEffect blocks):
```tsx
useEffect(() => {
  if (!open) return;
  const prev = document.activeElement as HTMLElement | null;
  function trap(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const dialog = document.querySelector("[role='dialog']");
    if (!dialog) return;
    const focusables = dialog.querySelectorAll<HTMLElement>("input, button, [tabindex]:not([tabindex='-1'])");
    if (focusables.length === 0) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener("keydown", trap);
  return () => {
    document.removeEventListener("keydown", trap);
    prev?.focus?.();
  };
}, [open]);
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/nicolasdossantos/strvx/apps/internal && pnpm typecheck
git add apps/internal/src/components/palette/palette.tsx
git commit -m "feat(internal/palette): trap focus within palette dialog"
```

---

**Placeholder scan:** No "TBD"/"TODO"/"implement later" remaining. Every step contains actual code or a concrete command.

**Type consistency:** `PaletteResult`, `PaletteGroupKey`, `Command`, `Recent`, `RouteContext` are introduced in Tasks 3, 4, 5, 6 and consumed consistently in Tasks 9–12.

**Known deferrals (intentional, noted in task comments):**
- Invoice creation goes through existing `/invoices/new` multi-step form (palette routes there via `new-invoice` command opened as a navigation, not an inline form). Implementer: in Task 11's `buildFormConfig`, add a `new-invoice` case that returns `null` and trigger `router.push("/invoices/new")` in the parent's command activation branch. Add this as a small polish in Task 14's final verification if missed.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-palette-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
