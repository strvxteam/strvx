# strvx Discoverability Redesign — Design Spec

**Date:** 2026-04-18
**Status:** Design approved, pending implementation plan
**Scope:** `apps/internal` (Next.js 16 App Router)

## Goal

Reduce clicks for common actions and preserve context when jumping between related entities. Serve two audiences simultaneously: the power-user (team of 2–5 today) and future hires/contractors who need to walk up and find things without a guided tour.

## Users and Pain Points

**Audience:** Small team today (Nick + Alex), plus future hires and contractors onboarding cold.

**Primary pain points (confirmed):**

1. **Too many clicks for common actions.** Creating tasks, logging interactions, updating engagement stages, adding contacts, and adding follow-up links all require multiple navigations and form pages.
2. **Context loss when jumping between related entities.** Navigating from a client to its projects to its invoices breaks the thread — each jump starts from a generic list view.

**Explicitly not in scope:** technical WCAG/a11y audit, time tracking, billing/invoicing redesign, dev-ops page redesign, skills/agents redesign.

## Design Overview

Five surfaces change. Five domains stay untouched.

**Changes:**

1. **Navigation chrome** — sidebar refinements + global breadcrumbs + pinned section + recently viewed
2. **Command palette (Cmd+K)** — universal entity index, page navigation, inline mutations, contextual actions
3. **Inbox** — replaces `/dashboard` with a three-section urgency-ordered work queue
4. **Entity Detail Shell** — unified tabbed layout with right-rail for engagements, projects, contacts
5. **Per-user state** — two new tables (`user_pins`, `user_recents`) supporting 1 and the palette

**No changes (this pass):**

- Finance pages (`/finances`, `/invoices`, `/expenses`, `/revenue`)
- Dev-ops pages (`/development/*`)
- Skills & agents (`/skills/*`)
- Knowledge (`/docs`, `/assets`)
- Page-level internals (forms, tables, editors)
- Existing routes — no deep links break

**Rollout order (independently shippable):**

1. Command palette (most self-contained, highest daily impact)
2. Entity Detail Shell for engagements
3. Entity Detail Shell for projects and contacts
4. Inbox (replaces dashboard)
5. Navigation chrome (breadcrumbs, pins, recents)
6. Per-user state tables land alongside the work that needs them (palette needs recents; nav needs pins)

---

## Section 1 — Navigation Chrome

Builds on the 5-section sidebar regroup that landed on 2026-04-18 (`Work`, `Sales`, `Finance`, `Development`, `Knowledge & Skills`).

### Breadcrumbs

- Rendered at the top of `main` (scrolls with content, not fixed)
- Auto-derived from route segments; entity UUIDs resolve to display names server-side and cache per request
- Every crumb except the last is a clickable `Link`
- Last crumb is the current page and is not a link
- Replaces inconsistent per-page headers where applicable

Examples:
- `/clients` → `Clients`
- `/clients/abc` → `Clients / Acme Corp`
- `/projects/xyz` → `Projects / Website Redesign`
- `/development/deployments` → `Development / Deployments`

### Pinned section (sidebar)

- Above sidebar sections, below the logo/header
- Stores up to 8 items per user
- Pins can be pages (`/finances`), entities (`engagement:abc`, `project:xyz`), or docs
- Pin action is exposed in four places:
  - Entity Detail Shell's "⋯" menu
  - Page headers' "⋯" menu (where a header exists)
  - Command palette ("Pin current page")
  - Right-click context menu on any sidebar item
- Drag-to-reorder
- Clicking a pinned entity goes to the entity shell; clicking a pinned page routes to it

### Recently viewed (sidebar)

- Below sections, above Sign out
- Auto-populated via `recordVisit(kind, ref, label)` server action
- Shows last 10 unique pages/entities, sorted by most recent visit
- Each item shows kind-appropriate icon
- Client-side debounce of 500ms; skips consecutive visits to the same ref

### Sidebar refinements

- Collapse toggle stays; when collapsed, Pinned and Recents become icon-only rows with tooltips
- Section auto-open logic stays (current behavior is correct)
- Mobile: same structure in the slide-over; Pinned and Recents render at the top for thumb-reach

### Files

- `apps/internal/src/components/layout/sidebar.tsx` — extend with Pinned + Recents slots
- `apps/internal/src/components/layout/breadcrumbs.tsx` — new
- `apps/internal/src/components/layout/ui-state-provider.tsx` — new, client provider that fetches pins/recents once and exposes mutation helpers

---

## Section 2 — Command Palette

The current palette (`apps/internal/src/components/command-palette.tsx`) searches only engagements + contacts and has three quick actions, two of which don't actually mutate. Rebuilt to become the primary "do anything" surface.

### Modes (unified fuzzy search — no prefixes)

1. **Empty query** — shows Recents (top 5 across all kinds) + context-aware quick actions
2. **Typing** — shows grouped results; max 5 per group
3. **Verb detected** — when the top match is a command, Enter morphs the palette into a minimal inline form

### Index (sources to search)

| Group | Fields searched |
|---|---|
| Engagements | `companies.name`, `engagements.name` |
| Contacts | `contacts.name`, `contacts.email`, joined `companies.name` |
| Tasks | `tasks.title` |
| Projects | `projects.name`, `projects.client` |
| Invoices | `invoices.invoice_number`, joined `companies.name` via engagement |
| Docs & Assets | `documents.title`, asset names |
| Skills & Agents | `skills.name`, `agents.name` |
| Pages | static list derived from sidebar `navSections` |
| Commands | static list (see below) |

Each group capped at 5 rows in SQL. Queries run in parallel via `Promise.all`. Uses `ILIKE '%query%'` on indexed columns; adds trigram or GIN indexes if query plans show sequential scans.

### Commands (v1)

- `New engagement`
- `New contact`
- `New task`
- `New invoice`
- `Log interaction` — contextual; pre-fills engagement when on an engagement page
- `Add next action` — contextual
- `Add follow-up link` — contextual
- `Pin current page` / `Unpin current page`
- `Go to settings`
- `Sign out`

Palette commands call the existing mutation server actions; this redesign does not change the underlying create flows, only how they're invoked.

### Inline create flow

Palette swaps to a 2–4 field form. Example: `New task` →

```
Title: ____________________________
Due:   [2026-04-22]  Assignee: [Me]
```

Submit (Enter or button) calls the existing server action, closes the palette, fires a Sonner toast. Esc returns to search mode (state preserved).

Engagement context is auto-filled if the user was on `/clients/[id]` or an engagement tab when Cmd+K was opened. The pathname → entity-type lookup lives in `apps/internal/src/lib/route-context.ts`.

### Keyboard

- `Cmd+K` — open/close
- `↑ ↓` — navigate · `Enter` — select · `Esc` — cancel/back
- `Cmd+1` through `Cmd+9` — jump to group
- `Cmd+Enter` — open in new tab (uses `router.push` with `target=_blank` semantics via `window.open`)

### Accessibility

- WAI-ARIA combobox pattern (`role="combobox"` on input, `role="listbox"` on results)
- Focus trap while open
- Screen reader announces result count on each query change

### Performance

- 200ms debounce on query changes
- `Promise.all` across groups, each query capped at 5 rows
- No full-table scans — indexed columns only
- Client-side fuzzy re-rank (cheap, not a new dependency — use existing `cmdk`/`sort`)

### Files

- `apps/internal/src/components/command-palette.tsx` — rewrite
- `apps/internal/src/app/actions/palette.ts` — new server actions (`searchAll`, `createInline`, `pinItem`, `unpinItem`, `recordVisit`)
- `apps/internal/src/lib/route-context.ts` — pathname → entity type/id resolver

---

## Section 3 — Entity Detail Shell

Unified layout for engagements, projects, contacts. Extensible to invoices/docs later.

### Anatomy

```
┌─ Breadcrumb ──────────────────────────────────────────────────┐
│  Clients / Acme Corp                                          │
├─ Header ──────────────────────────────────────────────────────┤
│  ● Acme Corp — Discovery Call            [Primary CTA]  [ ⋯ ] │
│    Building MVP · $24,000 · 70%                               │
├─ Tabs ────────────────────────┬─ Right rail ──────────────────┤
│  Overview  Activity  Actions  │  Company: Acme Corp           │
│  Tasks  Files  Invoices  Notes│  Contacts: Jane, Bob          │
│                               │  Projects: Website redesign   │
│  [Tab content fills rest]     │  Invoices: 2 open             │
│                               │  [Linked entities, clickable] │
└───────────────────────────────┴───────────────────────────────┘
```

### Tabs by entity type

| Entity | Tabs |
|---|---|
| Engagement | Overview · Activity · Next Actions · Tasks · Files · Invoices · Notes |
| Project | Overview · Activity · Tasks · Files · Invoices |
| Contact | Overview · Activity · Engagements · Tasks · Files |

Tab selection is URL-backed (`?tab=activity`) so state survives refresh and deep links.

### Header quick-actions

| Entity | Primary CTA | "⋯" menu |
|---|---|---|
| Engagement | Log interaction | Add next action · Add task · New invoice · Add follow-up link · Pin · Archive |
| Project | Add task | Link engagement · Upload file · Pin · Archive |
| Contact | Log interaction | Edit · Link to engagement · Pin |

Primary CTA opens a palette-style inline composer (same component the Cmd+K inline forms use).

### Right rail (context panel)

Persistent, entity-scoped, always visible on desktop.

| Shell | Right rail content |
|---|---|
| Engagement | Company · Primary Contact · other Contacts · linked Projects · open Invoices · recent Activity (last 3) |
| Project | Engagement · Client · Team · recent Activity (last 3) |
| Contact | Company · other Contacts at same company · current Engagements |

Every item clickable; clicks preserve context (breadcrumb updates, back-nav works).

Collapses to a drawer on narrow/mobile viewports.

### Data loading (perf-aware)

- Server component fetches header + right-rail data in parallel — small queries only
- Active tab's content is loaded via its own server action or a nested route segment — not all tabs eagerly
- Route segment pattern: `/clients/[id]/(shell)/page.tsx` for Overview, `.../activity/page.tsx`, `.../tasks/page.tsx` etc.
- Right rail cached for 30s via `unstable_cache` keyed on entity id

### Code consolidation

- `apps/internal/src/app/(app)/clients/[id]/page.tsx` becomes the engagement shell consumer
- New route `apps/internal/src/app/(app)/projects/[id]/` for project shell
- New route `apps/internal/src/app/(app)/contacts/[id]/` — contacts currently live as a modal in `/clients`; promoting to a route is a moderate lift but necessary for shell consistency
- Activity timeline component is reused (no rebuild)

### Files

- `apps/internal/src/components/shell/entity-shell.tsx` — new generic shell wrapper
- `apps/internal/src/components/shell/right-rail.tsx` — new
- `apps/internal/src/components/shell/tabs.tsx` — URL-backed tab bar
- `apps/internal/src/components/shell/quick-actions.tsx` — CTA + menu
- Route files above

---

## Section 4 — Inbox (Dashboard Replacement)

`/dashboard` becomes an actionable work queue. Every item has inline actions; users can triage without navigating elsewhere.

### Anatomy

```
┌─ Header ──────────────────────────────────────────────────┐
│  Good morning, Nick                          Sat Apr 18   │
├─ Metric strip (thin, reference-only) ─────────────────────┤
│  Revenue $X   MRR $X   Active Deals N   Outstanding $X    │
├─ Inbox sections ──────────────────────────────────────────┤
│  Do Today (12)                                            │
│    ☐ Overdue task — "Send proposal to Acme"          ⋯   │
│    ☐ Next action — "Follow up Acme (due today)"      ⋯   │
│    📅 10:00 AM — Weekly check-in (Meet link)          ⋯   │
│                                                           │
│  Needs Attention (4)                                      │
│    ⚠ Stale engagement — Acme Corp (no contact 9d)    ⋯   │
│    🔥 Deployment failed — custos main                ⋯   │
│                                                           │
│  Upcoming (8)                                    [expand] │
│    ☐ Task due Wed — "Draft Olivia contract"          ⋯   │
└───────────────────────────────────────────────────────────┘
```

### Sections (urgency-ordered, fixed order)

1. **Do Today** — overdue tasks, overdue next-actions, actions/tasks due today, today's meetings. Red-tinted if overdue.
2. **Needs Attention** — stale engagements (7+ days since last interaction), failed deployments, broken monitors, overdue invoices.
3. **Upcoming** — tasks/actions due this week. Collapsed by default; click header to expand.

Empty state per section: "All clear — nothing {needs action | overdue | due this week}."

### Inline actions

| Item type | Primary click | "⋯" menu |
|---|---|---|
| Task | Toggle done | Snooze · Reassign · Open |
| Next action | Toggle done | Edit due date · Open engagement |
| Stale engagement | Log interaction (inline composer, same component as palette) | Snooze 3d · Archive |
| Meeting | Open Meet link (if present) | View event |
| Alert (deploy/monitor/invoice) | View details | Dismiss |

### "Mine vs Team" toggle

Small chip in the header. Defaults to Mine. Team view shows everyone's items for small teams (you + Alex today).

### Cut from the current dashboard

- Mini kanban pipeline (duplicates `/pipeline`, 300px of vertical)
- Two-column "Needs Attention | Today" split — consolidated into single inbox

### Kept

- Greeting + date
- Metric strip (smaller, reference-only)

### Data

- Reuses `getAtRiskItems`, `getTasks`, `getPersonalCalendarEvents`
- New query for infrastructure alerts: pulls from `monitoredSites` + `uptimeChecks` (already in schema)
- All queries `Promise.all`; respects the `maxDuration = 60` and query limits added on 2026-04-18

### Files

- `apps/internal/src/app/(app)/dashboard/page.tsx` — rewrite
- `apps/internal/src/components/inbox/inbox-section.tsx` — new
- `apps/internal/src/components/inbox/item-row.tsx` — new
- `apps/internal/src/app/actions/inbox.ts` — snooze/dismiss/toggle server actions

---

## Section 5 — Per-user State (Pins + Recents)

Two small tables powering Nav chrome and Palette.

### Schema

```sql
user_pins
  id            uuid PK
  user_id       uuid FK users.id ON DELETE CASCADE
  kind          text        -- 'page' | 'engagement' | 'project' | 'contact' | 'invoice' | 'task' | 'doc'
  ref           text        -- route path (for 'page') or entity uuid
  label         text        -- cached display text
  icon_key      text        -- lucide icon name
  position      int         -- drag-to-reorder
  created_at    timestamptz DEFAULT now()
  UNIQUE(user_id, kind, ref)

user_recents
  id                uuid PK
  user_id           uuid FK users.id ON DELETE CASCADE
  kind              text
  ref               text
  label             text
  last_visited_at   timestamptz DEFAULT now()
  UNIQUE(user_id, kind, ref)
  INDEX (user_id, last_visited_at DESC)
```

### Server actions

- `pinItem(kind, ref, label, iconKey)` — rejects if user already has 8 pins
- `unpinItem(kind, ref)`
- `reorderPins(orderedIds: string[])`
- `recordVisit(kind, ref, label)` — upserts into `user_recents`, then prunes keeping most-recent 10
- `clearRecents()`

All actions use the authenticated user from `getCurrentUserForPage()` equivalent; no `userId` parameter from client.

### Write volume

`recordVisit` fires on every route change. Mitigations:

- Client-side debounce 500ms
- Skip if `ref` matches the previous visit (handles tab switches and back-button loops)
- Upsert in a single statement (`INSERT ... ON CONFLICT (user_id, kind, ref) DO UPDATE SET last_visited_at = now()`)
- Prune in the same transaction: `DELETE FROM user_recents WHERE user_id = $1 AND id NOT IN (SELECT id FROM user_recents WHERE user_id = $1 ORDER BY last_visited_at DESC LIMIT 10)`

### Deletion safety

Pins and recents pointing at deleted entities are filtered on render (JOIN against source tables). Dead rows are cleaned nightly by `/api/cleanup/ui-state` — new Vercel cron job.

### Scope

Per-user, not shared. Explicit choice — your pins aren't Alex's pins.

### Migration

Single Drizzle migration. No backfill — everyone starts empty.

### Files

- `packages/db/src/schema.ts` — add `userPins`, `userRecents`
- `packages/db/migrations/NNNN_user_ui_state.sql` — new
- `apps/internal/src/app/actions/ui-state.ts` — server actions
- `apps/internal/src/app/api/cleanup/ui-state/route.ts` — cron endpoint
- `apps/internal/vercel.json` — add cron schedule (nightly)

---

## Error Handling

- Every server action returns `{ success: true, data }` or `{ success: false, error: string }` — existing pattern
- Palette inline creates: on error, keep the form state and surface the error inline (not via toast). Toasts are for successful mutations only.
- Inbox inline actions: optimistic UI, rollback on failure with an error toast
- Entity shell: right-rail and tab content fail independently — one tab failing does not break the shell
- Breadcrumbs: if an entity name can't resolve, fall back to the raw segment

## Testing

**Unit tests (Vitest):**
- `route-context.ts` pathname → entity resolver
- Fuzzy rank helper in palette
- Recents dedup/prune logic (pure function pulled out of server action)

**Integration tests (Vitest + test DB):**
- Palette search across all groups (happy + empty query)
- Inline create server actions (each command)
- `pinItem` enforces the 8-item cap
- `recordVisit` prunes correctly when exceeding 10

**E2E (Playwright):**
- Cmd+K → type "new task" → fill form → Enter → verify task appears on tasks page
- Visit 12 different engagements → verify Recents shows the 10 most recent
- Pin engagement → verify it appears in sidebar → unpin → verify it disappears
- Open an engagement → verify right-rail shows company + contacts + projects + invoices
- Inbox: toggle a task as done → verify it disappears and count decreases

**Manual QA checklist (per shipped surface):**
- Keyboard-only walkthrough (no mouse)
- Mobile viewport (375px width)
- Screen reader spot-check (VoiceOver) on palette and shell
- Dark mode (if/when it ships — current app is light-only)

## Non-goals

- Dark mode / theme system
- WCAG 2.2 AA technical audit (deferred to a separate pass)
- Time tracking
- Invoicing/finance UX redesign
- Dev-ops page redesign
- Skills/agents redesign
- Team-shared pins or presence indicators
- Offline support

## Open Questions (to resolve during planning)

1. Breadcrumb entity-name resolution: one joined query or a lightweight `resolveEntity(kind, id)` helper called per segment? Prefer the helper for simplicity unless query plans suggest otherwise.
2. Right rail caching: `unstable_cache` with a 30s TTL, or `revalidateTag(entityId)` on mutation? Plan phase to decide based on mutation frequency.
3. Inline composer component: new component or reuse an existing modal form? Audit during plan phase.
4. Where does the Breadcrumb live — inside `main` or at the top of each page? Current preference: inside `main`, scrolls with content.

## Commit hygiene

- Add `.superpowers/` to `.gitignore` (the visual companion writes mockups there)
- Spec committed to `docs/superpowers/specs/2026-04-18-strvx-discoverability-redesign-design.md`

---

**End of spec. Next step: implementation plan via `superpowers:writing-plans` skill.**
