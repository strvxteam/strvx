# STRVX Internal Dashboard -- Backend Architecture Document

**Date:** 2026-03-30
**Scope:** Full backend assessment of the STRVX internal tool (`tacoma`)
**Stack:** Next.js 16 + Drizzle ORM + Supabase (Postgres) + Vercel

---

## 1. Current Architecture Assessment

### How the backend is structured today

The app follows the Next.js App Router pattern with a clean separation between route groups:

- **`(app)/`** -- authenticated layout with sidebar, realtime provider, command palette. Contains all dashboard modules: pipeline, clients, calendar, tasks, invoices, expenses, goals, marketing, docs, outreach, projects, revenue, assets, toolbox, templates.
- **`(auth)/`** -- login route (currently unused since middleware auth is disabled).
- **`api/webhooks/calendly/`** -- single API route that ingests Calendly booking webhooks.
- **`auth/callback/`** -- Supabase OAuth code exchange route.

Data access is split across three layers:

| Layer | File | Role |
|-------|------|------|
| Schema | `src/lib/db/schema.ts` | 17 tables defined with Drizzle ORM |
| Queries | `src/lib/queries.ts` | Read-only data fetching (used by Server Components) |
| Mutations | `src/app/actions.ts` | Server Actions for all writes (626 lines, single file) |

The DB connection (`src/lib/db/index.ts`) uses `postgres.js` with `prepare: false` for PgBouncer compatibility. The connection string routes through Supabase's PgBouncer pooler on port 6543.

Supabase client setup exists for both server (`src/lib/supabase/server.ts`) and client (`src/lib/supabase/client.ts`) contexts, with a middleware helper (`src/lib/supabase/middleware.ts`) that is currently commented out in `src/middleware.ts`.

Realtime is wired via `src/lib/use-realtime.ts` and `src/components/layout/realtime-provider.tsx`, subscribing to 7 tables (interactions, next_actions, engagements, contacts, prospects, prospect_touches, industries) and triggering `router.refresh()` on any Postgres change.

### What works well

1. **Schema design is solid.** The engagement-centric model (companies -> engagements -> interactions/actions) with stage history tracking is well-normalized for a CRM. The prospect/outreach subsystem is properly separated from the client pipeline.
2. **Drizzle ORM + postgres.js is a strong choice.** Type-safe queries, no runtime overhead, good DX with `drizzle-kit push` for schema sync.
3. **Server Actions for mutations** keep write logic colocated and avoid the boilerplate of API routes. The `changeStage` and `quickAdd` actions correctly use transactions for multi-table writes.
4. **PgBouncer connection pooling** is already configured via Supabase's pooler, preventing connection exhaustion in serverless environments.
5. **Realtime refresh** via Supabase Postgres Changes gives multi-tab/multi-user reactivity without polling.
6. **Webhook architecture** for Calendly is well-implemented with HMAC signature verification and idempotency checks.

### What are the limitations

1. **Mock data fallback is pervasive.** 9 mock files totaling 2,185 lines are imported across 31 files. Many pages (outreach, calendar, finances, tasks, marketing, docs, expenses, projects) still read exclusively from mock data, not the database. The dashboard itself falls back to mocks on any error.
2. **No input validation.** Server Actions accept raw `FormData` and cast with `as string` without any Zod schemas or runtime validation. This is a security and reliability gap.
3. **No error handling in mutations.** The 626-line `actions.ts` file has zero try/catch blocks (aside from `getCurrentUser`). Any DB failure throws an unhandled error to the client.
4. **Authentication is disabled.** The middleware passes all requests through. `getCurrentUser()` falls back to `nick@strvx.com` from the users table. This means any person who hits the URL can read/write all data.
5. **Single monolithic actions file.** All 20+ mutation functions live in one file. This will become increasingly painful to navigate and review as the app grows.
6. **No API routes for external integrations.** Only the Calendly webhook exists. Future integrations (Apollo, Stripe, Slack) will need proper API endpoints.
7. **No caching directives.** No `export const revalidate`, `export const dynamic`, or `fetchCache` directives on any page. All Server Component pages hit the database on every request.

### Where are the bottlenecks as the app scales

1. **Database round-trips on every page load.** The dashboard page makes 4 parallel DB queries + 1 sequential query on every request. Without caching, this adds ~100-300ms per load at current scale, growing linearly with data volume.
2. **N+1 query patterns.** `getPipelineEngagements` uses a correlated subquery for `nextActionDueDate` and `getContacts` does the same for `lastInteraction`. These will degrade as row counts grow past a few hundred.
3. **Realtime-driven full page refreshes.** Any change to any watched table triggers a full `router.refresh()` for all connected clients. At 10+ concurrent users, this creates unnecessary DB load.
4. **The search function uses ILIKE.** `searchEngagements` does `ILIKE '%term%'` which cannot use indexes and requires full sequential scans.
5. **No pagination.** `getContacts()`, `getInvoices()`, `getExpenses()`, `getDocuments()`, `getMarketingPosts()`, `getGoals()` all return entire tables with no LIMIT.

---

## 2. Database Design Review

### Current tables (17)

| Table | Purpose | FK relationships |
|-------|---------|-----------------|
| `users` | Team members | -- |
| `companies` | Client organizations | -- |
| `contacts` | People at companies | -> companies |
| `engagements` | Deals/projects (core entity) | -> companies, -> contacts |
| `stage_history` | Engagement stage audit log | -> engagements |
| `interactions` | Timeline entries | -> engagements, -> users |
| `next_actions` | Action items per engagement | -> engagements, -> users, -> interactions |
| `industries` | Outreach industry lookup | -- |
| `prospects` | Outreach leads | -> industries, -> users, -> companies, -> contacts |
| `prospect_touches` | Outreach communication log | -> prospects, -> users |
| `apollo_sync_log` | External sync audit trail | -> users |
| `projects` | Internal projects | -> engagements |
| `project_members` | Project team assignments | -> projects, -> users |
| `calendar_events` | Schedule entries | -> engagements, -> projects, -> users |
| `tasks` | Team task board | -> users, -> engagements, -> projects |
| `invoices` | Billing records | -> engagements |
| `expenses` | Cost tracking | -- |
| `goals` | Revenue/OKR targets | -- |
| `marketing_posts` | Content calendar | -> users |
| `documents` | Internal docs/wiki | -> users |

### Table relationships assessment

The relationships are generally correct. Issues worth addressing:

1. **`invoices.clientName` duplicates `companies.name`.** Invoices have both `engagementId` (FK to engagements, which links to companies) and a denormalized `clientName` text field. This will drift if a company name changes. Consider making `engagementId` required and deriving the client name, or adding a direct `companyId` FK.

2. **`projects.client` is a free-text field** despite having `engagementId` for the same purpose. This should either be removed (derive from engagement -> company) or replaced with a `companyId` FK.

3. **`projects.team` is a text array** instead of using the existing `project_members` junction table. These two representations of project membership will conflict.

4. **`calendar_events.client` is free text.** Same issue -- should derive from the engagement/project FK.

5. **`expenses` has no FK to anything.** Cannot attribute expenses to engagements, projects, or users. Add `engagementId`, `projectId`, and `createdBy` FKs for P&L per client/project.

6. **`goals` has no FK to anything.** Cannot tie goals to users, teams, or time periods. Consider `ownerId` and a `period` (quarterly/yearly) field.

7. **`prospects` -> `industries` uses `slug` as FK** rather than the UUID primary key. This works but makes the industries table immutable (changing a slug cascades nothing). The `ON DELETE` behavior is not specified, so it defaults to `NO ACTION` which will block industry deletion.

### Missing indexes that would improve performance

The schema only defines 2 indexes (both on `prospects`). The following are strongly recommended:

```
-- High priority (hit on every page load)
CREATE INDEX idx_engagements_archived ON engagements(archived_at) WHERE archived_at IS NULL;
CREATE INDEX idx_engagements_stage ON engagements(stage) WHERE archived_at IS NULL;
CREATE INDEX idx_interactions_engagement ON interactions(engagement_id, created_at DESC);
CREATE INDEX idx_next_actions_engagement ON next_actions(engagement_id) WHERE completed = false AND archived_at IS NULL;
CREATE INDEX idx_next_actions_due ON next_actions(due_date) WHERE completed = false AND archived_at IS NULL;
CREATE INDEX idx_contacts_company ON contacts(company_id) WHERE archived_at IS NULL;

-- Medium priority (used in specific pages)
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_stage_history_engagement ON stage_history(engagement_id, entered_at DESC);
CREATE INDEX idx_prospect_touches_prospect ON prospect_touches(prospect_id, sent_at DESC);

-- Search (if keeping ILIKE approach)
CREATE INDEX idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);
CREATE INDEX idx_engagements_name_trgm ON engagements USING gin (name gin_trgm_ops);
```

**Effort:** 2-4 hours to add all indexes via a Drizzle migration. The partial indexes (WHERE clauses) will give the biggest wins since most queries filter on `archived_at IS NULL`.

### Normalization issues

- **Denormalized client names** in invoices, calendar_events, and projects as described above.
- **`engagements.tags`** uses a text array. This is fine for now but prevents querying "all engagements with tag X" efficiently. If tags become a first-class feature, extract to a `tags` table + `engagement_tags` junction.
- **`invoices.lineItems`** is JSONB. Acceptable for simple line items, but limits the ability to query/aggregate across invoices (e.g., "total revenue from service type X").

### Schema changes needed for new features

1. **Audit trail.** Add `updated_at` to engagements, contacts, next_actions, tasks, projects. Currently only `documents` has it.
2. **Soft delete consistency.** Only engagements, contacts, next_actions, and prospects have `archivedAt`. Tasks, projects, invoices, and calendar_events have no soft delete mechanism.
3. **File attachments.** No table for file uploads. When the app needs proposals, contracts, or receipts, add a `files` table with Supabase Storage integration.
4. **Notifications.** No notification system. Add a `notifications` table (`userId`, `type`, `title`, `body`, `readAt`, `linkTo`) for in-app alerts.
5. **Activity log.** The `interactions` table only covers engagement timelines. A generic `activity_log` table would cover system-wide events for auditing.

---

## 3. Authentication & Authorization

### Current state

Authentication is **completely disabled**:

- `src/middleware.ts` is a pass-through (`NextResponse.next()`).
- `getCurrentUser()` in actions.ts catches auth failures and falls back to `nick@strvx.com`.
- The Supabase middleware helper at `src/lib/supabase/middleware.ts` is fully written but commented out.
- The OAuth callback at `src/app/auth/callback/route.ts` is functional.
- The login route group `(auth)/login/` exists.

This means the app is fully open to anyone with the URL. All data is readable and writable without authentication.

### Recommended auth flow

**Phase 1 -- Magic links (1-2 days effort)**

Magic links are the fastest path to production-grade auth for a small team:

1. Re-enable the Supabase auth middleware by uncommenting the import in `src/middleware.ts` and calling `updateSession(request)`.
2. Build the login page at `src/app/(auth)/login/page.tsx` with an email input that calls `supabase.auth.signInWithOtp({ email })`.
3. Add an allowlist check: validate the email domain is `@strvx.com` or is in a `team_emails` table before allowing sign-in.
4. Update `getCurrentUser()` to remove the dev fallback and throw on unauthenticated requests.

**Phase 2 -- OAuth (optional, 1 day effort)**

Add Google OAuth since the team already uses Google Workspace:

1. Configure Google OAuth provider in Supabase dashboard.
2. Add "Sign in with Google" button to login page.
3. The existing `auth/callback/route.ts` already handles code exchange.

**Phase 3 -- Team invites (1-2 days effort)**

Build an admin invite flow:

1. Admin sends magic link to new team member's email.
2. On first login, auto-create a `users` row linked to the Supabase auth user via `auth.uid()`.
3. Add a `supabase_auth_id` column to the `users` table to link the two systems.

### Row Level Security (RLS) policies needed

Once auth is enabled, RLS should be added incrementally. Priority order:

```sql
-- 1. Users can only see their own user record and team members
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_team" ON users FOR SELECT USING (true);
-- All team members can see all users (small team)

-- 2. All authenticated users can read all business data
-- (appropriate for a small internal team)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_team_read" ON companies FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "companies_team_write" ON companies FOR ALL
  USING (auth.role() = 'authenticated');

-- Repeat for: engagements, contacts, interactions, next_actions,
-- stage_history, prospects, prospect_touches, tasks, invoices,
-- expenses, projects, calendar_events, goals, marketing_posts, documents

-- 3. Service role bypass for webhooks
-- The Calendly webhook route should use the service_role key
-- to bypass RLS (already needed since webhooks are unauthenticated)
```

**Note:** For a small team (2-3 people), "all team members can see everything" is the right policy. Do not over-engineer per-user data isolation until the team grows past 10 or this becomes a multi-tenant product.

### Role-based access control

Keep it simple for now. Two roles are sufficient:

| Role | Permissions |
|------|------------|
| `admin` | Full CRUD on all entities, invite team members, manage settings |
| `member` | Full CRUD on all entities except team management |

Add a `role` column to the `users` table with a `text` type defaulting to `'member'`. Check this in server actions for sensitive operations (user management, dangerous deletes).

**Effort:** 3-5 days total for Phase 1 + RLS + role column.

---

## 4. API Design

### Current state

The app has exactly one API route (`/api/webhooks/calendly`) and zero REST/GraphQL endpoints. All data flows through:

- **Server Components** calling query functions directly (reads)
- **Server Actions** called from client components via form submissions or `startTransition` (writes)

### Should we add REST or GraphQL endpoints?

**Not yet.** The Server Actions + Server Components pattern is the correct architecture for this app today. API routes should only be added when:

1. **External systems need to push data in** (webhooks) -- already done for Calendly.
2. **External systems need to pull data out** -- e.g., if you build a mobile app, a Slack bot, or expose data to a client portal.
3. **Long-running operations** that exceed the serverless function timeout (API routes with streaming).

When the time comes, **REST over GraphQL**. GraphQL adds complexity (schema definition, resolvers, client libraries) that is not justified for an internal tool. REST routes in `src/app/api/` with Zod validation are simpler and faster to build.

### When to use Server Actions vs API routes

| Use Case | Pattern |
|----------|---------|
| Form submissions from the dashboard | Server Action |
| Client component state mutations (drag-and-drop, toggles) | Server Action |
| Webhook ingestion from external services | API Route (POST) |
| Data needed by external apps (mobile, Slack bot) | API Route (GET/POST) |
| File uploads to Supabase Storage | API Route (POST with streaming) |
| Long-running operations (PDF generation, email sending) | API Route or Supabase Edge Function |
| Cron jobs (scheduled reports, cleanup) | Supabase Edge Function or Vercel Cron |

### API versioning strategy

Not needed until you expose external APIs. When that time comes, use path-based versioning (`/api/v1/engagements`). Do not version internal server actions.

### Rate limiting considerations

**Priority:** Low for now (internal tool with 2-3 users). When adding external-facing endpoints:

1. Add rate limiting to the Calendly webhook: 100 requests/minute per IP. Use Vercel's built-in rate limiting or a simple in-memory counter.
2. For future public APIs: use Upstash Redis with `@upstash/ratelimit` (serverless-compatible, ~2 hours to integrate).
3. Protect login/auth routes from brute force: Supabase handles this by default (rate limiting on OTP sends).

---

## 5. Performance Optimization

### Caching strategies

**Immediate wins (effort: 1-2 hours each):**

1. **Add `revalidate` to static-ish pages.** Pages like `/goals`, `/marketing`, `/docs` that change infrequently should set `export const revalidate = 60` (ISR with 60-second staleness). This eliminates redundant DB queries.

2. **Use `unstable_cache` for expensive queries.** The dashboard makes 5 DB calls per load. Wrap them:
   ```ts
   import { unstable_cache } from "next/cache";

   export const getCachedDashboardMetrics = unstable_cache(
     getDashboardMetrics,
     ["dashboard-metrics"],
     { revalidate: 30, tags: ["dashboard"] }
   );
   ```
   Then `revalidateTag("dashboard")` in the relevant server actions.

3. **Add `loading.tsx` to all route groups.** The `(app)/loading.tsx` exists but individual pages should have skeleton loaders for perceived performance.

**Medium-term (effort: 1-2 days):**

4. **Replace realtime full-refresh with targeted invalidation.** Instead of `router.refresh()` on every Postgres change, subscribe to specific channels and only invalidate affected components. This requires moving to a more granular state management approach.

5. **Implement SWR for client-side data.** For pages that are currently `"use client"` with mock data (outreach, calendar, tasks), use `useSWR` with server action fetchers. This gives stale-while-revalidate caching on the client.

**Not recommended yet:**

- **Redis:** Overkill for current scale (2-3 users, <1000 rows). Revisit when response times exceed 500ms consistently.
- **CDN/Edge caching:** Internal tool with authenticated routes. No benefit from CDN caching.

### Database query optimization

1. **Add the indexes listed in section 2.** This is the single highest-impact optimization.

2. **Fix the search query.** Replace ILIKE with Postgres full-text search:
   ```sql
   CREATE INDEX idx_companies_fts ON companies USING gin (to_tsvector('english', name));
   CREATE INDEX idx_engagements_fts ON engagements USING gin (to_tsvector('english', name));
   ```
   Or use Supabase's built-in full-text search with `textSearch` in the Supabase client.

3. **Add pagination to all list queries.** Every `getAll` function should accept `{ limit, offset }` parameters. Default to 50 rows. Critical for: `getContacts`, `getInvoices`, `getExpenses`, `getDocuments`, `getMarketingPosts`, `getTasks`.

4. **Eliminate correlated subqueries.** In `getPipelineEngagements` and `getContacts`, replace the inline `SELECT` subqueries with proper JOINs or lateral joins.

### Connection pooling

The current setup is correct:

- `DATABASE_URL` points to Supabase's PgBouncer pooler on port `6543` with `?pgbouncer=true`.
- `postgres.js` is initialized with `prepare: false` (required for PgBouncer's transaction mode).
- The Drizzle instance is created once at module scope and reused.

**Potential issue:** The `postgres.js` client is created with no explicit connection pool size. In a serverless environment (Vercel), each function invocation creates a new connection. PgBouncer handles this, but Supabase's free/Pro plan has a 60 direct connection limit (200 pooled). Monitor connection count in the Supabase dashboard.

**Action:** Add connection monitoring. Check `SELECT count(*) FROM pg_stat_activity` periodically or enable Supabase's built-in connection monitoring alerts.

### Image/asset optimization

- `next.config.ts` is empty -- no image optimization configuration.
- No external image domains are configured (will fail if the app loads external images).
- Add `images.remotePatterns` for Supabase Storage URLs when file uploads are implemented.

---

## 6. Monitoring & Observability

### Current state

There is **zero monitoring** in place. No error tracking, no performance monitoring, no alerting.

### Recommended stack

**Phase 1 -- Error tracking (2-3 hours, high priority):**

Install Sentry for Next.js:
```bash
pnpm add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

This gives:
- Automatic error capture in Server Components, Server Actions, and client components.
- Source map uploads for readable stack traces.
- Performance transaction tracing.
- Session replay for debugging user-reported issues.

Sentry's free tier (5K errors/month, 10K transactions/month) is more than sufficient.

**Phase 2 -- Database monitoring (1 hour):**

- Enable Supabase Dashboard monitoring (already available on all plans).
- Set up alerts for: connection count > 50, query duration > 2 seconds, disk usage > 80%.
- Review the `pg_stat_statements` extension (enabled by default on Supabase) monthly to identify slow queries.

**Phase 3 -- Uptime monitoring (30 minutes):**

Use a free service (Better Uptime, UptimeRobot, or Vercel's built-in monitoring):
- Monitor the production URL with 1-minute checks.
- Alert via Slack/email on downtime.

**Phase 4 -- Structured logging (half day, lower priority):**

Add structured logging to Server Actions for audit trail:
```ts
function log(action: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ action, ...data, timestamp: new Date().toISOString() }));
}
```

Vercel captures `console.log` output in Runtime Logs. For longer retention, pipe to LogTail (Vercel's integration) or Axiom.

### Alerting for critical issues

Priority alerts to set up:

| Alert | Trigger | Channel |
|-------|---------|---------|
| App down | 2 consecutive failed health checks | Slack + SMS |
| Error spike | >10 unhandled errors in 5 minutes | Slack |
| DB connection exhaustion | >40 active connections | Slack |
| Slow queries | Any query >5 seconds | Slack |
| Webhook failures | Calendly webhook returns 500 3x in a row | Slack |

---

## 7. Deployment & Infrastructure

### Current setup

- **Hosting:** Vercel (inferred from Next.js 16 + no Docker/Fly config).
- **Database:** Supabase Postgres (us-east-2, AWS).
- **Connection pooling:** Supabase PgBouncer on port 6543.
- **Domain:** Likely Vercel auto-generated (no `vercel.json` present).
- **CI/CD:** None. No `.github/workflows`, no `vercel.json`, no build/test scripts beyond `next build`.

### CI/CD pipeline recommendations

**Phase 1 -- Basic CI (2-3 hours):**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm build
```

This catches type errors and lint issues before merge. The `typecheck` and `lint` scripts already exist in `package.json`.

**Phase 2 -- Add tests (1-2 days initial setup):**

No test files exist in the codebase. Start with:
1. Install Vitest: `pnpm add -D vitest @testing-library/react`
2. Write unit tests for server actions (mock the DB layer)
3. Write integration tests for critical query functions
4. Add `pnpm test` to CI

**Phase 3 -- Preview deployments (already free with Vercel):**

Vercel auto-deploys preview URLs for every PR. Ensure this is configured in the Vercel dashboard.

### Environment management

Current state: Only `.env.local` exists. Recommended setup:

| Environment | Database | Branch | Purpose |
|-------------|----------|--------|---------|
| `development` | Local Supabase or dev project | feature branches | Day-to-day development |
| `preview` | Supabase branch DB (Pro plan) | PR branches | Preview deployments |
| `production` | Current Supabase project | `main` | Live app |

**Supabase branching** (available on Pro plan) gives isolated databases per preview deployment. This prevents test data from polluting production.

If branching is not available, create a second Supabase project for staging. Set the staging `DATABASE_URL` as a Vercel environment variable for the Preview environment.

### Database migrations workflow

Currently using `drizzle-kit push` which directly mutates the database schema without migration files. This is fine for solo development but dangerous for production.

Recommended workflow:

1. **Switch to migration files:** Use `pnpm db:generate` (already configured as `drizzle-kit generate`) to create SQL migration files in `/drizzle`.
2. **Apply migrations in CI/CD:** Run `drizzle-kit migrate` as part of the deploy pipeline (Vercel build step or a pre-deploy script).
3. **Never run `drizzle-kit push` against production.** Reserve it for local development only.
4. **Review migration files in PRs.** Every schema change generates a reviewable SQL file.

**Effort:** 1-2 hours to establish the workflow. Generate the initial baseline migration from the current schema.

---

## 8. Data Backup & Recovery

### Supabase backup strategy

Supabase provides automatic daily backups on the Pro plan (retained for 7 days) and point-in-time recovery (PITR) with WAL archiving. On the free plan, only weekly backups with 7-day retention.

**Recommendations:**

1. **Confirm you are on Supabase Pro.** The free plan's weekly backups are insufficient for a business-critical tool. Pro plan ($25/month) gives daily backups + PITR.
2. **Enable PITR** if not already active. This allows restoring to any point in time (within the retention window), not just the daily snapshot.
3. **Test a restore** at least once. Download a backup, spin up a local Postgres instance, and verify the data loads correctly.

### Point-in-time recovery

With PITR enabled:
- Recovery granularity: ~seconds (based on WAL replay)
- Retention: 7 days (Pro) or 28 days (Team/Enterprise)
- Process: Supabase Dashboard -> Database -> Backups -> Point-in-Time Recovery

### Data export capabilities

Currently the app has **no export functionality**. Add these in priority order:

1. **CSV export for invoices and expenses** (critical for accounting). Add a server action that queries the data and returns a CSV string. Render a download button in the UI. Effort: 2-3 hours.
2. **Pipeline data export** for reporting. Same pattern.
3. **Full database dump** for archival. Use `pg_dump` via Supabase CLI or the dashboard's backup download.

### Additional backup measures

- **Webhook idempotency logs** (`apollo_sync_log`) already exist. Good.
- **Stage history** (`stage_history`) preserves all pipeline transitions. Good.
- Consider adding a nightly `pg_dump` to a Supabase Storage bucket or S3 bucket as an additional backup layer independent of Supabase's built-in backups.

---

## 9. Scaling Considerations

### When will the current stack hit limits?

The current stack (Vercel + Supabase) can handle **significantly more load** than the app currently generates. Realistic limits:

| Dimension | Current | Comfortable Limit | Action Required At |
|-----------|---------|-------------------|-------------------|
| Team size | 2-3 | 10-15 | >15 (need RBAC, audit trail) |
| Engagements | ~10 | 500 | >500 (need pagination, search optimization) |
| Interactions | ~50 | 10,000 | >10K (need pagination, archiving) |
| Prospects | ~50 | 5,000 | >5K (need bulk operations, queuing) |
| Concurrent users | 1-2 | 20 | >20 (need granular realtime, caching) |
| Monthly DB queries | ~1K | 100K | >100K (need query caching, read replicas) |

**Bottom line:** The current stack will not be the bottleneck for the next 12-18 months of organic growth. The first limits you will hit are developer velocity issues (mock data removal, test coverage, error handling), not infrastructure limits.

### What to do when the team grows beyond 3 people

1. **Enable authentication first** (described in section 3). Non-negotiable before adding a 4th person.
2. **Add audit logging.** Who changed what, when. Critical for accountability with more than 2-3 people.
3. **Implement proper RBAC.** Different team members may need different access levels (e.g., interns should not see financials).
4. **Add a `team_id` column** to multi-tenancy-sensitive tables if STRVX splits into sub-teams or departments.
5. **Set up proper environments** (dev/staging/prod) so multiple developers can work without stepping on each other.

### Multi-tenant considerations if this becomes a product

If the STRVX dashboard is ever offered as a product to other agencies:

1. **Add `organization_id` to every table.** This is the single most important schema change. It must happen before any multi-tenant data enters the system.
2. **RLS policies must enforce tenant isolation.** Every SELECT/INSERT/UPDATE/DELETE must filter by `organization_id = auth.jwt()->>'org_id'`.
3. **Separate billing and usage tracking.** Add tables for subscription plans, usage meters, and billing events.
4. **Consider database-per-tenant vs schema-per-tenant vs shared-table** architecture:
   - Shared tables with `organization_id` (cheapest, easiest, sufficient up to ~100 tenants)
   - Schema-per-tenant (better isolation, harder to maintain)
   - Database-per-tenant (strongest isolation, most expensive, needed for enterprise clients)

**Recommendation:** Start with shared tables + RLS. This is what the Supabase architecture is designed for.

### Database scaling

In order of when you would need them:

1. **Indexes** (now) -- described in section 2.
2. **Query caching** (100+ users) -- `unstable_cache` or Redis.
3. **Read replicas** (1000+ daily active users) -- Supabase supports read replicas on the Team plan. Point read-heavy queries (dashboard metrics, pipeline views) at the replica.
4. **Table partitioning** (>1M rows in a single table) -- Partition `interactions` and `stage_history` by date range. Unlikely to be needed for years.
5. **Connection pooling tuning** (>50 concurrent connections) -- Increase PgBouncer pool size or switch to Supabase's IPv4 add-on for direct connections.

---

## 10. Technical Debt

### High priority (address before shipping to the team)

| Item | Files affected | Effort | Impact |
|------|---------------|--------|--------|
| **Remove mock data fallback** | 31 files importing from 9 mock files | 3-5 days | Eliminates the dual-data-source confusion. Pages that still use mocks (outreach, calendar, finances, tasks, marketing, docs, projects, expenses, revenue, assets, templates, toolbox) need their queries wired to the database. |
| **Add Zod validation to all server actions** | `src/app/actions.ts` | 1-2 days | Prevents invalid data from reaching the database. Every `formData.get("x") as string` cast is a potential crash or bad data insertion. |
| **Add error handling to server actions** | `src/app/actions.ts` | 1 day | Wrap all DB operations in try/catch, return structured `{ success, error }` responses instead of throwing. |
| **Enable authentication** | `src/middleware.ts`, `src/app/actions.ts` | 2-3 days | The app is fully open. This is a data breach waiting to happen. |

### Medium priority (address within the next quarter)

| Item | Files affected | Effort | Impact |
|------|---------------|--------|--------|
| **Split `actions.ts` into domain modules** | `src/app/actions.ts` (626 lines) | Half day | Split into `src/app/actions/engagements.ts`, `actions/tasks.ts`, `actions/invoices.ts`, etc. Improves readability and code review. |
| **Add database indexes** | `src/lib/db/schema.ts` | 2-4 hours | Direct performance improvement on every page load. |
| **Add pagination to all list queries** | `src/lib/queries.ts` | 1 day | Prevents full table scans as data grows. |
| **Add `updatedAt` timestamps** | `src/lib/db/schema.ts` | 1 hour | Required for proper cache invalidation and conflict detection. |
| **Wire up remaining pages to DB** | outreach, calendar, finances, tasks, marketing, docs, etc. | 1-2 weeks | Complete the migration from mock data to real data. |
| **Set up CI pipeline** | `.github/workflows/` | 2-3 hours | Catches regressions before merge. |

### Low priority (nice to have)

| Item | Files affected | Effort | Impact |
|------|---------------|--------|--------|
| **Add test suite** | New files | 2-3 days initial | Zero test coverage currently. Start with server action tests. |
| **Improve search with full-text search** | `src/lib/queries.ts` | Half day | Better search results, faster queries. |
| **Add `vercel.json` configuration** | New file | 1 hour | Configure headers, rewrites, and function regions. |
| **Fix denormalized client name fields** | schema.ts, queries.ts | Half day | Prevent data drift between tables. |
| **Add structured logging** | `src/app/actions.ts` | Half day | Audit trail for all mutations. |

### Dependencies to update

The current dependency versions are recent (as of late March 2026). Key ones to keep current:

- `next@16.2.1` -- major version, keep on latest 16.x
- `drizzle-orm@0.45.2` / `drizzle-kit@0.31.10` -- active development, frequent releases
- `@supabase/ssr@0.9.0` -- important security patches
- `react@19.2.4` -- stable, no immediate concern

Run `pnpm outdated` monthly and update non-breaking dependencies. Major version bumps (Next.js, React) should be done deliberately with testing.

### Code quality improvements

1. **Extract types.** Many types are defined inline in page components (e.g., `ActivityItem`, `AtRiskItem` in the dashboard page). Extract to `src/types/` for reuse.
2. **Remove unused imports.** Several mock imports remain in files that also import from `@/lib/queries`, creating confusion about which data source is actually used.
3. **Consistent naming.** Some files use kebab-case (`dashboard-client.tsx`), others use Pascal case. Standardize on kebab-case for files, PascalCase for components.
4. **Add `"use strict"` TypeScript config.** Verify `strict: true` is set in `tsconfig.json`. The lack of Zod validation suggests type safety may not be fully enforced at boundaries.

---

## Appendix: Recommended Priority Order

If addressing these items sequentially, here is the recommended order based on risk reduction and ROI:

1. **Enable authentication** (section 3, Phase 1) -- security critical
2. **Add Zod validation to server actions** (section 10) -- data integrity
3. **Add error handling to server actions** (section 10) -- reliability
4. **Add database indexes** (section 2) -- performance
5. **Set up Sentry** (section 6) -- visibility
6. **Remove mock data, wire all pages to DB** (section 10) -- feature completeness
7. **Set up CI pipeline** (section 7) -- developer velocity
8. **Split actions.ts into modules** (section 10) -- maintainability
9. **Add pagination** (section 5) -- scalability
10. **Add caching directives** (section 5) -- performance

Total effort for items 1-6: approximately 2-3 weeks of focused work.
