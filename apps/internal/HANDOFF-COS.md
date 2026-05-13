# Chief-of-Staff Agent — Handoff (apps/internal port)

> Branch: `feature/chief-of-staff` on `strvx` monorepo · ported from
> `strvx-internal-tool` branch `feature/agent-phase-0` (101-commit source) ·
> 422/422 tests · typecheck clean · nothing pushed, nothing deployed.

This document mirrors the source repo's HANDOFF.md, adapted for the new
file layout and naming used inside `apps/internal/`. See `OPS-COS.md`
(next to this file) for the daily-ops runbook.

## What's built

A single-tenant (`@strvx.com`) AI Chief-of-Staff over Gmail + Google Calendar.
Original source delivered the work across six phases; the port consolidates
the result into eight slices on `feature/chief-of-staff`.

| Phase | Scope |
|---|---|
| 0 | Foundation infra — DB schema (`cosRuns` and friends), AES-256-GCM at-rest token encryption, mailbox OAuth, Gmail watch/Pub-Sub plumbing, Trigger.dev v3 hybrid runtime, OpenAI client + cache-friendly prompt composer. |
| 1 | Gmail ingest — history parser, full MIME tree-walking message parser, 30-day backfill, classification (GPT-5-mini, strict JSON), Trigger.dev tasks + webhook gating. |
| 1.5 | Agent Inbox UI — 3-pane view (list/detail/agent panel), filter+sort, TipTap compose, Postgres FTS search, keyboard shortcuts (j/k/o/r/?). |
| 2 | Reply drafting + daily brief — planner reasoning loop (GPT-5 + tool use + 8-iter cap), 17 tools (read/write/terminal), draft card with send/edit/reject, `/agent/drafts` queue, `daily.brief.generate` cron + `/agent/brief`. |
| 3 | Calendar coordination — real `check_calendar`/`find_available_slots`/`propose_schedule` tools (PT working hours, 15-min buffer, freebusy, calendar OAuth scopes), `SchedulingProposalCard`, `calendar.event.create/update/delete` Trigger.dev jobs, "Send & schedule" combined action, `meeting.prep.brief` cron, `/agent/calendar`, post-meeting capture watcher, **booking webhook extension** (this port: see `apps/internal/src/app/api/webhooks/booking/route.ts`), `/agent/settings`. |
| 4 | Proactive follow-ups + CRM hygiene — `follow_up.stale_threads` (hourly), `follow_up.stale_pipeline` + `crm.hygiene.flags` (daily), `calendar.no_show.detect` (15min), stage-advancement signal detection (never auto-advances), `/agent/follow-ups`. |
| 5 | Polish — full keyboard shortcuts (e/s/l/Cmd+Enter/g i,b,d,c,f,s), `?` help modal, Cmd-K palette w/ thread search, voice samples UI + planner integration, custom snooze + unsnooze cron, realtime agent-thinking indicator, disconnect banner, `/agent/analytics`. |
| 6 | Hardening — dropped synthetic-thread booking hack, token-refresh failure → `is_active=false` + retry counter, realtime publication for `scheduling_proposals`/`cos_runs` with per-row pulse, `companies.website` + activated `domain_mismatch` hygiene, migrated Trigger.dev tasks + tools to `getAuthedMailboxClientSafe`, RFC 5322 `In-Reply-To` + `References` headers, Sentry instrumentation across all 19 Trigger.dev tasks with `{taskId, mailboxId, threadId, cosRunId}` tags, demo seed + smoke + RLS test scripts, multi-mailbox filter, `cos_runs.metadata` 30-day purge cron, engagement-linkage backfill, tests wired into CI, RLS verified on all 15 agent tables, wired `schedule_follow_up_watcher` tool, Sentry breadcrumbs in lib failure paths, label menu on `l` shortcut, voice-sample auto-suggest. |

## Naming notes (port-specific)

The source repo named the audit-trail table `agent_runs`. In this monorepo
the table is `cos_runs` and the Drizzle export is `cosRuns`; the column on
linked tables is `cos_run_id`. The enums are `cos_run_kind_enum` and
`cos_run_status_enum`. Everything else mirrors the source.

All imports use the monorepo path:

```ts
import { db, cosRuns, ... } from "@strvx/db";
```

The `@/lib/db` and `@/lib/db/schema` aliases re-export from `@strvx/db`
so handlers/queries can stay decoupled from the package path.

## Surface area

**19 cron/event Trigger.dev tasks** (in `apps/internal/src/trigger/`)

| Task | Cadence | Purpose |
|---|---|---|
| `gmail.watch.setup` | manual | one-off per mailbox |
| `gmail.watch.renew` | daily 02:00 UTC | refresh watch before 48h expiry |
| `gmail.message.received` | event | fan-out from webhook |
| `gmail.backfill` | event | 30-day historical pull on connect |
| `gmail.send` | event | approved draft sender |
| `agent.classify.message` | event | per-message classification |
| `agent.plan.thread` | event | per-thread planner loop |
| `agent.scheduling.followup` | event | from booking webhook |
| `daily.brief.generate` | 07:00 PT | morning brief |
| `meeting.prep.brief` | every 15m | upcoming-meeting briefs |
| `calendar.event.create/update/delete` | event | approval-gated calendar writes |
| `follow_up.fire` | every 15m | watcher dispatcher |
| `follow_up.stale_threads` | hourly | nudge stale outbound |
| `follow_up.stale_pipeline` | daily 08:00 PT | nudge stale engagements |
| `crm.hygiene.flags` | daily 08:30 PT | domain/duplicate/staleness checks |
| `calendar.no_show.detect` | every 15m | post-meeting no-show signal |
| `unsnooze.threads` | every 15m | wake snoozed threads |
| `cos.runs.metadata.purge` | daily | strip metadata older than 30 days |

**8 user-facing routes** under `apps/internal/src/app/(app)/`:
`/agent-inbox`, `/agent/brief`, `/agent/calendar`, `/agent/drafts`,
`/agent/follow-ups`, `/agent/settings`, `/agent/analytics`,
`/agent/connect-mailbox`.

**Database**: All chief-of-staff tables ship together in
`apps/internal/supabase/migrations/015_chief_of_staff_schema.sql`
(consolidated migration — what the source repo split across 13 numbered
migrations is one idempotent file here). Schema definitions live in
`packages/db/src/schema.ts`.

Tables include: `mailbox_oauth_tokens`, `mailbox_watches`, `email_threads`,
`email_messages`, `email_attachments`, `cos_runs`, `agent_classifications`,
`scheduling_proposals`, `email_drafts`, `follow_up_watchers`, `daily_briefs`,
`meeting_prep_briefs`, `agent_settings`, `crm_hygiene_flags`,
`agent_voice_samples`. Deltas on `interactions`, `calendar_events`,
`next_actions`, `companies`.

## Manual ops still required before production

These can't be done in code. Full step-by-step lives in the source repo at
`docs/superpowers/plans/2026-05-11-ai-chief-of-staff-phase-0-manual-ops.md`
(strvx-internal-tool). Summary:

1. **GCP project + Pub/Sub topology** — create `strvx-agent-prod`, enable
   Gmail+Pub/Sub APIs, create `gmail-events` topic, create push
   subscriptions per mailbox pointing at
   `https://app.strvx.com/api/webhooks/gmail`. Service account
   `gmail-push@…` for push auth.
2. **Workspace OAuth consent** — add scopes for Gmail modify/send +
   Calendar readonly/events + userinfo. Add production redirect URI
   `https://app.strvx.com/api/auth/google/mailbox/callback`.
3. **Vercel env vars** — mirror `.env.local` to Production.
   **`OAUTH_TOKEN_ENCRYPTION_KEY` must match exactly** — losing this
   permanently locks every encrypted token in production.
4. **Trigger.dev project** — connect via `pnpm dlx trigger.dev@latest dev`,
   then `trigger.dev deploy` once code is reviewed.
5. **OAuth smoke test** — connect a real mailbox via
   `/agent/connect-mailbox`, invoke `gmail.watch.setup`, send a test email,
   verify webhook fires.

## Kill switches

- `AGENT_INGEST_ENABLED` env var — gates the Gmail webhook + booking-webhook
  agent extension. Unset = disabled. Flip to enable in production.
- `AGENT_REALTIME_TABLES` env — controls which tables RealtimeProvider
  subscribes to.
- `is_active=false` on a row in `mailbox_oauth_tokens` — disables all
  per-mailbox crons + shows the disconnect banner. Set manually or
  auto-set by token-refresh failure.
- Per-mailbox settings (`agent_settings` table) — disable a mailbox's
  slot finding by setting `working_days=ARRAY[]::int[]`.

## Env vars

Same as the source repo. No new env vars were introduced after Phase 0.

## Cost shape (rough)

Per mailbox at ~50 inbound/day, 20 reply-needed/day:
- Classification: 70 × $0.0003 = $0.02/day
- Planner: 20 × $0.04 = $0.80/day
- Daily brief: $0.06/day
- Prep briefs (~3/day): $0.15/day
- **Total ≈ $1.03/day per mailbox** with current GPT-5-mini/GPT-5 pricing
  assumptions.

`/agent/analytics` shows real numbers once running.

## Known limitations & deferred work

These are deliberate trade-offs flagged across phases:

- **Single-tenant only.** `is_strvx_member()` RLS gate is hard-coded to
  `@strvx.com`. Multi-tenant would require an `org_id` column on every
  agent table.
- **No retroactive engagement linkage backfill** beyond the one-shot script
  (`apps/internal/scripts/backfill-engagement-links.ts`).
- **`getAuthedMailboxClient` (throwing variant) still in use** by
  gmail-backfill, calendar-event-*, follow-up-fire, etc. Only
  `meeting-prep-brief` uses the safe variant. The throwing variant fails
  the Trigger.dev run, which retries with backoff.
- **`domain_mismatch` hygiene** catches strict mismatches only; subdomain
  handling is false-positive territory.
- **Stage-advancement detection** is heuristic, not LLM-driven. False
  positives surface in `/agent/follow-ups` for human review — never
  auto-advance.
- **Phase 0 manual ops never executed.** Watches, Pub/Sub subscriptions,
  Vercel env all still need Nicolas to set up — see manual-ops doc.

## Quality gates

```bash
cd apps/internal
pnpm typecheck    # tsc --noEmit — clean
pnpm test         # vitest — 422/422 passing
pnpm agent:smoke  # 14 read-only PASS/FAIL checks against seeded DB
```

`pnpm build` is NOT safe while `next dev` is running.

## Where to look first

- New here? Read the source design spec at
  `strvx-internal-tool/docs/superpowers/specs/2026-05-11-ai-chief-of-staff-design.md`.
- Want to monitor? Open `/agent/analytics` (after first runs).
- Something's broken? Check `cos_runs` table for failed rows with
  `error_message`. The Trigger.dev dashboard has run-level logs.
- Daily ops: `OPS-COS.md` (next to this file).

## Demo

Without connecting a real Gmail mailbox, you can populate a realistic
demo state and verify the query layer:

```bash
cd apps/internal
pnpm agent:seed     # populates ~50 demo rows
pnpm agent:smoke    # 14 read-only PASS/FAIL checks
```

Then visit `/agent-inbox`, `/agent/drafts`, `/agent/brief`,
`/agent/follow-ups`. The mailbox is `demo-team@strvx.com` with placeholder
tokens — Gmail/Calendar API calls fail intentionally, but the rendering
layer works. Re-running `pnpm agent:seed` cleans + re-seeds (idempotent).
