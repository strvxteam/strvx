# Navigation Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Layer "Pinned" and "Recently viewed" surfaces onto the existing sidebar, make them user-manageable, and add global breadcrumbs inside `main`. Completes the personalization layer described in the spec.

**Architecture:** `user_pins` table added (similar shape to `user_recents` from Plan 1). Two server actions (`pinItem`, `unpinItem`, `reorderPins`) + two small UI surfaces in the existing sidebar. Breadcrumbs component already created in Plan 2 — this plan mounts it globally inside `(app)/layout.tsx` so it renders on every route, and fixes the middleware/header wiring so pathname is reliably available.

**Tech Stack:** Drizzle, Tailwind v4, shadcn/ui (for drag-reorder consider `@dnd-kit/sortable` which may already be installed from the Pipeline board). Reuses `resolveEntityLabel` from Plan 2.

**Spec reference:** `docs/superpowers/specs/2026-04-18-strvx-discoverability-redesign-design.md` Section 1 and Section 5.

**Prerequisites:**
- Plan 1 (Palette) — provides `recordVisit` / `getRecents` (already DB-backed), the commands `Pin current page` / `Unpin current page` (already defined in the catalog but currently no-op; this plan wires them up)
- Plan 2 (Engagement shell) — provides `resolveEntityLabel` and the `Breadcrumbs` component (reused for global mounting)

---

## File Structure

**Create:**
- `packages/db/drizzle/0004_user_pins.sql` — migration
- `apps/internal/src/app/actions/ui-state.ts` — **extend** with `pinItem`, `unpinItem`, `reorderPins`, `getPins`
- `apps/internal/src/components/layout/pinned-section.tsx` — sidebar Pinned list
- `apps/internal/src/components/layout/recents-section.tsx` — sidebar Recents list
- `apps/internal/src/components/layout/sidebar-breadcrumbs.tsx` — client wrapper that reads `usePathname()` and passes into the server `Breadcrumbs` (resolves the middleware-header brittleness)
- `apps/internal/src/app/api/cleanup/ui-state/route.ts` — nightly cron to prune dead refs

**Modify:**
- `packages/db/src/schema.ts` — add `userPins` table definition
- `apps/internal/src/components/layout/sidebar.tsx` — mount `PinnedSection` above nav sections, `RecentsSection` below
- `apps/internal/src/app/(app)/layout.tsx` — mount `SidebarBreadcrumbs` inside `<main>` above `{children}`
- `apps/internal/src/components/palette/palette.tsx` — wire `pin-current` / `unpin-current` commands (they currently render a "not implemented" placeholder)
- `apps/internal/vercel.json` — add cron for `/api/cleanup/ui-state`

---

## Task Sequence

1. `user_pins` table + migration + schema definition
2. Extend `ui-state.ts` server actions
3. `PinnedSection` component
4. `RecentsSection` component
5. Mount both in `sidebar.tsx`
6. `SidebarBreadcrumbs` client wrapper
7. Mount breadcrumbs in `(app)/layout.tsx`
8. Wire pin/unpin commands in palette
9. Cleanup cron route + vercel.json
10. Smoke pass

---

### Task 1: `user_pins` table

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0004_user_pins.sql` (via direct SQL apply, same pattern as Plan 1's 0003)

Schema:

```ts
export const userPins = pgTable(
  "user_pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    ref: text("ref").notNull(),
    label: text("label").notNull(),
    iconKey: text("icon_key").notNull().default(""),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("user_pins_user_kind_ref").on(t.userId, t.kind, t.ref),
    byUserPos: index("user_pins_user_position").on(t.userId, t.position),
  })
);
```

Migration SQL (copy the pattern from `0003_user_recents.sql`):

```sql
CREATE TABLE IF NOT EXISTS "user_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "ref" text NOT NULL,
  "label" text NOT NULL,
  "icon_key" text NOT NULL DEFAULT '',
  "position" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_pins_user_kind_ref" ON "user_pins"("user_id", "kind", "ref");
CREATE INDEX IF NOT EXISTS "user_pins_user_position" ON "user_pins"("user_id", "position");
```

Apply directly via postgres-js (same technique as Plan 1's Task 2) because drizzle-kit meta remains out of sync.

Commit: `feat(db): add user_pins table`

---

### Task 2: Extend `ui-state.ts` server actions

**File:** `apps/internal/src/app/actions/ui-state.ts`

Append to the existing file:

```ts
import { userPins } from "@strvx/db/schema";
// ... existing imports

const MAX_PINS = 8;

const pinItemSchema = z.object({
  kind: z.enum(KINDS),
  ref: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  iconKey: z.string().max(60).optional(),
});

export type UserPin = {
  id: string;
  kind: UserRecentKind;
  ref: string;
  label: string;
  iconKey: string;
  position: number;
};

export async function pinItem(input: z.infer<typeof pinItemSchema>) {
  const parsed = pinItemSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const user = await getCurrentUser();

  // Check cap
  const existing = await db.select({ id: userPins.id }).from(userPins).where(eq(userPins.userId, user.id));
  if (existing.length >= MAX_PINS) {
    return { success: false as const, error: `Max ${MAX_PINS} pins. Unpin something first.` };
  }

  const nextPos = existing.length;
  try {
    await db.insert(userPins).values({
      userId: user.id,
      kind: parsed.data.kind,
      ref: parsed.data.ref,
      label: parsed.data.label,
      iconKey: parsed.data.iconKey ?? "",
      position: nextPos,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("user_pins_user_kind_ref")) {
      return { success: false as const, error: "Already pinned" };
    }
    throw err;
  }
  return { success: true as const };
}

export async function unpinItem(input: { kind: UserRecentKind; ref: string }) {
  const user = await getCurrentUser();
  await db.delete(userPins).where(and(
    eq(userPins.userId, user.id),
    eq(userPins.kind, input.kind),
    eq(userPins.ref, input.ref),
  ));
  return { success: true as const };
}

export async function reorderPins(orderedIds: string[]) {
  const user = await getCurrentUser();
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(userPins).set({ position: i }).where(and(eq(userPins.userId, user.id), eq(userPins.id, orderedIds[i])));
    }
  });
  return { success: true as const };
}

export async function getPins(): Promise<UserPin[]> {
  const user = await getCurrentUser();
  const rows = await db.select().from(userPins).where(eq(userPins.userId, user.id)).orderBy(userPins.position);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as UserRecentKind,
    ref: r.ref,
    label: r.label,
    iconKey: r.iconKey,
    position: r.position,
  }));
}
```

Commit: `feat(internal): add pin/unpin/reorderPins server actions`

---

### Task 3: `PinnedSection` component

**File:** `apps/internal/src/components/layout/pinned-section.tsx`

Client component that fetches pins on mount and renders them. Drag-reorder via `@dnd-kit` if already installed (check `package.json`); otherwise MVP is plain list with unpin buttons.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkX } from "lucide-react";
import { getPins, unpinItem, type UserPin } from "@/app/actions/ui-state";

export function PinnedSection({ collapsed }: { collapsed: boolean }) {
  const [pins, setPins] = useState<UserPin[]>([]);

  useEffect(() => {
    getPins().then(setPins).catch(() => setPins([]));
  }, []);

  if (pins.length === 0) return null;

  return (
    <div className="mb-3">
      {!collapsed && (
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#999]">
          Pinned
        </div>
      )}
      {pins.map((p) => (
        <div key={p.id} className="group flex items-center gap-2 px-2">
          <Link
            href={resolvePinHref(p)}
            className="flex-1 rounded-md px-2 py-1.5 text-[13px] text-[#333] hover:bg-[#f0f0f0]"
          >
            {collapsed ? p.label.slice(0, 1) : p.label}
          </Link>
          {!collapsed && (
            <button
              onClick={async () => {
                await unpinItem({ kind: p.kind, ref: p.ref });
                setPins((prev) => prev.filter((x) => x.id !== p.id));
              }}
              aria-label={`Unpin ${p.label}`}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <BookmarkX size={12} className="text-[#999] hover:text-[#c0392b]" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function resolvePinHref(p: UserPin): string {
  switch (p.kind) {
    case "page": return p.ref;
    case "engagement": return `/clients/${p.ref}`;
    case "project": return `/projects/${p.ref}`;
    case "contact": return `/contacts/${p.ref}`;
    case "invoice": return `/invoices?invoiceId=${p.ref}`;
    case "task": return `/tasks?taskId=${p.ref}`;
    case "doc": return `/docs/${p.ref}`;
    default: return "/";
  }
}
```

Drag-reorder is a follow-up if `@dnd-kit/sortable` isn't installed — MVP ships with "delete + repin" as the reorder mechanism.

Commit: `feat(internal/sidebar): add Pinned section`

---

### Task 4: `RecentsSection` component

**File:** `apps/internal/src/components/layout/recents-section.tsx`

Same shape as `PinnedSection`, reads from `getRecents`. Max 10 items. No unpin button — recents rotate automatically.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRecents, type UserRecent } from "@/app/actions/ui-state";

export function RecentsSection({ collapsed }: { collapsed: boolean }) {
  const [recents, setRecents] = useState<UserRecent[]>([]);

  useEffect(() => {
    getRecents().then(setRecents).catch(() => setRecents([]));
  }, []);

  if (recents.length === 0) return null;

  return (
    <div className="mt-auto mb-2 border-t border-[#f0f0f0] pt-3">
      {!collapsed && (
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#999]">
          Recent
        </div>
      )}
      {recents.slice(0, collapsed ? 5 : 10).map((r) => (
        <Link
          key={r.id}
          href={resolveRecentHref(r)}
          className="block truncate rounded-md px-3 py-1 text-[12px] text-[#555] hover:bg-[#f0f0f0] hover:text-[#222]"
          title={r.label}
        >
          {collapsed ? r.label.slice(0, 1) : r.label}
        </Link>
      ))}
    </div>
  );
}

function resolveRecentHref(r: UserRecent): string {
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
```

Commit: `feat(internal/sidebar): add Recents section`

---

### Task 5: Mount in `sidebar.tsx`

Find the main `<nav>` block in `apps/internal/src/components/layout/sidebar.tsx`. Wrap it:

- Before `<nav>`: `<PinnedSection collapsed={collapsed} />`
- Replace the current mt-auto Sign-out block pattern — move Sign-out further down so Recents sits above it:

```tsx
<nav>...existing...</nav>
<RecentsSection collapsed={collapsed} />
<div className="border-t border-[#e8e8e8] px-2 pt-3"><SignOutButton /></div>
```

Adjust the outer `<aside>` to use `flex flex-col h-full` so Recents can push to bottom with `mt-auto` on its own.

Commit: `feat(internal/sidebar): mount Pinned and Recents sections`

---

### Task 6: `SidebarBreadcrumbs` client wrapper

**File:** `apps/internal/src/components/layout/sidebar-breadcrumbs.tsx`

Plan 2's `Breadcrumbs` is a server component that takes a `pathname` prop. Mounting it globally via the layout is tricky because the layout doesn't have the current pathname server-side without middleware cooperation. This client wrapper reads `usePathname()` and passes it to a server-side `Breadcrumbs` via a server action or a thin `"use server"` wrapper.

Simplest approach: make Breadcrumbs a **client** component that:
1. Reads `usePathname()`
2. Fetches entity labels client-side via a server action `getEntityLabelAction(kind, id)` called for each entity-typed segment
3. Caches the labels in a `useRef` map to avoid re-fetching on every render

Alternative: keep Breadcrumbs server-side but avoid header-dependency by making the layout read the URL from a cookie that middleware sets. More plumbing.

**MVP:** Client-side version for simplicity.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { resolveRouteContext } from "@/lib/route-context";
import { resolveEntityLabelAction } from "@/app/actions/ui-state"; // new client-friendly action

export function SidebarBreadcrumbs() {
  const pathname = usePathname() ?? "/";
  const [crumbs, setCrumbs] = useState<{ label: string; href?: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const segs = pathname.split("?")[0].split("/").filter(Boolean);
      const out: { label: string; href?: string }[] = [];
      let href = "";
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        href += "/" + seg;
        if (i === 0) {
          const label = labelForTopLevel(seg);
          if (label) { out.push({ label, href }); continue; }
        }
        const ctx = resolveRouteContext(href);
        if (ctx && ctx.id === seg) {
          const label = await resolveEntityLabelAction(ctx.kind, ctx.id);
          out.push({ label: label ?? seg, href });
          continue;
        }
        out.push({ label: titleCase(seg) });
      }
      if (!cancelled) setCrumbs(out);
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  if (crumbs.length === 0) return null;

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

function labelForTopLevel(seg: string): string | null {
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    clients: "Clients",
    contacts: "Contacts",
    projects: "Projects",
    tasks: "Tasks",
    finances: "Finances",
    invoices: "Invoices",
    calendar: "Calendar",
    goals: "Goals",
    docs: "Docs",
    assets: "Assets",
    skills: "Skills",
    development: "Development",
  };
  return map[seg] ?? null;
}

function titleCase(s: string): string {
  return s.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
```

Add `resolveEntityLabelAction` to `app/actions/ui-state.ts`:

```ts
import { resolveEntityLabel } from "@/lib/entity-label";

export async function resolveEntityLabelAction(kind: "engagement" | "project" | "contact", id: string): Promise<string | null> {
  await getCurrentUser(); // auth gate
  return resolveEntityLabel(kind, id);
}
```

Commit: `feat(internal/layout): add client-side global breadcrumbs`

---

### Task 7: Mount breadcrumbs in `(app)/layout.tsx`

**File:** `apps/internal/src/app/(app)/layout.tsx`

Add `<SidebarBreadcrumbs />` inside `<main>`, above `{children}`:

```tsx
<main className="flex-1 overflow-y-auto px-4 pb-24 pt-14 md:px-8 md:pt-6">
  <SidebarBreadcrumbs />
  {children}
</main>
```

Individual pages that already had their own page headers continue to work — breadcrumbs appear above them. Over time, page-level headers can be simplified since the breadcrumb carries context.

Commit: `feat(internal/layout): mount global breadcrumbs`

---

### Task 8: Wire pin/unpin palette commands

**File:** `apps/internal/src/components/palette/palette.tsx`

In `buildFormConfig`, replace the `case "pin-current":` and `case "unpin-current":` branches (they currently return `null`). For these two commands there's no form — the command executes immediately and closes the palette.

```tsx
case "pin-current": {
  // Execute and close — no form
  return null; // Actual execution happens in CommandForm wrapper; see below
}
```

Better: modify the Enter handler in the `Palette` main component. When the selected command is `pin-current` or `unpin-current`, execute it directly without transitioning to `form` mode:

```tsx
else if (item.kind === "command") {
  const cmd = item.payload as Command;
  if (cmd.id === "pin-current" || cmd.id === "unpin-current") {
    handleNoFormCommand(cmd, pathname).then(() => close());
    return;
  }
  setActiveCommand(cmd);
  setMode("form");
}
```

Where `handleNoFormCommand`:

```tsx
async function handleNoFormCommand(cmd: Command, pathname: string) {
  const ctx = resolveRouteContext(pathname);
  const kind = ctx ? ctx.kind : "page";
  const ref = ctx ? ctx.id : pathname;
  const label = inferLabel(pathname); // reuse labelForPage from useVisitRecorder or similar
  const iconKey = ctx ? ctx.kind : "Hash";
  if (cmd.id === "pin-current") {
    const res = await pinItem({ kind, ref, label, iconKey });
    if (res.success) toast.success("Pinned");
    else toast.error(res.error);
  } else if (cmd.id === "unpin-current") {
    const res = await unpinItem({ kind, ref });
    if (res.success) toast.success("Unpinned");
    else toast.error(res.error);
  }
}
```

Commit: `feat(internal/palette): wire pin/unpin commands against user_pins`

---

### Task 9: Cleanup cron + vercel.json

**File:** `apps/internal/src/app/api/cleanup/ui-state/route.ts`

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.UI_STATE_CLEANUP_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Delete recents/pins whose entity-typed ref points at a deleted/archived entity.
  // Page-typed rows are skipped (their ref is a route path, always valid).
  const deletedRecents = await db.execute(sql`
    DELETE FROM user_recents
    WHERE (kind = 'engagement' AND ref NOT IN (SELECT id::text FROM engagements WHERE archived_at IS NULL))
       OR (kind = 'project' AND ref NOT IN (SELECT id::text FROM projects))
       OR (kind = 'contact' AND ref NOT IN (SELECT id::text FROM contacts WHERE archived_at IS NULL))
       OR (kind = 'task' AND ref NOT IN (SELECT id::text FROM tasks))
       OR (kind = 'invoice' AND ref NOT IN (SELECT id::text FROM invoices))
  `);

  const deletedPins = await db.execute(sql`
    DELETE FROM user_pins
    WHERE (kind = 'engagement' AND ref NOT IN (SELECT id::text FROM engagements WHERE archived_at IS NULL))
       OR (kind = 'project' AND ref NOT IN (SELECT id::text FROM projects))
       OR (kind = 'contact' AND ref NOT IN (SELECT id::text FROM contacts WHERE archived_at IS NULL))
       OR (kind = 'task' AND ref NOT IN (SELECT id::text FROM tasks))
       OR (kind = 'invoice' AND ref NOT IN (SELECT id::text FROM invoices))
  `);

  return NextResponse.json({
    success: true,
    deletedRecents: deletedRecents.length ?? 0,
    deletedPins: deletedPins.length ?? 0,
  });
}
```

Add cron to `apps/internal/vercel.json`:

```json
{ "path": "/api/cleanup/ui-state?secret=${UI_STATE_CLEANUP_SECRET}", "schedule": "0 5 * * *" }
```

Commit: `feat(internal): add nightly cleanup cron for pins/recents`

---

### Task 10: Smoke pass

- [ ] `/` — breadcrumb appears at top of main content
- [ ] Visit `/clients/<id>` — breadcrumb shows "Clients / <Company Name>" (not UUID)
- [ ] Sidebar: Pinned section is empty initially; Recents populates after visiting a few pages
- [ ] Cmd+K → type "pin" → Enter → toast "Pinned" appears → sidebar shows the current page in Pinned
- [ ] Click X on a pin → it disappears
- [ ] Cmd+K → type "unpin" → Enter → toast "Unpinned"
- [ ] Pinned cap: try to pin a 9th item → toast with "Max 8 pins" error
- [ ] Cleanup cron: hit `/api/cleanup/ui-state?secret=<SECRET>` manually → JSON response with counts

---

## Self-Review

**Spec coverage (Sections 1 and 5):**
- Breadcrumbs global ✓ (Task 7)
- Pinned section (above sections) ✓ (Tasks 3, 5)
- Recents section (below sections) ✓ (Tasks 4, 5)
- Pin/unpin actions in 4 places: palette command (Task 8), sidebar X button (Task 3), page header ⋯ menu (NOT in this plan — follow-up), right-click nav item (NOT in this plan — follow-up)
- Pins ≤ 8 cap ✓ (Task 2)
- Recents ≤ 10 cap ✓ (already in Plan 1)
- Drag-reorder — stub (Task 3 notes `@dnd-kit` dependency check)
- Cleanup cron ✓ (Task 9)
- Data model: `user_pins` matches spec ✓

**Deferrals:**
- Drag-to-reorder pins (requires `@dnd-kit/sortable`; MVP ships with delete-and-repin)
- Page-header ⋯ menu pin button (requires touching every page's header; follow-up)
- Right-click context menu on sidebar items (follow-up; uncommon usage pattern)
- Entity-label resolution for non-engagement kinds in `resolveEntityLabelAction` — Plan 2's `resolveEntityLabel` supports all three kinds, this works as-is
- `dismissAlert` persistence from Plan 4 (Inbox) — add `dismissed_alerts` table if needed; separate follow-up

**Risks:**
- `SidebarBreadcrumbs` fires `resolveEntityLabelAction` per entity segment per pathname change — one additional roundtrip per navigation. Mitigate with an in-memory cache keyed on `(kind, id)` in the component. Flag if latency shows up.
- `getPins` runs client-side via server action — first render shows empty sidebar, then flashes to populated. Acceptable for MVP; defer SSR hydration to a follow-up.

---

## Execution Handoff

Run with `superpowers:subagent-driven-development` after Plan 2 (which provides `resolveEntityLabel` and the base `Breadcrumbs` component this plan mounts globally).

---

**End of plan series. All 5 plans now exist under `docs/superpowers/plans/`.**
