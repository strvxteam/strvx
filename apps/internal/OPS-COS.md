# Chief-of-Staff Agent — Ops Runbook (apps/internal port)

Daily operational reference. See `HANDOFF-COS.md` (next to this file) for
what's built, and the source repo design spec at
`strvx-internal-tool/docs/superpowers/specs/2026-05-11-ai-chief-of-staff-design.md`
for the full architecture writeup.

## Health checks (daily)

1. `/agent/analytics` — Run counts, success rate, cost. Anomalies:
   success rate < 90%, cost > 2× last-week average.
2. `mailbox_oauth_tokens.is_active` — All connected mailboxes still
   active? Disconnect banner shows in UI when any is false.
3. `cos_runs WHERE status='failed' AND created_at > now() - interval '24h'`
   — Investigate failures.
4. `follow_up_watchers WHERE status='pending' AND trigger_after < now() - interval '1h'`
   — Stuck watchers (cron lagging or `follow_up.fire` broken).
5. `/agent/follow-ups` — Hygiene flags pile up means cron is working
   but no one's triaging.

## Common operations

### Connect a new mailbox

1. Sign in as `@strvx.com` user, navigate to `/agent/connect-mailbox`.
2. Click "Connect a new Gmail mailbox", complete OAuth.
3. From Trigger.dev dashboard, invoke `gmail.watch.setup` with
   `{ mailboxId: "<new-id>" }`.
4. Optionally invoke `gmail.backfill` to pull 30 days of history.

### Disconnect a mailbox

```sql
UPDATE mailbox_oauth_tokens SET is_active = false WHERE email = '<addr>';
```

The disconnect banner appears, all per-mailbox crons skip it. To fully
revoke: also revoke at https://myaccount.google.com/permissions.

### Pause the agent globally

Set `AGENT_INGEST_ENABLED=false` in Vercel + redeploy. Gmail webhook +
booking-webhook agent extension stop firing. Existing crons keep running
but won't process new inbound. To fully pause crons: pause the project
in Trigger.dev.

### Re-encrypt OAuth tokens (key rotation)

1. Generate new key, write to a temp env var.
2. Read each `mailbox_oauth_tokens` row with old key, re-encrypt with
   new key.
3. Swap `OAUTH_TOKEN_ENCRYPTION_KEY` to new value.

Adapt the source repo's `scripts/encrypt-google-tokens.ts` if a rotation
is needed (not yet ported to `apps/internal/scripts/`).

⚠️ Mismatched key in Vercel vs DB = all encrypted tokens unusable until
corrected. Make this a planned-window operation.

### Reset a thread

```sql
-- "Hand it back to me; agent did wrong":
UPDATE email_threads
SET agent_state = 'pending', requires_human = true
WHERE id = '<thread-id>';

UPDATE email_drafts
SET status = 'superseded'
WHERE thread_id = '<thread-id>' AND status IN ('pending_review','approved');
```

### Force-generate today's daily brief

From Trigger.dev dashboard: invoke `daily.brief.generate` task. The page
at `/agent/brief` has an "On-demand" button that does the same.

### Drain follow-up watchers

`follow_up.fire` runs every 15min. To force: invoke from Trigger.dev
dashboard. Each watcher is idempotent on its row id.

## Failure modes

### "Pub/Sub push not reaching us"

- Check GCP Pub/Sub subscription ack rate.
- Verify `GOOGLE_PUBSUB_WEBHOOK_URL` matches deployed URL.
- Check `pubsub-jwt.ts` JWT verification for clock skew (set NTP).
- Webhook returns 200 to ack — 401/403 means JWT audience mismatch.

### "Calendar tools return scope_missing"

Mailbox OAuth was granted before Phase 3's calendar scope bump. User must
reconnect at `/agent/connect-mailbox`. The `RECONSENT_REQUIRED` note in
the source repo's design doc documents this.

### "Agent runs cost spike"

Investigate via `/agent/analytics`. Common causes:
- Planner loop hitting 8-iteration cap (each iter is a full GPT-5 call).
- Reasoning runs on every reply-needed inbound when classifier
  confidence is too generous.
- Voice samples block too large (each starred sample adds tokens to every
  planner call for that mailbox).

Mitigations: shorten voice samples (`note` field), reduce starred count,
tighten classification's `requires_reply` rule.

### "Token refresh failed, mailbox disconnected"

`refresh_failure_count > 5` triggers auto-disable. Check
`last_refresh_error` for the actual error. Reconnect via
`/agent/connect-mailbox` to re-grant. The `clearRefreshFailureState` in
`mailbox-oauth.ts` resets the counter on next successful refresh.

### "Daily brief is empty / boring"

Brief inputs are SQL-assembled (`src/lib/agent/brief/inputs.ts`). If
empty: nothing's been classified yet, or the cron ran before
classifications landed. Trigger manually after a busy morning.

### "Scheduling proposal didn't create a calendar event"

Status flow: pending → confirmed (via Send & schedule) → created (via
`calendar.event.create`). If stuck at `confirmed`: check `cos_runs`
linked via `cosRunId`, look for `error_message`. Common cause:
insufficient OAuth scope (see RECONSENT_REQUIRED note).

## Monitoring & alerts (suggested, not yet wired)

Hook these into Sentry or PagerDuty later:
- `cos_runs` failure rate > 5% in last hour
- Any `mailbox_oauth_tokens.is_active` flip to false
- `follow_up_watchers` with `status='pending' AND trigger_after < now() - interval '6h'`
  (cron is stuck)
- `daily_briefs` no row for today after 09:00 PT (cron didn't run)
- Pub/Sub subscription unacked > 100

## Database access

Connection: standard Supabase pooler URL in `DATABASE_URL`. The
consolidated chief-of-staff schema lives in
`apps/internal/supabase/migrations/015_chief_of_staff_schema.sql`.
Migrations are forward-only and idempotent.

## Reading the audit trail

Every model call writes to `cos_runs` with:
- `kind` — what produced it (classify, plan, brief, prep_brief,
  follow_up, extract_actions, scheduling)
- `status` — running/succeeded/failed/partial
- `input_tokens` + `output_tokens` + `cost_usd` (Decimal)
- `duration_ms`
- `metadata jsonb` — raw output for postmortem (large; the
  `cos.runs.metadata.purge` cron strips this after 30 days)
- For planner runs: `iterations` and `tool_calls` counts

`agent_classifications`, `email_drafts`, `scheduling_proposals`,
`daily_briefs`, `meeting_prep_briefs` all link back to their producing
`cos_run_id`.
