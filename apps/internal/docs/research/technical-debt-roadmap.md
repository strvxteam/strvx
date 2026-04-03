# Technical Debt Roadmap

**Audited:** 2026-03-30
**Codebase:** strvx-internal-tool (Next.js 16 + Drizzle + Supabase)

---

## 1. Dead Code & Unused Imports

### Entirely Dead Component Tree: `src/components/dashboard/`

The following 5 files form a complete component tree that is **never imported by any page**:

| File | Lines | Status |
|------|-------|--------|
| `src/components/dashboard/dashboard-view.tsx` | ~130 | **Dead** -- not imported anywhere in `src/app/` |
| `src/components/dashboard/metric-card.tsx` | ~40 | Dead (only imported by dashboard-view) |
| `src/components/dashboard/pipeline-chart.tsx` | ~60 | Dead (only imported by dashboard-view) |
| `src/components/dashboard/activity-feed.tsx` | ~50 | Dead (only imported by dashboard-view) |
| `src/components/dashboard/attention-list.tsx` | ~50 | Dead (only imported by dashboard-view) |
| `src/components/dashboard/revenue-spark.tsx` | ~40 | Dead (only imported by dashboard-view) |

These were likely an earlier dashboard implementation before `dashboard/page.tsx` was rewritten as a server component with inline JSX. They also pull in `framer-motion` and `recharts` -- removing them shrinks the client bundle.

### Unused Dependencies in `package.json`

| Package | Status | Evidence |
|---------|--------|----------|
| `@tremor/react` | **Unused** | Zero imports in entire `src/` |
| `@base-ui/react` | **Unused** | Zero imports in entire `src/` |
| `@tiptap/*` (6 packages) | **Unused** | Zero imports in entire `src/` |
| `lowlight` | **Unused** | Zero imports (companion to tiptap code-block) |
| `shadcn` | **Unused at runtime** | CLI tool, should be in devDependencies if kept |
| `dotenv` | **Unused in src/** | Only needed for scripts; should be devDependency |
| `@types/pg` | **Unused** | No `pg` import -- uses `postgres` (postgres.js) instead |

### Unused File

| File | Status |
|------|--------|
| `src/lib/mock-apollo.ts` | **Not imported anywhere** -- defines Apollo enrichment types but no file references it |

---

## 2. Mock Data Cleanup Status

### Mock files: 8 total, all still referenced

| Mock File | Lines | References | DB Equivalent Exists? | Can Delete? |
|-----------|-------|-----------|----------------------|-------------|
| `mock-data.ts` | 525 | clients/page, clients/[id]/page, dashboard/page, pipeline/page, revenue/page, finances-client | **Partial** -- engagements/contacts/metrics have DB queries; timeline/actions used as fallback | **No** -- still used as fallback in try/catch pattern |
| `mock-tasks.ts` | 247 | tasks/page, tasks/[id]/page, tasks-board, task-card, task-filters, task-detail-drawer, dashboard, project-detail-client | **Partial** -- tasks table exists but kanban still reads mock | **No** -- tasks board still uses mock directly |
| `mock-finance.ts` | 204 | dashboard/page, finances/page, finances-client, revenue/page, expenses/page, invoices/page, invoices/[id]/page, goals-client | **Partial** -- invoices/expenses tables exist but revenue/dashboard still use mock | **No** -- revenue page is 100% mock |
| `mock-calendar.ts` | 173 | calendar/page, calendar-page-client, week-view, month-view, upcoming-sidebar, dashboard/page | **Partial** -- calendar_events table exists but events are *merged* with mock | **No** -- mock events always show alongside DB events |
| `mock-marketing.ts` | 167 | marketing/page, marketing-client | **Yes** -- marketing_posts table exists with full CRUD | **Almost** -- types still imported from mock file |
| `mock-outreach.ts` | 200 | outreach-client | **Yes** -- prospects/industries tables exist | **No** -- outreach page is 100% mock, never queries DB |
| `mock-projects.ts` | 174 | projects-client, projects/[id]/project-detail-client | **Partial** -- projects table exists but page never queries it | **No** -- projects pages are 100% mock |
| `mock-docs.ts` | 267 | docs/page, docs/[id]/page | **Yes** -- documents table exists with full CRUD | **No** -- docs pages still use mock exclusively |
| `mock-apollo.ts` | 228 | **None** | N/A | **Yes -- delete now** |

### The "Try DB, Catch Mock" Anti-Pattern

The codebase uses a consistent but problematic pattern where server components try a DB query and silently fall back to mock data on failure:

```typescript
let data = mockData;
try {
  const real = await getFromDb();
  if (real.length > 0) data = real;
} catch {
  // Using mock data
}
```

**Problems:**
1. Empty catch blocks swallow real errors (connection timeouts, schema mismatches, auth failures)
2. When DB returns 0 rows (legitimate empty state), it falls back to mock data showing fake clients
3. Mock and real data can mix (calendar page explicitly merges both)
4. Makes it impossible to know which data source is active without debugging

**Recommended migration path:** See `docs/research/mock-to-real-migration-plan.md` (already exists). Prioritize: extract mock types to standalone type files, then remove mock data imports one page at a time.

---

## 3. Inconsistent Patterns

### Server vs. Client Component Strategy

There is no consistent pattern -- pages fall into 4 different architectural approaches:

| Pattern | Pages | Description |
|---------|-------|-------------|
| **A: Server page with DB query, mock fallback** | dashboard, pipeline, clients, clients/[id], contacts, calendar, invoices, invoices/[id], finances, goals, marketing | Best pattern -- fetches in server component, passes to client |
| **B: Thin server wrapper, 100% client-side mock** | outreach, projects, projects/[id], assets, tasks | Server page.tsx is a 1-line wrapper, client component imports mock data directly |
| **C: Pure server with no DB query** | expenses, revenue, toolbox, templates, docs, docs/[id], tasks/[id] | Server component renders mock data directly -- no DB attempt |
| **D: Pure static** | toolbox, templates | Mock data defined inline in page file |

Pattern A is the target architecture. Patterns B/C/D need migration to Pattern A.

### Server Action Error Handling

`src/app/actions.ts` has **inconsistent error handling**:

- `createEngagement`, `quickAdd`, `changeStage`, `toggleAction`, `createContact`: Use `throw new Error()` -- correct for server actions, caught by client error boundaries
- `createTask`, `updateTask`, `deleteTask`, `createInvoice`, `createExpense`, `createGoal`, `updateGoal`, `createMarketingPost`, `updateMarketingPost`, `deleteMarketingPost`, `createDocument`, `updateDocument`: **No try/catch at all** -- DB errors propagate as unhandled exceptions with stack traces

The second group should wrap DB calls in try/catch and throw user-friendly errors.

### Revalidation Path Coverage

Most actions revalidate relevant paths correctly. Issues found:

| Action | Issue |
|--------|-------|
| `createContact` | Only revalidates `/contacts`, should also revalidate `/clients/[companyId]` |
| `updateDocument` | Only revalidates `/docs`, should also revalidate `/docs/[docId]` |
| `updateEngagement` | Revalidates `/clients/[id]` but not `/clients` (list view) |
| `createCalendarEventAction` | Revalidates `/calendar` and `/dashboard` but not `/projects/[projectId]` if linked |

### Duplicate Stage Color Maps

Stage-to-color mappings are defined in **4 separate places**:

1. `src/lib/pipeline-constants.ts` -- `STAGE_COLORS` (canonical, covers all 11 stages)
2. `src/lib/mock-outreach.ts` -- `STAGE_COLORS` (prospect stages, 3 values, same export name)
3. `src/app/(app)/outreach/outreach-client.tsx` -- `EXTENDED_STAGE_COLORS` (adds "converted")
4. `src/app/(app)/dashboard/page.tsx` line 402 -- inline `stageColor` Record literal (6 stages)

The dashboard inline map should import from `pipeline-constants.ts`.

---

## 4. Type Safety Issues

### `as unknown` Casts (4 instances)

| File | Line | Issue |
|------|------|-------|
| `src/lib/db/index.ts:12` | `null as unknown as ReturnType<typeof drizzle>` | DB export is null when no DATABASE_URL -- every DB call crashes at runtime. Should use a proper error or lazy initialization. |
| `src/lib/supabase/client.ts:7` | `null as unknown as ReturnType<typeof createBrowserClient>` | Same pattern -- Supabase client returns null cast to wrong type |
| `src/app/api/webhooks/calendly/route.ts:68` | `existing as unknown[]` | Raw SQL result type is unknown -- should use typed query |
| `src/app/(app)/dashboard/page.tsx:131` | `_ar.staleEngagements as unknown as {...}[]` | Raw SQL result from `db.execute` returns untyped rows |

### `as string` Casts on FormData (15 instances in actions.ts)

All `formData.get()` calls use `as string` without validation. `FormData.get()` returns `FormDataEntryValue | null` which could be `File`. Should use Zod or manual validation:

```
formData.get("companyName") as string  // could be null or File
```

### `as typeof` Coercion Pattern (3 instances)

Used to force mock data types onto DB query results:
- `pipeline/page.tsx:18` -- `data as typeof allEngagements`
- `clients/page.tsx:19` -- `data as typeof engagementsList`
- `clients/[id]/page.tsx:40` -- `realEngagement as typeof engagement`

These mask type mismatches between mock data shapes and DB query results. The mock types and DB query return types should be unified into shared interfaces.

### `@ts-expect-error` (1 instance)

`src/app/api/webhooks/calendly/route.ts:65` -- raw SQL execution with params. Should use Drizzle's parameterized query builder instead.

### Force Unwraps in Server Code

`src/lib/supabase/server.ts:8-9` uses `!` on environment variables:
```typescript
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
```

### Loose `string` Typing on Schema Columns

Several schema columns use bare `text()` where they should use enums:
- `tasks.status` -- `text("status")` but expects `"todo" | "in_progress" | "blocked" | "done"`
- `tasks.priority` -- `text("priority")` but expects `"urgent" | "high" | "normal" | "low"`
- `invoices.status` -- `text("status")` but expects `"draft" | "sent" | "paid" | "overdue"`
- `projects.status` -- `text("status")` but expects `"scoping" | "in_progress" | "completed"`
- `marketingPosts.platform` -- `text("platform")` but expects `"linkedin" | "twitter" | "blog"`
- `calendarEvents.type` -- `text("type")` but expects `"client_call" | "internal" | "deadline"`

These should use `pgEnum` like the other enums in the schema.

---

## 5. Component Architecture

### Files Over 300 Lines That Should Be Split

| File | Lines | Recommended Split |
|------|-------|-------------------|
| `outreach/outreach-client.tsx` | **1,233** | Extract: ProspectTable, ProspectDetailSheet, ProspectForm, SequenceManager, TouchLogPanel, StatsBar |
| `clients/clients-table.tsx` | **1,037** | Extract: ClientRow, ClientDetailSheet, TimelinePanel, ActionsPanel, ContactsPanel |
| `finances/finances-client.tsx` | **878** | Extract: RevenueOverview, ExpenseTable, ExpenseForm, InvoiceSummary |
| `client/client-detail-view.tsx` | **793** | Extract: EngagementHeader, EngagementSidebar, TimelineSection, ActionsSection, EditableFields |
| `dashboard/page.tsx` | **715** | Extract: PulseStrip, NeedsAttentionSection, ActiveWorkSection, RecentActivitySection, ScheduleSidebar, MoneySidebar, PipelineSidebar, TeamSidebar |
| `calendar/calendar-page-client.tsx` | **551** | Extract: AddEventModal, EventDetailModal, CalendarHeader |
| `marketing/marketing-client.tsx` | **465** | Extract: PostList, PostForm, PostDetailView |
| `projects/[id]/project-detail-client.tsx` | **457** | Extract: ProjectHeader, TasksList, MilestoneTimeline, CalendarSection |
| `assets/assets-client.tsx` | **456** | Extract: AssetGrid, AssetUploadForm, AssetPreview |
| `projects/projects-client.tsx` | **434** | Extract: ProjectCard, ProjectForm, ProjectFilters |
| `command-palette.tsx` | **369** | Extract: SearchResults, RecentItems, ActionCommands |

### Shared Logic That Should Be Extracted to Hooks

| Pattern | Where It Appears | Recommended Hook |
|---------|-----------------|-----------------|
| "Try DB, catch mock fallback" | 12+ server pages | `useDbWithFallback<T>(queryFn, mockData)` or server utility |
| Inline date formatting | dashboard, calendar, tasks, clients | `useDateFormat()` or shared `formatDate` util (partially exists in `calendar-utils.ts`) |
| Stage color lookup | 4 different files | Already centralized in `pipeline-constants.ts` but not used everywhere |
| Realtime subscription | `use-realtime.ts` | Already extracted -- good |
| Form submission with `useTransition` | create-engagement-form, marketing-client, calendar-page-client | `useFormSubmit(action)` hook |

### Duplicated Type Definitions

The `Engagement` type is defined independently in **5 files**:
1. `src/components/client/client-detail-view.tsx` (lines 23-44)
2. `src/app/(app)/clients/clients-table.tsx` (lines 46-75)
3. `src/lib/pipeline-constants.ts` -- `PipelineEngagement`
4. `src/app/(app)/dashboard/page.tsx` (line 71, inline)
5. `src/lib/mock-data.ts` (inferred from `mockEngagements` array shape)

These should be unified into a single `types.ts` file that both mock data and DB queries conform to.

---

## 6. Performance Concerns

### N+1 Query Patterns

| Location | Issue |
|----------|-------|
| `dashboard/page.tsx` lines 113-123 | Calls `getDashboardMetrics()`, `getPipelineCounts()`, `getRecentActivity()`, `getAtRiskItems()` in parallel (good), but then calls `getPipelineEngagements()` sequentially after (bad) |
| `clients/[id]/page.tsx` lines 38-48 | Fetches engagement, then timeline + actions in parallel, then `getPipelineEngagements()` sequentially -- this loads ALL engagements just to populate the QuickAddBar dropdown |
| `getAtRiskItems()` in queries.ts | Uses raw SQL (`db.execute`) for stale engagements query, which bypasses Drizzle's type safety and returns untyped results |
| `getContacts()` | Correlated subquery `(SELECT MAX(i.created_at) ...)` runs once per contact row |
| `getPipelineEngagements()` | Correlated subquery `(SELECT MIN(na.due_date) ...)` runs once per engagement row |

### Missing Database Indexes

The schema defines only 2 indexes (both on `prospects` table):
- `prospects_industry_idx`
- `prospects_industry_stage_idx`

Missing indexes that would help based on query patterns:

| Table | Column(s) | Accessed By |
|-------|-----------|------------|
| `engagements` | `archived_at, stage` | Every pipeline query filters by these |
| `engagements` | `company_id` | FK joins in every engagement query |
| `next_actions` | `engagement_id, completed, archived_at` | `getAtRiskItems`, `getEngagementActions` |
| `next_actions` | `due_date` | Overdue action queries |
| `interactions` | `engagement_id, created_at` | Timeline queries, stale engagement detection |
| `interactions` | `type, scheduled_at` | Meeting count queries |
| `contacts` | `company_id, archived_at` | `getContactsByCompany` |
| `tasks` | `status, assignee_id` | Task board queries |
| `invoices` | `status` | Invoice filtering |

### Large Client Bundles

| Concern | Impact |
|---------|--------|
| `@tremor/react` in bundle | Unused but tree-shaking may not eliminate it if package has side effects |
| 6 tiptap packages | Unused -- ~200KB+ gzipped if included |
| `framer-motion` | Only used by 5 dead dashboard components -- removing them removes the dep |
| `recharts` | Only used by 1 dead component (`revenue-spark.tsx`) |
| All mock data files | Imported in client components, shipped to browser. `mock-data.ts` alone is 525 lines of static JSON |

### Unnecessary Re-renders

| Issue | Location |
|-------|----------|
| `useRealtimeRefresh` calls `router.refresh()` on ANY change to 7 tables | `realtime-provider.tsx` -- a single prospect touch insert refreshes the entire app |
| Calendar `CalendarPageClient` stores all events in state and passes them through 3 child components | Week/month/sidebar all receive the full event array and filter locally |
| `outreach-client.tsx` manages all state in a single 1233-line component | Any state change re-renders the entire outreach page |

---

## 7. Dependency Audit

### Security Vulnerabilities

```
1 moderate vulnerability:
  esbuild <=0.24.2 (via drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils)
  Fix: Update drizzle-kit (dev dependency only, not a runtime risk)
```

### Packages to Remove

| Package | Reason | Savings |
|---------|--------|---------|
| `@tremor/react` | Zero imports | Large (tremor bundles recharts internally) |
| `@base-ui/react` | Zero imports | Medium |
| `@tiptap/core` | Zero imports | ~50KB gzip |
| `@tiptap/extension-code-block-lowlight` | Zero imports | ~20KB |
| `@tiptap/extension-link` | Zero imports | ~15KB |
| `@tiptap/extension-placeholder` | Zero imports | ~10KB |
| `@tiptap/pm` | Zero imports | ~100KB |
| `@tiptap/react` | Zero imports | ~30KB |
| `@tiptap/starter-kit` | Zero imports | ~60KB |
| `lowlight` | Zero imports | ~20KB |
| `@types/pg` | No `pg` package used | Negligible (types only) |

### Packages to Move to devDependencies

| Package | Reason |
|---------|--------|
| `shadcn` | CLI tool, not imported at runtime |
| `dotenv` | Only used in `scripts/seed.ts` |

### Packages Potentially Removable After Dead Code Cleanup

| Package | Condition |
|---------|-----------|
| `framer-motion` | If `src/components/dashboard/` dead tree is deleted |
| `recharts` | Same condition -- only used by dead `revenue-spark.tsx` |

---

## 8. Prioritized Cleanup Plan

### Quick Wins (< 30 min each)

| # | Task | Files | Impact |
|---|------|-------|--------|
| 1 | **Delete `mock-apollo.ts`** | 1 file | Remove dead code |
| 2 | **Delete entire `src/components/dashboard/` directory** (6 files) | 6 files | Remove ~370 lines of dead code, eliminate framer-motion + recharts from client bundle |
| 3 | **Remove unused packages** from package.json: @tremor/react, @base-ui/react, @tiptap/*, lowlight, @types/pg | package.json | Shrink node_modules, eliminate phantom bundle bloat |
| 4 | **Move shadcn and dotenv to devDependencies** | package.json | Correct dep classification |
| 5 | **Import STAGE_COLORS from pipeline-constants** in dashboard/page.tsx instead of inline Record | 1 file | Eliminate duplicated color map |
| 6 | **Add missing revalidation paths** in actions.ts: createContact should revalidate client pages, updateDocument should revalidate doc detail | 1 file | Fix stale data after mutations |
| 7 | **Disable auth middleware cleanup** -- the middleware.ts has a commented-out import and does nothing. Either re-enable or add a comment explaining when it will be enabled | 1 file | Code clarity |

### Medium Effort (1-3 hours each)

| # | Task | Files | Impact |
|---|------|-------|--------|
| 8 | **Create shared type definitions** -- extract Engagement, TimelineEntry, ActionEntry, Contact, Task types into `src/lib/types.ts`, update all imports | ~15 files | Eliminate 5+ duplicate type definitions, type safety |
| 9 | **Add pgEnum for loose text columns** -- tasks.status, tasks.priority, invoices.status, projects.status, marketingPosts.platform, calendarEvents.type | schema.ts + migration | DB-level validation, TypeScript type narrowing |
| 10 | **Add missing database indexes** for engagements, next_actions, interactions, contacts, tasks, invoices | schema.ts + migration | Query performance as data grows |
| 11 | **Add error handling to all server actions** -- wrap DB operations in try/catch for createTask, updateTask, deleteTask, createInvoice, createExpense, createGoal, updateGoal, and all marketing/document actions | actions.ts | Prevent stack trace leaks, user-friendly errors |
| 12 | **Replace `as string` FormData casts with Zod validation** in actions.ts | actions.ts | Runtime type safety at API boundary |
| 13 | **Fix the `null as unknown` DB/Supabase client pattern** -- either throw a clear error when DATABASE_URL is missing, or use a lazy-init pattern that returns a helpful error message | db/index.ts, supabase/client.ts | Prevent mysterious runtime crashes |
| 14 | **Migrate tasks pages from mock to DB** -- tasks-board, tasks/[id], task-detail-client all read from mockTasks directly. Wire them to `getTasks()` query with the try/catch pattern | ~8 files | Unblock task data persistence |
| 15 | **Migrate docs pages from mock to DB** -- docs/page.tsx and docs/[id]/page.tsx read from mockDocs exclusively despite documents table + CRUD existing | ~3 files | Unblock document persistence |
| 16 | **Fix calendar mock/DB merge** -- calendar/page.tsx merges mock events WITH DB events, showing phantom fake meetings. Should use DB only when available, mock only as fallback | 1 file | Data accuracy |
| 17 | **Extract mock type definitions to standalone type files** -- types like `Invoice`, `Expense`, `MarketingPost`, `CalendarEvent` are defined in mock files but needed independently. Move types to `src/lib/types/`, keep mock data separate | ~10 files | Decouples types from mock data, enables clean mock deletion later |
| 18 | **Remove the `building_mvp` stage or add it consistently** -- the stage enum includes `building_mvp` but `KANBAN_STAGES` includes it while `getPipelineCounts()` in queries.ts omits it from its initial counts object | schema.ts, queries.ts, pipeline-constants.ts | Data consistency |
| 19 | **Fix force unwraps in supabase/server.ts** -- replace `!` assertions with proper env var validation | 1 file | Prevent runtime crashes in misconfigured environments |

### Large Refactors (1+ days each)

| # | Task | Scope | Impact |
|---|------|-------|--------|
| 20 | **Split outreach-client.tsx (1,233 lines)** into 6+ components: ProspectTable, ProspectDetailSheet, ProspectForm, SequenceManager, TouchLogPanel, StatsBar. Then wire it to the prospects/industries DB tables instead of mock data. | ~8 new files | Maintainability, enables DB persistence for outreach |
| 21 | **Split clients-table.tsx (1,037 lines)** into separate components for the table, detail sheet, timeline panel, and actions panel | ~5 new files | Maintainability, testability |
| 22 | **Split dashboard/page.tsx (715 lines)** into section components -- the page is a single server component with 8 distinct sections all rendered inline | ~8 new files | Maintainability, enables selective re-rendering |
| 23 | **Eliminate the try/catch mock fallback pattern** across all 12+ server pages. Replace with a proper data layer that either: (a) requires DB connection and fails clearly, or (b) uses a feature flag to toggle mock mode. Current approach silently masks DB errors. | ~15 files | Reliability, debuggability |
| 24 | **Migrate remaining 100%-mock pages to DB**: revenue/page, expenses/page, outreach (prospects), projects, toolbox, templates | ~10 files + queries | Full DB persistence -- currently 6 pages show hardcoded fake data with no path to real data |
| 25 | **Add RLS policies to Supabase tables** (flagged in TODOS.md as critical) -- without RLS, the public anon key exposed in the client bundle allows anyone to read/write all data | Supabase dashboard + migration | Security: currently wide open |
| 26 | **Implement proper loading/error states** -- currently no loading skeletons (except a global `loading.tsx` spinner), no error boundaries per section, no toast notifications for action success/failure | ~10+ files | UX quality, error resilience |
| 27 | **Fix N+1 queries** -- replace correlated subqueries in `getContacts()` and `getPipelineEngagements()` with joins or window functions. Add a lightweight `getEngagementNames()` query for the QuickAddBar instead of loading all pipeline data. | queries.ts | Query performance at scale |
| 28 | **Set up CI/CD** (flagged in TODOS.md) -- GitHub Actions for lint + typecheck + build on push, Vercel preview deploys on PR | New workflow files | Catch regressions before deploy |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Dead code files | 7 (6 dashboard components + mock-apollo) |
| Unused npm packages | 11 |
| Mock files still referenced | 8 of 9 |
| Pages using 100% mock data | 6 (revenue, expenses, outreach, projects, toolbox, templates) |
| `as unknown` casts | 4 |
| `as string` unsafe casts | 15 |
| `@ts-expect-error` | 1 |
| Force unwraps (`!`) | 2 |
| Silent empty catch blocks | 27 |
| Files over 300 lines needing split | 11 |
| Missing DB indexes | 9+ |
| Duplicate type definitions | 5+ Engagement variants |
| Duplicate color maps | 4 stage color definitions |
| Quick wins | 7 tasks |
| Medium effort | 12 tasks |
| Large refactors | 9 tasks |
