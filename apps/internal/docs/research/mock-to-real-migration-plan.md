# Mock-to-Real Supabase Migration Plan

**Created:** 2026-03-30
**Last Updated:** 2026-03-30

---

## Current State Audit

### Pages Using REAL DB Data (fully wired)
| Page | Query/Action Used | Notes |
|------|------------------|-------|
| `/contacts` | `getContacts()` | No mock fallback. Empty array if DB fails. Fully real. |

### Pages Using HYBRID (try real, fallback to mock)
| Page | Real Queries Used | Mock Fallback |
|------|------------------|---------------|
| `/dashboard` | `getDashboardMetrics`, `getPipelineCounts`, `getRecentActivity`, `getAtRiskItems`, `getPipelineEngagements` | Falls back to `mockMetrics`, `mockPipelineCounts`, `mockRecentActivity`, `mockEngagements`, `mockActions`. Also uses `mockCalendarEvents`, `mockMonthlyRevenue`, `mockInvoices`, `mockTasks` directly (never tries DB for these). |
| `/pipeline` | `getPipelineEngagements` | Falls back to `mockEngagements`. |
| `/clients` | `getPipelineEngagements` | Falls back to `mockEngagements`. Also passes `mockContacts`, `mockTimeline`, `mockActions` always. |
| `/clients/[id]` | `getEngagement`, `getEngagementTimeline`, `getEngagementActions`, `getPipelineEngagements`, `getContactsByCompany` | Falls back to `mockEngagements`, `mockTimeline`, `mockActions`, `mockContacts`. |
| `/calendar` | `getCalendarEvents` | **Merges** DB events with `mockCalendarEvents` (both always show). |
| `/invoices` | `getInvoices` | Falls back to `mockInvoices`. |
| `/invoices/[id]` | `getInvoice` | Falls back to `mockInvoices.find(...)`. |
| `/finances` | `getInvoices`, `getExpenses` | Server fetches real data, passes to client. Client falls back to `mockInvoices`, `mockExpenses`. Also uses `mockMonthlyRevenue`, `mockEngagements` directly in client. |
| `/marketing` | `getMarketingPosts` | Falls back to `initialPosts` from `mock-marketing`. |
| `/goals` | `getGoals`, `getInvoices` | Falls back to `mockMonthlyRevenue` for revenue. Client uses hardcoded goals if no DB goals. |

### Pages Using ONLY Mock Data (no DB queries at all)
| Page | Mock Files Used | Notes |
|------|----------------|-------|
| `/tasks` | `mock-tasks` | `TasksBoard` component initializes entirely from `mockTasks`. No server query. |
| `/tasks/[id]` | `mock-tasks` | Finds task from `mockTasks` array. No DB lookup. |
| `/projects` | `mock-projects`, `mock-data` | Client component. `useState(mockProjects)`. CRUD is local state only. |
| `/projects/[id]` | `mock-projects`, `mock-tasks`, `mock-calendar` | Client component. Finds project from `mockProjects`. Tasks/events from mock. |
| `/expenses` | `mock-finance` | Renders `mockExpenses` directly. No try/catch, no DB query. |
| `/revenue` | `mock-finance`, `mock-data` | Renders `mockInvoices`, `mockMonthlyRevenue`, `mockEngagements` directly. No DB. |
| `/docs` | `mock-docs` | Renders `mockDocs` directly. No DB. |
| `/docs/[id]` | `mock-docs` | Finds doc from `mockDocs`. No DB. |
| `/outreach` | `mock-outreach` | Client component. All prospect data from `mockProspects`, `mockSequences`. |

### Mock Files Inventory

| File | Exports | Used By | Can Delete After Migration? |
|------|---------|---------|----------------------------|
| `mock-data.ts` | `mockEngagements`, `mockTimeline`, `mockActions`, `mockRecentActivity`, `mockContacts`, `mockMetrics`, `mockPipelineCounts` | dashboard, pipeline, clients, clients/[id], finances-client, projects, revenue, task-detail-drawer | YES - all have DB table equivalents |
| `mock-calendar.ts` | `CalendarEvent` (type), `EVENT_TYPE_COLORS`, `mockCalendarEvents` | dashboard, calendar, projects/[id], week-view, month-view, upcoming-sidebar | PARTIAL - type/constants should move to a shared `calendar-constants.ts` |
| `mock-finance.ts` | `Invoice`/`Expense`/`MonthlyRevenue` (types), `INVOICE_STATUS_COLORS`, `EXPENSE_CATEGORY_COLORS`, `mockInvoices`, `mockMonthlyRevenue`, `mockExpenses` | dashboard, invoices, invoices/[id], expenses, revenue, finances, goals-client | PARTIAL - types and color maps should move to a shared constants file |
| `mock-tasks.ts` | `Task` (type), `mockTasks`, `TASK_STATUS_LABELS`, `TASK_STATUS_COLUMNS`, `PRIORITY_COLORS`, `PRIORITY_BORDER_COLORS`, `COLUMN_COLORS`, `ASSIGNEES`, `PRIORITY_ORDER`, `isOverdue`, `formatRelativeDate` | tasks board, task-card, task-filters, add-task-modal, task-detail-drawer, dashboard, projects/[id], tasks/[id] | PARTIAL - constants/types/utils should move to `task-constants.ts` |
| `mock-projects.ts` | `Project` (type), `PROJECT_STATUS_COLORS`, `ALL_STATUSES`, `mockProjects` | projects, projects/[id] | PARTIAL - type/constants should move to `project-constants.ts` |
| `mock-docs.ts` | `Doc` (type), `mockDocs` | docs, docs/[id] | YES - data becomes DB rows |
| `mock-marketing.ts` | `MarketingPost` (type), `initialPosts`, `platformConfig`, `statusStyles`, `generateId` | marketing, marketing-client | PARTIAL - types/config should move to `marketing-constants.ts` |
| `mock-outreach.ts` | `Prospect` (type), `STAGE_COLORS`, `mockProspects`, `mockSequences` | outreach | PARTIAL - type/constants should move to `outreach-constants.ts`. Outreach data already has DB tables (`prospects`, `prospect_touches`). |
| `mock-apollo.ts` | `ApolloSearchResult`, `ApolloEnrichmentResult`, `ApolloSearchParams`, `mockApolloSearchResults`, `mockApolloEnrichmentResult` | Not imported by any page currently | YES - can delete immediately or keep for Apollo API development |

---

## Migration Strategy

### Pattern to Apply Everywhere

Every page currently follows one of three patterns:

1. **Pure mock** - component reads mock data directly, no DB call
2. **Try/catch fallback** - tries DB, catches error, falls back to mock
3. **Merge** - combines DB data with mock data (only calendar does this)

The target state for all pages:

```
// Server component
const data = await getXxx();
return <ClientComponent data={data} />;
```

No try/catch, no fallback, no mock imports. If the DB is empty, the page shows an empty state. If the DB is down, Next.js error boundary handles it.

### Per-Page Migration Details

#### 1. `/dashboard` (HIGH EFFORT)

**Current state:** Hybrid for metrics/pipeline/activity, pure mock for calendar/finance/tasks/goals.

**What needs to change:**
- Replace `mockCalendarEvents` with `getCalendarEvents()` (query exists)
- Replace `mockMonthlyRevenue` with a new query: `getMonthlyRevenue()` that aggregates paid invoices by month
- Replace `mockInvoices` usage (outstanding/overdue totals) with `getInvoicesSummary()` query
- Replace `mockTasks` (team blockers) with `getBlockedAndUrgentTasks()` query
- Replace `mockActions` usage (active work next actions) with data from `getAtRiskItems()` or a new query
- Remove all `mockEngagements` direct references; use only `getPipelineEngagements()` result
- Remove try/catch fallback; rely on error boundary

**Queries needed (new):**
- `getMonthlyRevenue()` - aggregate paid invoices by month, return last 6 months
- `getInvoicesSummary()` - return outstanding total, overdue total
- `getBlockedAndUrgentTasks()` - tasks where status=blocked OR priority=urgent AND status!=done

**Estimated effort:** Large (3-4 hours) - most complex page, many data sources

#### 2. `/pipeline` (LOW EFFORT)

**Current state:** Hybrid with fallback.

**What needs to change:**
- Remove try/catch and `mockEngagements` import
- Call `getPipelineEngagements()` directly (query already exists and works)

**Queries needed (new):** None

**Estimated effort:** Small (15 min)

#### 3. `/clients` (MEDIUM EFFORT)

**Current state:** Hybrid for engagements list, pure mock for contacts/timeline/actions passed to `ClientsTable`.

**What needs to change:**
- Remove try/catch and mock fallback for engagements
- Stop passing `mockContacts`, `mockTimeline`, `mockActions` to `ClientsTable`
- `ClientsTable` needs refactoring: either fetch per-engagement data on expand, or preload from DB

**Queries needed (new):** None (existing queries cover this), but data fetching architecture needs rethinking. The current approach of passing all timeline/actions for all engagements upfront is mock-oriented. The real version should lazy-load per engagement.

**Estimated effort:** Medium (1-2 hours) - requires `ClientsTable` refactoring

#### 4. `/clients/[id]` (LOW EFFORT)

**Current state:** Hybrid with comprehensive fallback.

**What needs to change:**
- Remove try/catch and all mock fallbacks
- Queries already exist: `getEngagement`, `getEngagementTimeline`, `getEngagementActions`, `getContactsByCompany`
- Remove `mockEngagements`, `mockTimeline`, `mockActions`, `mockContacts` imports

**Queries needed (new):** None

**Estimated effort:** Small (30 min)

#### 5. `/calendar` (LOW EFFORT)

**Current state:** Merges DB events with mock events (broken behavior - shows both).

**What needs to change:**
- Remove `mockCalendarEvents` import
- Use only `getCalendarEvents()` result
- Remove merge logic

**Queries needed (new):** None

**Estimated effort:** Small (15 min)

#### 6. `/tasks` and `/tasks/[id]` (HIGH EFFORT)

**Current state:** Pure mock. `TasksBoard` initializes from `mockTasks`. Task detail page finds from `mockTasks`. All CRUD is local state.

**What needs to change:**
- Convert `TasksBoard` from local `useState(mockTasks)` to server-fetched data
- Make `TasksPage` a server component that calls `getTasks()` and passes data down
- Wire up all task mutations (add, edit, delete, status change, drag-and-drop reorder) to use server actions `createTask`, `updateTask`, `deleteTask` (all three already exist in `actions.ts`)
- Convert `tasks/[id]` to fetch from DB via `getTasks()` or add a `getTask(id)` query
- Rework the `Task` type to match DB shape (DB has `assigneeId`/`assigneeName`, mock has `assignee: "Nick"`)
- The linked entity concept (`linkedEntity: { type, id, name }`) needs mapping to `engagementId`/`projectId` fields
- `ASSIGNEES` constant needs to become a DB query for users

**Queries needed (new):**
- `getTask(id)` - single task lookup (not yet in queries.ts)

**Estimated effort:** Large (3-4 hours) - many components to rewire, type changes cascade

#### 7. `/projects` and `/projects/[id]` (HIGH EFFORT)

**Current state:** Pure mock. `"use client"` page with `useState(mockProjects)`. All CRUD is local state. Detail page reads from `mockProjects`, `mockTasks`, `mockCalendarEvents`.

**What needs to change:**
- Convert projects page from client to server component, or pass server-fetched data as props
- `getProjects()` query exists but the DB `projects` table is simpler than the mock `Project` type (no `timeEntries`, no `timeline` fields)
- **Schema gap:** Mock `Project` has `timeEntries` and `timeline` arrays. DB `projects` table does not have these. Either:
  - Add `project_timeline` and `time_entries` tables, OR
  - Derive timeline from existing `interactions` and `calendarEvents` where `projectId` matches, OR
  - Accept simpler project detail page initially
- Wire up project CRUD to server actions (no project create/update/delete actions exist yet)
- Detail page tasks: query `tasks` table filtered by `projectId`
- Detail page events: query `calendarEvents` filtered by `projectId`

**Queries needed (new):**
- `createProject(data)` server action
- `updateProject(id, data)` server action
- `deleteProject(id)` server action
- `getProjectTasks(projectId)` - tasks filtered by projectId
- `getProjectCalendarEvents(projectId)` - calendar events filtered by projectId

**Schema changes needed:**
- Decision required: add `time_entries` table for time tracking, or defer?
- Decision required: project timeline - derive from interactions/events, or add dedicated table?

**Estimated effort:** Large (4-5 hours) - schema gaps, new actions, component rewiring

#### 8. `/invoices` and `/invoices/[id]` (LOW EFFORT)

**Current state:** Hybrid with fallback.

**What needs to change:**
- Remove try/catch and mock fallback
- Queries already exist: `getInvoices()`, `getInvoice(id)`
- Minor type mapping (DB field names differ from mock: `invoiceNumber` vs `number`, `clientName` vs `client`)
- Extract `Invoice` type and `INVOICE_STATUS_COLORS` to a shared constants file

**Queries needed (new):** None

**Estimated effort:** Small (30 min)

#### 9. `/expenses` (LOW EFFORT)

**Current state:** Pure mock.

**What needs to change:**
- Convert to server component that calls `getExpenses()` (query exists)
- Map DB `expenses` rows to display format
- Wire up expense creation to `createExpense` server action (already exists)

**Queries needed (new):** None

**Estimated effort:** Small (30 min)

#### 10. `/revenue` (MEDIUM EFFORT)

**Current state:** Pure mock. Uses `mockInvoices`, `mockMonthlyRevenue`, `mockEngagements`.

**What needs to change:**
- Convert to server component
- Replace `mockInvoices` with `getInvoices()` (exists)
- Replace `mockEngagements` with `getPipelineEngagements()` (exists)
- Replace `mockMonthlyRevenue` with `getMonthlyRevenue()` (new query, same one needed for dashboard)
- MRR calculation needs to come from engagements with `maintenanceOptedIn = true`

**Queries needed (new):**
- `getMonthlyRevenue()` (shared with dashboard)
- `getMRR()` - sum of `maintenanceMonthlyFee` where `maintenanceOptedIn = true`

**Estimated effort:** Medium (1-2 hours)

#### 11. `/finances` (MEDIUM EFFORT)

**Current state:** Server fetches invoices/expenses with fallback. Client still uses `mockMonthlyRevenue`, `mockExpenses` as fallback, and `mockEngagements` directly.

**What needs to change:**
- Remove all mock fallbacks from server and client
- Pass `monthlyRevenue` from server (new query)
- Pass engagement list from server for client selects
- Wire up expense CRUD to server actions

**Queries needed (new):**
- `getMonthlyRevenue()` (shared with dashboard/revenue)

**Estimated effort:** Medium (1-2 hours)

#### 12. `/marketing` (LOW EFFORT)

**Current state:** Hybrid. Server tries DB, client falls back to mock `initialPosts`.

**What needs to change:**
- Remove mock fallback
- Server actions `createMarketingPost`, `updateMarketingPost`, `deleteMarketingPost` already exist
- Extract `MarketingPost` type, `platformConfig`, `statusStyles` to constants file

**Queries needed (new):** None

**Estimated effort:** Small (30 min)

#### 13. `/docs` and `/docs/[id]` (MEDIUM EFFORT)

**Current state:** Pure mock.

**What needs to change:**
- Convert to server component that calls `getDocuments()` (query exists)
- Convert detail page to call `getDocument(id)` (query exists)
- Wire up doc creation/editing to `createDocument`, `updateDocument` server actions (both exist)
- DB `documents` table has `folder`, `content`, `authorId` - matches mock structure
- **Gap:** DB `documents` table has no `excerpt` field. Either add it via migration, or compute excerpt from `content.slice(0, 150)` at query time

**Queries needed (new):** None (queries exist)

**Schema changes needed:**
- Consider adding `excerpt` column, or compute dynamically

**Estimated effort:** Medium (1-1.5 hours)

#### 14. `/outreach` (HIGH EFFORT)

**Current state:** Pure mock. Entirely client-side with `mockProspects`, `mockSequences`.

**What needs to change:**
- DB already has `prospects`, `prospect_touches`, `industries` tables with full schema
- Need new queries: `getProspects()`, `getProspectTouches(prospectId)`, `getIndustries()`
- Need new server actions for prospect CRUD, touch logging, stage changes
- The mock `Prospect` type has `touchCount` and `sequence` fields that don't exist in DB - `touchCount` can be computed via aggregation, `sequence` concept needs design decision
- Convert from client to server+client architecture

**Queries needed (new):**
- `getProspects()` - with touch count aggregation
- `getProspectsByIndustry(industrySlug)` - filtered view
- `createProspect(data)` server action
- `updateProspectStage(id, stage)` server action
- `logTouch(data)` server action
- `getIndustries()` - for the industry filter

**Schema notes:**
- The `sequences` concept from mock data has no DB table. Either add a `sequences` table or treat sequence as a tag/field on prospects.

**Estimated effort:** Large (4-5 hours) - many new queries/actions, substantial component rewiring

#### 15. `/goals` (LOW EFFORT)

**Current state:** Hybrid. Server tries `getGoals()` and `getInvoices()`. Client falls back to `mockMonthlyRevenue` for revenue tracking.

**What needs to change:**
- Remove `mockMonthlyRevenue` fallback in client
- Server should compute total revenue and pass it down (already partially does this)
- Remove try/catch

**Queries needed (new):** None

**Estimated effort:** Small (30 min)

---

## Data Seeding Plan

### Recommendation: Seed with adapted mock data

The mock data is realistic and represents the actual STRVX client portfolio. We should seed the DB with this data to ensure a smooth transition where the dashboard still looks populated and correct after migration.

### Seed Script Approach

**Use a TypeScript seed script** (`scripts/seed.ts`) run via `tsx` or `ts-node`. SQL scripts are brittle with UUIDs and cross-references. TypeScript lets us use Drizzle ORM directly and handle relational inserts cleanly.

### Data to Seed

| Table | Source | Count | Notes |
|-------|--------|-------|-------|
| `users` | Hardcoded | 2 | Nick, Alex (already may exist from prior setup) |
| `companies` | `mockEngagements` | 8 | Extract unique companies |
| `contacts` | `mockContacts` | 8 | Link to companies |
| `engagements` | `mockEngagements` | 8 | Link to companies and contacts |
| `stage_history` | Derived from `mockEngagements` | 8+ | One entry per engagement for current stage |
| `interactions` | `mockTimeline` | ~15 | Flatten timeline entries per engagement |
| `next_actions` | `mockActions` | ~8 | Flatten actions per engagement |
| `calendar_events` | `mockCalendarEvents` | 12 | Map to DB schema |
| `tasks` | `mockTasks` | 15 | Map assignee names to user IDs, linkedEntity to engagementId/projectId |
| `projects` | `mockProjects` | 5 | Map team names to user references |
| `invoices` | `mockInvoices` | 8 | Map field names |
| `expenses` | `mockExpenses` | 15 | Map field names |
| `goals` | Hardcoded milestones | 5 | The revenue goal milestones from dashboard |
| `marketing_posts` | `initialPosts` | 13 | Map to DB schema |
| `documents` | `mockDocs` | 8 | Map to DB schema |
| `industries` | `mockOutreach` industries | 5 | HVAC, Electrical, Plumbing, Roofing, Solar |
| `prospects` | `mockProspects` | 15 | Map to DB schema |

### Seed Script Structure

```
scripts/
  seed.ts           -- main entry point
  seed-data/
    users.ts        -- user records
    companies.ts    -- derived from mock-data
    engagements.ts  -- derived from mock-data
    ...etc
```

The seed should be **idempotent** -- check if data exists before inserting (use `ON CONFLICT DO NOTHING` or check counts).

### Monthly Revenue

The `mockMonthlyRevenue` data does not correspond to actual invoice payments. For the seed, we should either:
- **Option A:** Create historical invoices that, when summed by month, produce the monthly revenue figures
- **Option B:** Add a `monthly_revenue_snapshots` table for pre-aggregated data
- **Option C (recommended):** Accept that monthly revenue will be computed from actual invoice `paidDate` data, and seed enough paid invoices across months to generate a meaningful chart

---

## Migration Order

### Phase 1: Foundation (Day 1)
**Goal:** Get the seed script running and core CRM pages on real data.

| Priority | Page | Why First |
|----------|------|-----------|
| 1 | Seed script | Everything depends on having data in the DB |
| 2 | `/pipeline` | Core CRM, simplest to migrate, validates DB connection |
| 3 | `/clients/[id]` | Core CRM detail view, all queries exist |
| 4 | `/calendar` | Fix the merge bug (showing mock + real), queries exist |
| 5 | `/contacts` | Already fully real, just verify after seed |

### Phase 2: Finance Pages (Day 2)
**Goal:** Get money tracking on real data.

| Priority | Page | Why |
|----------|------|-----|
| 6 | `/invoices` + `/invoices/[id]` | Queries exist, small effort |
| 7 | `/expenses` | Query exists, small effort |
| 8 | `/marketing` | Query + actions exist, small effort |
| 9 | `/goals` | Mostly wired, small effort |
| 10 | Extract shared constants | Move types/colors from mock files to constant files |

### Phase 3: Complex Pages (Days 3-4)
**Goal:** Wire up pages that need new queries or component refactoring.

| Priority | Page | Why |
|----------|------|-----|
| 11 | `/revenue` | Needs `getMonthlyRevenue()` query |
| 12 | `/finances` | Needs revenue query, remove mock fallbacks in client |
| 13 | `/clients` (list) | Needs `ClientsTable` refactoring for lazy-load |
| 14 | `/docs` + `/docs/[id]` | Queries exist, medium refactoring |
| 15 | `/dashboard` | Most complex, depends on all other queries being ready |

### Phase 4: Heavy Lifts (Days 5-7)
**Goal:** Migrate pages with significant component rewiring.

| Priority | Page | Why Last |
|----------|------|----------|
| 16 | `/tasks` + `/tasks/[id]` | Major component rewrite, type changes cascade through 6 components |
| 17 | `/projects` + `/projects/[id]` | Schema gaps (timeEntries, timeline), new actions needed |
| 18 | `/outreach` | Many new queries/actions, sequence concept needs design |

### Phase 5: Cleanup (Day 8)
**Goal:** Delete mock files, remove fallback patterns, final verification.

### Dependencies

```
seed script
  --> pipeline, clients/[id], calendar, invoices, expenses, marketing, goals
    --> revenue (needs getMonthlyRevenue)
    --> finances (needs getMonthlyRevenue)
    --> clients list (needs ClientsTable refactor)
    --> docs
      --> dashboard (needs all of the above)
        --> tasks (independent but high effort)
        --> projects (independent but needs schema decisions)
        --> outreach (independent but needs new queries)
```

---

## New Queries/Actions Needed (Complete List)

### New Queries (`queries.ts`)

| Query | Used By | SQL Complexity |
|-------|---------|---------------|
| `getMonthlyRevenue()` | dashboard, revenue, finances | Medium - aggregate paid invoices GROUP BY month |
| `getInvoicesSummary()` | dashboard | Low - SUM with WHERE status filters |
| `getBlockedAndUrgentTasks()` | dashboard | Low - filter tasks table |
| `getTask(id)` | tasks/[id] | Low - single row lookup |
| `getMRR()` | revenue | Low - SUM maintenanceMonthlyFee WHERE opted_in |
| `getProspects()` | outreach | Medium - JOIN with touch count aggregation |
| `getProspectsByIndustry(slug)` | outreach | Medium - filtered version of above |
| `getIndustries()` | outreach | Low - simple select |
| `getProjectTasks(projectId)` | projects/[id] | Low - filter tasks by projectId |
| `getProjectCalendarEvents(projectId)` | projects/[id] | Low - filter calendar_events by projectId |

### New Server Actions (`actions.ts`)

| Action | Used By |
|--------|---------|
| `createProject(data)` | projects |
| `updateProject(id, data)` | projects |
| `deleteProject(id)` | projects |
| `createProspect(data)` | outreach |
| `updateProspectStage(id, stage)` | outreach |
| `logProspectTouch(data)` | outreach |
| `deleteProspect(id)` | outreach |
| `updateInvoiceStatus(id, status)` | invoices (future) |
| `deleteInvoice(id)` | invoices (future) |
| `deleteExpense(id)` | expenses (future) |
| `deleteDocument(id)` | docs (future) |

---

## Schema Changes Needed

### Required Before Migration

1. **None** - all tables already exist for the core migration. The current schema covers engagements, contacts, companies, interactions, next_actions, calendar_events, tasks, projects, invoices, expenses, goals, marketing_posts, documents, prospects, prospect_touches, industries.

### Recommended Additions

| Table/Column | Reason | Priority |
|-------------|--------|----------|
| `documents.excerpt` (text column) | Mock data has excerpts shown on docs list page | Low - can compute from content |
| `prospect_sequences` table | Mock outreach has sequence concept (named outreach campaigns) | Medium - needed for outreach page |
| `time_entries` table | Mock projects have per-person time tracking | Low - defer unless time tracking is needed |
| `project_timeline` table OR derive from interactions | Mock projects have timeline entries (notes, emails, meetings, tasks, invoices) | Medium - needed for projects/[id] |

---

## Testing Strategy

### Per-Page Verification Checklist

For each migrated page:

1. **Data renders correctly** - all fields show real DB data, no "undefined" or missing values
2. **Empty state works** - page renders gracefully when table has zero rows
3. **Create/update/delete works** - mutations persist to DB and UI updates via `revalidatePath`
4. **Types match** - no TypeScript errors from DB data shape mismatches
5. **No mock imports remain** - grep the file for `mock-` imports, should find none

### Verification Order

After each phase, manually verify:

- Phase 1: Navigate through pipeline board, click into a client detail, check calendar, verify contacts list
- Phase 2: Check invoices table/detail, expenses list, marketing posts, goals page
- Phase 3: Check revenue charts use real data, finances overview correct, docs render from DB
- Phase 4: Create a task via the board, drag-and-drop, create a project, test outreach filters

### Rollback Plan

During migration, if a page breaks:

1. **Git revert** the specific page change (each page should be its own commit)
2. The mock data files will still exist until Phase 5 cleanup
3. If needed, re-add the try/catch fallback for that page as a temporary measure

This means: **do not delete mock files until ALL pages are verified working on real data.**

### Automated Testing

After migration is complete, consider adding:

- **Playwright tests** for each major flow (create engagement, move through pipeline, create invoice)
- **API route tests** for each server action
- **Database integration tests** for each query in `queries.ts`

---

## Mock Data Cleanup

### When to Delete

Mock files should only be deleted after ALL of the following are true:

1. Every page that imported the mock file has been migrated and verified
2. The seed script has been run successfully on the production DB
3. No imports of the mock file remain anywhere in the codebase
4. At least one full manual QA pass has been done on real data

### Cleanup Steps

1. **Extract constants first** - Before deleting any mock file, move types, color maps, and utility functions to new files:

   | From | Extract To | What to Extract |
   |------|-----------|-----------------|
   | `mock-tasks.ts` | `src/lib/task-constants.ts` | `TaskStatus`, `TaskPriority`, `Task` type, `TASK_STATUS_LABELS`, `TASK_STATUS_COLUMNS`, `PRIORITY_COLORS`, `PRIORITY_BORDER_COLORS`, `COLUMN_COLORS`, `ASSIGNEES`, `PRIORITY_ORDER`, `isOverdue`, `formatRelativeDate` |
   | `mock-calendar.ts` | `src/lib/calendar-constants.ts` | `EventType`, `CalendarEvent` type, `EVENT_TYPE_COLORS` |
   | `mock-finance.ts` | `src/lib/finance-constants.ts` | `InvoiceStatus`, `Invoice`, `LineItem`, `Expense`, `ExpenseCategory`, `MonthlyRevenue` types, `INVOICE_STATUS_COLORS`, `EXPENSE_CATEGORY_COLORS` |
   | `mock-projects.ts` | `src/lib/project-constants.ts` | `ProjectStatus`, `Project`, `TimeEntry`, `TimelineEntry` types, `PROJECT_STATUS_COLORS`, `ALL_STATUSES` |
   | `mock-marketing.ts` | `src/lib/marketing-constants.ts` | `MarketingPlatform`, `PostStatus`, `MarketingPost` type, `platformConfig`, `statusStyles` |
   | `mock-outreach.ts` | `src/lib/outreach-constants.ts` | `ProspectStage`, `ProspectIndustry`, `TouchChannel`, `Prospect` type, `STAGE_COLORS` |
   | `mock-docs.ts` | `src/lib/doc-constants.ts` | `DocFolder`, `Doc` type |

2. **Update all imports** - After extracting constants, update every file that imported from `mock-*.ts` to import from the new constants file instead.

3. **Delete mock files** - Remove all 9 files:
   - `src/lib/mock-data.ts`
   - `src/lib/mock-calendar.ts`
   - `src/lib/mock-finance.ts`
   - `src/lib/mock-tasks.ts`
   - `src/lib/mock-projects.ts`
   - `src/lib/mock-docs.ts`
   - `src/lib/mock-marketing.ts`
   - `src/lib/mock-outreach.ts`
   - `src/lib/mock-apollo.ts`

4. **Remove try/catch fallback pattern** - Search for all instances of:
   ```typescript
   try {
     const data = await queryFunction();
     // use data
   } catch {
     // Using mock data
   }
   ```
   Replace with direct query calls. If error handling is needed, use Next.js `error.tsx` boundaries.

5. **Final grep** - Run `grep -r "mock-" src/` and `grep -r "mockEngagements\|mockTasks\|mockInvoices\|mockProjects" src/` to verify zero remaining references.

### Final Cleanup Checklist

- [ ] All 9 mock files deleted
- [ ] Constants extracted to dedicated files
- [ ] All imports updated
- [ ] Zero `mock-` imports in codebase (verified via grep)
- [ ] Zero try/catch fallback patterns remaining
- [ ] All pages load with real DB data
- [ ] Empty states work for all pages
- [ ] All CRUD operations persist to DB
- [ ] Seed script documented in README
- [ ] No TypeScript errors (`npx tsc --noEmit` passes)

---

## Effort Summary

| Phase | Scope | Estimated Hours |
|-------|-------|----------------|
| Phase 1 | Seed script + core CRM (pipeline, client detail, calendar, contacts) | 3-4h |
| Phase 2 | Finance pages (invoices, expenses, marketing, goals) + constants extraction | 2-3h |
| Phase 3 | Complex wiring (revenue, finances, clients list, docs, dashboard) | 5-6h |
| Phase 4 | Heavy lifts (tasks, projects, outreach) | 10-12h |
| Phase 5 | Cleanup, final QA, documentation | 2-3h |
| **Total** | | **22-28h** |
