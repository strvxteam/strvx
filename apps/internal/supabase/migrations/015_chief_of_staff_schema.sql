-- ─────────────────────────────────────────────────────────────
-- Migration 015 — Chief-of-Staff agent: schema + RLS
--
-- Ports the AI Chief-of-Staff agent from strvxteam/strvx-internal-tool.
-- Consolidates migrations 007-019 from that repo into a single
-- idempotent forward-only migration.
--
-- NAMING:
--   The existing Skills & Agents system (migration 008 here) owns
--   `agent_runs` and `agent_run_status`. To coexist, the Chief-of-Staff
--   run audit table is named `cos_runs` with `cos_run_kind` and
--   `cos_run_status` enums.
--
-- TABLES (15 new):
--   mailbox_oauth_tokens, mailbox_watches,
--   email_threads, email_messages, email_attachments,
--   cos_runs, agent_classifications, scheduling_proposals,
--   email_drafts, follow_up_watchers,
--   daily_briefs, meeting_prep_briefs,
--   agent_settings, crm_hygiene_flags, agent_voice_samples
--
-- DELTAS (existing tables):
--   interactions: + email_message_id (forward-ref to email_messages)
--   next_actions: + created_by_agent
--   calendar_events: + google_event_id UNIQUE + ical_uid
--   companies: + website
--   interaction_type enum: + email_sent, email_received
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- Migration 007 — AI Chief-of-Staff agent: schema delta
--
-- Idempotent. Safe to re-run. Creates 13 new enums + 12 new tables
-- + 4 schema deltas on existing tables. RLS policies are NOT in this
-- file — they live in 008_agent_inbox_rls.sql.
--
-- This file replaces the equivalent operations that would normally be
-- run via `pnpm db:push`. We use a hand-crafted SQL file because
-- drizzle-kit push requires an interactive TTY to resolve enum conflicts
-- and our deploy pipeline is non-interactive.
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- Section 1: New enum types (13 enums, each with IF-NOT-EXISTS guard)
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE cos_run_kind AS ENUM(
    'classify', 'plan', 'draft', 'scheduling', 'brief',
    'follow_up', 'prep_brief', 'extract_actions'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE cos_run_status AS ENUM(
    'running', 'succeeded', 'failed', 'partial'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_category AS ENUM(
    'lead_inquiry', 'client_active', 'client_followup', 'vendor',
    'personal', 'newsletter', 'spam', 'calendar_invite',
    'scheduling_request', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_urgency AS ENUM(
    'urgent', 'normal', 'low'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_intent AS ENUM(
    'reply_needed', 'schedule', 'reschedule', 'cancel', 'fyi',
    'introduction', 'proposal_review', 'invoice_question', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_confidence AS ENUM(
    'high', 'medium', 'low'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE email_message_direction AS ENUM(
    'inbound', 'outbound'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE email_draft_status AS ENUM(
    'pending_review', 'approved', 'sent', 'rejected', 'superseded', 'shadow'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE scheduling_proposal_kind AS ENUM(
    'new_meeting', 'reschedule', 'cancel'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE scheduling_proposal_status AS ENUM(
    'pending', 'confirmed', 'event_created', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE follow_up_kind AS ENUM(
    'stale_thread', 'stale_pipeline', 'no_show', 'post_meeting_followup'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE follow_up_status AS ENUM(
    'pending', 'fired', 'cancelled', 'suppressed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE email_thread_agent_state AS ENUM(
    'pending', 'classified', 'planned', 'drafted', 'resolved', 'snoozed', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- ─────────────────────────────────────────────────────────────
-- Section 2: Extend interaction_type enum
--
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS cannot run inside a transaction
-- block. These are bare statements with no explicit BEGIN/COMMIT wrapper.
-- ─────────────────────────────────────────────────────────────

ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'email_sent';
ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'email_received';


-- ─────────────────────────────────────────────────────────────
-- Section 3: Create new tables
-- ─────────────────────────────────────────────────────────────

-- 1. mailbox_oauth_tokens
CREATE TABLE IF NOT EXISTS mailbox_oauth_tokens (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    text        NOT NULL,
  display_name             text,
  access_token_encrypted   text        NOT NULL,
  refresh_token_encrypted  text        NOT NULL,
  expiry_date              bigint      NOT NULL,
  scopes                   text[]      NOT NULL,
  is_primary               boolean     NOT NULL DEFAULT false,
  is_active                boolean     NOT NULL DEFAULT true,
  connected_by_user_id     uuid        REFERENCES users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailbox_oauth_tokens_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS mailbox_oauth_tokens_email_idx  ON mailbox_oauth_tokens (email);
CREATE INDEX IF NOT EXISTS mailbox_oauth_tokens_active_idx ON mailbox_oauth_tokens (is_active);


-- 2. mailbox_watches
CREATE TABLE IF NOT EXISTS mailbox_watches (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id      uuid        NOT NULL REFERENCES mailbox_oauth_tokens(id) ON DELETE CASCADE,
  history_id      text        NOT NULL,
  expiration      timestamptz NOT NULL,
  topic_name      text        NOT NULL,
  last_renewed_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);


-- 3. email_threads
CREATE TABLE IF NOT EXISTS email_threads (
  id               uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id       uuid                     NOT NULL REFERENCES mailbox_oauth_tokens(id) ON DELETE CASCADE,
  gmail_thread_id  text                     NOT NULL,
  subject          text,
  participants     jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  message_count    integer                  NOT NULL DEFAULT 0,
  last_message_at  timestamptz              NOT NULL,
  last_inbound_at  timestamptz,
  last_outbound_at timestamptz,
  engagement_id    uuid                     REFERENCES engagements(id),
  contact_id       uuid                     REFERENCES contacts(id),
  company_id       uuid                     REFERENCES companies(id),
  agent_state      email_thread_agent_state NOT NULL DEFAULT 'pending',
  agent_urgency    agent_urgency,
  agent_category   agent_category,
  requires_human   boolean                  NOT NULL DEFAULT false,
  snoozed_until    timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz              NOT NULL DEFAULT now(),
  updated_at       timestamptz              NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_threads_mailbox_gmail_unique     ON email_threads (mailbox_id, gmail_thread_id);
CREATE INDEX        IF NOT EXISTS email_threads_mailbox_last_message_idx ON email_threads (mailbox_id, last_message_at);
CREATE INDEX        IF NOT EXISTS email_threads_engagement_idx           ON email_threads (engagement_id);
CREATE INDEX        IF NOT EXISTS email_threads_agent_state_idx          ON email_threads (agent_state);
CREATE INDEX        IF NOT EXISTS email_threads_last_inbound_idx         ON email_threads (last_inbound_at);


-- 4. email_messages
CREATE TABLE IF NOT EXISTS email_messages (
  id                    uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id             uuid                   NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  mailbox_id            uuid                   NOT NULL REFERENCES mailbox_oauth_tokens(id) ON DELETE CASCADE,
  gmail_message_id      text                   NOT NULL,
  gmail_history_id      text,
  in_reply_to_message_id text,
  message_id_header     text,
  from_email            text                   NOT NULL,
  from_name             text,
  to_emails             text[]                 NOT NULL DEFAULT '{}'::text[],
  cc_emails             text[]                 NOT NULL DEFAULT '{}'::text[],
  bcc_emails            text[]                 NOT NULL DEFAULT '{}'::text[],
  subject               text,
  body_text             text,
  body_html             text,
  snippet               text,
  direction             email_message_direction NOT NULL,
  sent_at               timestamptz            NOT NULL,
  labels                text[]                 NOT NULL DEFAULT '{}'::text[],
  is_unread             boolean                NOT NULL DEFAULT true,
  is_starred            boolean                NOT NULL DEFAULT false,
  has_attachments       boolean                NOT NULL DEFAULT false,
  raw_size              integer,
  archived_at           timestamptz,
  created_at            timestamptz            NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_mailbox_gmail_unique ON email_messages (mailbox_id, gmail_message_id);
CREATE INDEX        IF NOT EXISTS email_messages_thread_sent_idx      ON email_messages (thread_id, sent_at);


-- 5. email_attachments
CREATE TABLE IF NOT EXISTS email_attachments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id           uuid        NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  gmail_attachment_id  text,
  filename             text        NOT NULL,
  mime_type            text,
  size_bytes           integer,
  storage_path         text,
  created_at           timestamptz NOT NULL DEFAULT now()
);


-- 6. agent_runs
CREATE TABLE IF NOT EXISTS cos_runs (
  id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           cos_run_kind   NOT NULL,
  status         cos_run_status NOT NULL,
  mailbox_id     uuid             REFERENCES mailbox_oauth_tokens(id),
  thread_id      uuid             REFERENCES email_threads(id),
  message_id     uuid             REFERENCES email_messages(id),
  engagement_id  uuid             REFERENCES engagements(id),
  trigger_run_id text,
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  cost_usd       numeric(10, 6)   NOT NULL DEFAULT 0,
  started_at     timestamptz      NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  duration_ms    integer,
  error_message  text,
  metadata       jsonb            NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cos_runs_kind_started_idx    ON cos_runs (kind, started_at);
CREATE INDEX IF NOT EXISTS cos_runs_thread_idx          ON cos_runs (thread_id);
CREATE INDEX IF NOT EXISTS cos_runs_trigger_run_id_idx  ON cos_runs (trigger_run_id);


-- 7. agent_classifications
CREATE TABLE IF NOT EXISTS agent_classifications (
  id                           uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id                   uuid             NOT NULL UNIQUE REFERENCES email_messages(id) ON DELETE CASCADE,
  thread_id                    uuid             NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  cos_run_id                 uuid             REFERENCES cos_runs(id),
  category                     agent_category   NOT NULL,
  urgency                      agent_urgency    NOT NULL,
  intent                       agent_intent     NOT NULL,
  requires_reply               boolean          NOT NULL,
  suggested_workflow           text,
  related_engagement_id        uuid             REFERENCES engagements(id),
  related_engagement_confidence agent_confidence,
  related_contact_id           uuid             REFERENCES contacts(id),
  reasoning                    text,
  created_at                   timestamptz      NOT NULL DEFAULT now()
);


-- 8. scheduling_proposals
CREATE TABLE IF NOT EXISTS scheduling_proposals (
  id                        uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id                 uuid                       NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  mailbox_id                uuid                       NOT NULL REFERENCES mailbox_oauth_tokens(id) ON DELETE CASCADE,
  engagement_id             uuid                       REFERENCES engagements(id),
  cos_run_id              uuid                       REFERENCES cos_runs(id),
  kind                      scheduling_proposal_kind   NOT NULL,
  existing_calendar_event_id text,
  duration_minutes          integer                    NOT NULL,
  meeting_title             text                       NOT NULL,
  meeting_description       text,
  proposed_slots            jsonb                      NOT NULL,
  chosen_slot               jsonb,
  attendees                 jsonb                      NOT NULL,
  location                  text                       NOT NULL DEFAULT 'Google Meet',
  meet_link                 text,
  created_google_event_id   text,
  status                    scheduling_proposal_status NOT NULL DEFAULT 'pending',
  created_at                timestamptz                NOT NULL DEFAULT now(),
  updated_at                timestamptz                NOT NULL DEFAULT now()
);


-- 9. email_drafts
CREATE TABLE IF NOT EXISTS email_drafts (
  id                       uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id                uuid              NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  mailbox_id               uuid              NOT NULL REFERENCES mailbox_oauth_tokens(id) ON DELETE CASCADE,
  in_reply_to_message_id   uuid              REFERENCES email_messages(id),
  cos_run_id             uuid              REFERENCES cos_runs(id),
  status                   email_draft_status NOT NULL DEFAULT 'pending_review',
  to_emails                text[]            NOT NULL,
  cc_emails                text[]            NOT NULL DEFAULT '{}'::text[],
  bcc_emails               text[]            NOT NULL DEFAULT '{}'::text[],
  subject                  text              NOT NULL,
  body_text                text              NOT NULL,
  body_html                text,
  attachments              jsonb             NOT NULL DEFAULT '[]'::jsonb,
  scheduling_proposal_id   uuid              REFERENCES scheduling_proposals(id),
  reviewer_notes           text,
  confidence               agent_confidence,
  human_edited             boolean           NOT NULL DEFAULT false,
  approved_by_user_id      uuid              REFERENCES users(id),
  approved_at              timestamptz,
  sent_at                  timestamptz,
  sent_gmail_message_id    text,
  rejected_at              timestamptz,
  rejected_by_user_id      uuid              REFERENCES users(id),
  rejection_reason         text,
  created_at               timestamptz       NOT NULL DEFAULT now(),
  updated_at               timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_drafts_status_idx ON email_drafts (status);
CREATE INDEX IF NOT EXISTS email_drafts_thread_idx ON email_drafts (thread_id);


-- 10. follow_up_watchers
CREATE TABLE IF NOT EXISTS follow_up_watchers (
  id                  uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                follow_up_kind   NOT NULL,
  thread_id           uuid             REFERENCES email_threads(id),
  engagement_id       uuid             REFERENCES engagements(id),
  calendar_event_id   text,
  trigger_after       timestamptz      NOT NULL,
  rule_config         jsonb            NOT NULL DEFAULT '{}'::jsonb,
  status              follow_up_status NOT NULL DEFAULT 'pending',
  fired_at            timestamptz,
  resulting_draft_id  uuid             REFERENCES email_drafts(id),
  created_at          timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS follow_up_watchers_pending_trigger_idx ON follow_up_watchers (status, trigger_after);


-- 11. daily_briefs
CREATE TABLE IF NOT EXISTS daily_briefs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date             date        NOT NULL,
  content_markdown text        NOT NULL,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  dismissed_at     timestamptz,
  cos_run_id     uuid        REFERENCES cos_runs(id),
  CONSTRAINT daily_briefs_date_unique UNIQUE (date)
);


-- 12. meeting_prep_briefs
CREATE TABLE IF NOT EXISTS meeting_prep_briefs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id text        NOT NULL,
  engagement_id     uuid        REFERENCES engagements(id),
  content_markdown  text        NOT NULL,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  cos_run_id      uuid        REFERENCES cos_runs(id),
  CONSTRAINT meeting_prep_briefs_calendar_event_id_unique UNIQUE (calendar_event_id)
);


-- ─────────────────────────────────────────────────────────────
-- Section 4: Schema deltas on existing tables
-- ─────────────────────────────────────────────────────────────

-- interactions: add email_message_id column + FK
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS email_message_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'interactions_email_message_id_fkey'
      AND table_name = 'interactions'
  ) THEN
    ALTER TABLE interactions
      ADD CONSTRAINT interactions_email_message_id_fkey
      FOREIGN KEY (email_message_id) REFERENCES email_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS interactions_email_message_idx ON interactions (email_message_id);

-- calendar_events: add google_event_id (unique), ical_uid
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS google_event_id text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'calendar_events_google_event_id_unique'
      AND table_name = 'calendar_events'
  ) THEN
    ALTER TABLE calendar_events
      ADD CONSTRAINT calendar_events_google_event_id_unique UNIQUE (google_event_id);
  END IF;
END $$;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS ical_uid text;

-- next_actions: add created_by_agent flag
ALTER TABLE next_actions
  ADD COLUMN IF NOT EXISTS created_by_agent boolean NOT NULL DEFAULT false;

-- ── From 011 (scheduling_proposal_status_extras) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 011 — extend scheduling_proposal_status enum
--
-- Adds 'created', 'rejected', and 'error' values so the calendar
-- event Trigger.dev jobs and the human reject-slots action can
-- record their respective terminal states.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

ALTER TYPE scheduling_proposal_status ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE scheduling_proposal_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE scheduling_proposal_status ADD VALUE IF NOT EXISTS 'error';

-- ── From 010 (email_messages_fts) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 010 — Postgres FTS on email_messages
--
-- Adds a generated tsvector column combining subject + body_text + snippet
-- weighted A/B/C respectively. GIN index for fast @@ to_tsquery lookup.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(snippet, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS email_messages_search_tsv_idx
  ON email_messages USING GIN (search_tsv);

-- ── From 012 (agent_settings) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 012 — agent_settings (per-mailbox scheduling config)
--
-- One row per mailbox. Drives /find_available_slots — working hours,
-- buffer, max back-to-back, and the home timezone. Falls back to
-- sensible defaults when absent.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL UNIQUE REFERENCES mailbox_oauth_tokens(id) ON DELETE CASCADE,
  working_start_hour int NOT NULL DEFAULT 9 CHECK (working_start_hour BETWEEN 0 AND 23),
  working_end_hour int NOT NULL DEFAULT 17 CHECK (working_end_hour BETWEEN 0 AND 23),
  working_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5], -- 0=Sun .. 6=Sat
  buffer_minutes int NOT NULL DEFAULT 15 CHECK (buffer_minutes BETWEEN 0 AND 120),
  max_back_to_back int NOT NULL DEFAULT 3 CHECK (max_back_to_back BETWEEN 1 AND 10),
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_settings_strvx ON agent_settings;
CREATE POLICY agent_settings_strvx ON agent_settings FOR ALL TO authenticated
  USING (public.is_strvx_member())
  WITH CHECK (public.is_strvx_member());

-- ── From 013 (crm_hygiene_flags) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 013 — crm_hygiene_flags
--
-- Surface-only CRM data-quality signals raised by the daily
-- crm-hygiene-flags cron. Each row points at one entity
-- (engagement / company / contact / thread) and optionally a
-- related entity (e.g. duplicate company target). A human
-- triages each flag from the /agent/follow-ups UI.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_hygiene_flag_kind') THEN
    CREATE TYPE crm_hygiene_flag_kind AS ENUM (
      'domain_mismatch',
      'stale_engagement',
      'duplicate_company',
      'stage_advancement_suggested'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_hygiene_flag_status') THEN
    CREATE TYPE crm_hygiene_flag_status AS ENUM ('open', 'dismissed', 'resolved');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_hygiene_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind crm_hygiene_flag_kind NOT NULL,
  entity_kind text NOT NULL, -- 'engagement' | 'company' | 'contact' | 'thread'
  entity_id uuid NOT NULL,
  related_entity_id uuid,
  status crm_hygiene_flag_status NOT NULL DEFAULT 'open',
  details jsonb NOT NULL DEFAULT '{}',
  dismissed_by uuid REFERENCES users(id),
  dismissed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, entity_kind, entity_id, related_entity_id)
);

CREATE INDEX IF NOT EXISTS crm_hygiene_flags_status_idx
  ON crm_hygiene_flags(status, created_at DESC);

ALTER TABLE crm_hygiene_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_hygiene_flags_strvx ON crm_hygiene_flags;
CREATE POLICY crm_hygiene_flags_strvx ON crm_hygiene_flags FOR ALL TO authenticated
  USING (public.is_strvx_member())
  WITH CHECK (public.is_strvx_member());

-- ── From 014 (agent_voice_samples) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 014 — agent_voice_samples
--
-- Per-mailbox curated outbound emails the planner uses as voice
-- anchors. Each row references a canonical outbound email_message;
-- the planner loads up to 10 starred samples per mailbox and
-- prepends them as a stable-snapshot tier prompt block so the
-- generated drafts match the user's tone.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_voice_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailbox_oauth_tokens(id) ON DELETE CASCADE,
  email_message_id uuid NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  note text,
  starred boolean NOT NULL DEFAULT true,
  added_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, email_message_id)
);

CREATE INDEX IF NOT EXISTS agent_voice_samples_mailbox_idx
  ON agent_voice_samples(mailbox_id, created_at DESC);

ALTER TABLE agent_voice_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_voice_samples_strvx ON agent_voice_samples;
CREATE POLICY agent_voice_samples_strvx ON agent_voice_samples FOR ALL TO authenticated
  USING (public.is_strvx_member())
  WITH CHECK (public.is_strvx_member());

-- ── From 015 (email_threads_nullable_gmail + drafts.metadata) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 015 — nullable email_threads.gmail_thread_id +
--                 email_drafts.metadata
--
-- Drops the NOT NULL constraint on email_threads.gmail_thread_id so we
-- can store a pre-message thread (e.g. an agent-authored booking
-- confirmation draft) before Gmail has assigned a real threadId.
-- Once the first message in the thread is sent via gmail.send, the
-- caller backfills gmail_thread_id.
--
-- The previous UNIQUE (mailbox_id, gmail_thread_id) would treat
-- multiple NULLs as distinct on Postgres, but we replace it with a
-- partial UNIQUE INDEX to be explicit + future-proof: collisions only
-- matter when gmail_thread_id IS NOT NULL.
--
-- Also adds a jsonb `metadata` column to email_drafts so background
-- jobs (booking webhook, follow-up generators, etc.) can attach
-- deterministic correlation keys (e.g. bookingId) instead of stuffing
-- them into reviewer_notes.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE email_threads
  ALTER COLUMN gmail_thread_id DROP NOT NULL;

DROP INDEX IF EXISTS email_threads_mailbox_gmail_unique;

CREATE UNIQUE INDEX IF NOT EXISTS email_threads_mailbox_gmail_unique
  ON email_threads (mailbox_id, gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS email_drafts_metadata_booking_idx
  ON email_drafts ((metadata->>'bookingId'))
  WHERE metadata->>'bookingId' IS NOT NULL;

-- ── From 016 (mailbox_token_refresh_tracking) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 016 — mailbox token-refresh failure tracking
--
-- When a mailbox's OAuth refresh fails we want to:
--   * record the most recent failure so admins can debug
--   * count consecutive failures so transient errors don't flip
--     is_active off but persistent ones do
--   * mark the mailbox inactive on definitive revoke / invalid_grant
--
-- These columns are read+written by getAuthedMailboxClient's failure
-- listener; existing rows default to 0 / NULL so the change is
-- backwards-compatible.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE mailbox_oauth_tokens
  ADD COLUMN IF NOT EXISTS last_refresh_error text;

ALTER TABLE mailbox_oauth_tokens
  ADD COLUMN IF NOT EXISTS last_refresh_error_at timestamptz;

ALTER TABLE mailbox_oauth_tokens
  ADD COLUMN IF NOT EXISTS refresh_failure_count int NOT NULL DEFAULT 0;

-- ── From 017 (realtime publication) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 017 — realtime publication for agent tables
--
-- Ensures the supabase_realtime publication includes the agent
-- tables our RealtimeProvider subscribes to. Without these the
-- frontend's postgres_changes channels silently drop updates,
-- meaning the agent-thinking indicator and the
-- SchedulingProposalCard live status never refresh.
--
-- Each ADD TABLE is wrapped in a DO block so the migration is
-- idempotent (a second run on an already-published table raises
-- "table is already member of publication" otherwise).
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- agent_runs powers the "agent thinking…" indicator and the
  -- /agent/analytics dashboard activity stream.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cos_runs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cos_runs';
  END IF;

  -- scheduling_proposals: SchedulingProposalCard live updates when
  -- the agent attaches a draft / rewrites slots.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scheduling_proposals'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduling_proposals';
  END IF;

  -- agent_classifications: classifier outcomes power the inbox
  -- category / urgency badges.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_classifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_classifications';
  END IF;

  -- email_drafts: pending → approved → sent transitions drive the
  -- agent inbox state.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'email_drafts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.email_drafts';
  END IF;

  -- email_threads: requires_human, snoozed_until, agent_state.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'email_threads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.email_threads';
  END IF;

  -- email_messages: new inbound message rows show up live.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'email_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.email_messages';
  END IF;

  -- follow_up_watchers: cron firing-state visible to the UI.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'follow_up_watchers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_up_watchers';
  END IF;
END $$;

-- ── From 019 (email_threads.labels) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 019 — email_threads.labels
--
-- Adds a free-form text[] `labels` column to email_threads, plus
-- a GIN index for fast "threads tagged with X" filters and the
-- frequency aggregation that powers the inbox label menu's
-- auto-suggested chips.
--
-- Per-thread labels are user-supplied (no agent writes), normalized
-- client-side to lowercase + dashes only (see _triage-impl.ts).
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS email_threads_labels_gin_idx
  ON email_threads USING GIN (labels);

-- ── From 018 (companies.website) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 018 — companies.website
--
-- Adds a free-form `website` column to the companies table. The
-- column is read by the CRM hygiene cron's domain_mismatch check —
-- a contact whose email domain differs from the company's website
-- host is flagged for human review (the dominant source of bad CRM
-- data is "this person is at a personal address" or "this contact
-- got linked to the wrong company").
--
-- The detection wiring was shipped in Phase 4 but couldn't fire
-- because `companies.website` didn't exist; this migration + the
-- accompanying code change in crm-hygiene-flags.ts activate it.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS website text;

-- ── RLS policies (from 008, renamed for cos_runs) ──────────────────────
-- ─────────────────────────────────────────────────────────────
-- Migration 008 — AI Chief-of-Staff agent: RLS policies + public view
--
-- Idempotent. Safe to re-run. Companion to 007_agent_inbox_schema.sql.
--
-- Enables RLS on the 12 new agent tables and applies the established
-- single-tenant policy (is_strvx_member()). Also creates a public view
-- of mailbox_oauth_tokens that excludes encrypted token bytes — useful
-- for UI surfaces that need to list mailboxes without exposing creds.
-- ─────────────────────────────────────────────────────────────

-- Step 1: Enable RLS on all new tables.
ALTER TABLE mailbox_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailbox_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cos_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_prep_briefs ENABLE ROW LEVEL SECURITY;

-- Step 2: Apply the established @strvx.com-only policy to every new table.
-- Drop-and-recreate keeps the migration idempotent.

DROP POLICY IF EXISTS mailbox_oauth_tokens_strvx ON mailbox_oauth_tokens;
CREATE POLICY mailbox_oauth_tokens_strvx ON mailbox_oauth_tokens
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS mailbox_watches_strvx ON mailbox_watches;
CREATE POLICY mailbox_watches_strvx ON mailbox_watches
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS email_threads_strvx ON email_threads;
CREATE POLICY email_threads_strvx ON email_threads
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS email_messages_strvx ON email_messages;
CREATE POLICY email_messages_strvx ON email_messages
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS email_attachments_strvx ON email_attachments;
CREATE POLICY email_attachments_strvx ON email_attachments
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS cos_runs_strvx ON cos_runs;
CREATE POLICY cos_runs_strvx ON cos_runs
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS agent_classifications_strvx ON agent_classifications;
CREATE POLICY agent_classifications_strvx ON agent_classifications
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS scheduling_proposals_strvx ON scheduling_proposals;
CREATE POLICY scheduling_proposals_strvx ON scheduling_proposals
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS email_drafts_strvx ON email_drafts;
CREATE POLICY email_drafts_strvx ON email_drafts
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS follow_up_watchers_strvx ON follow_up_watchers;
CREATE POLICY follow_up_watchers_strvx ON follow_up_watchers
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS daily_briefs_strvx ON daily_briefs;
CREATE POLICY daily_briefs_strvx ON daily_briefs
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

DROP POLICY IF EXISTS meeting_prep_briefs_strvx ON meeting_prep_briefs;
CREATE POLICY meeting_prep_briefs_strvx ON meeting_prep_briefs
  FOR ALL TO authenticated
  USING (is_strvx_member())
  WITH CHECK (is_strvx_member());

-- Step 3: Public view of mailbox_oauth_tokens (no encrypted tokens).
-- UI surfaces that need to list connected mailboxes read from this view
-- instead of the raw table, so encrypted token columns are never exposed
-- to non-admin code paths.
DROP VIEW IF EXISTS mailbox_oauth_tokens_public;
CREATE VIEW mailbox_oauth_tokens_public AS
SELECT
  id,
  email,
  display_name,
  expiry_date,
  scopes,
  is_primary,
  is_active,
  connected_by_user_id,
  created_at,
  updated_at
FROM mailbox_oauth_tokens;

-- Grant read on the view to authenticated.
GRANT SELECT ON mailbox_oauth_tokens_public TO authenticated;

-- ── RLS for new tables added later (agent_settings/crm_hygiene_flags/agent_voice_samples) ──────────────────────
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_settings_strvx ON agent_settings;
CREATE POLICY agent_settings_strvx ON agent_settings FOR ALL TO authenticated USING (is_strvx_member()) WITH CHECK (is_strvx_member());
ALTER TABLE crm_hygiene_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_hygiene_flags_strvx ON crm_hygiene_flags;
CREATE POLICY crm_hygiene_flags_strvx ON crm_hygiene_flags FOR ALL TO authenticated USING (is_strvx_member()) WITH CHECK (is_strvx_member());
ALTER TABLE agent_voice_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_voice_samples_strvx ON agent_voice_samples;
CREATE POLICY agent_voice_samples_strvx ON agent_voice_samples FOR ALL TO authenticated USING (is_strvx_member()) WITH CHECK (is_strvx_member());
