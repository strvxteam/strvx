-- Fixes "Failed to delete client" errors by reworking 8 FK constraints
-- that were left at PostgreSQL's default ON DELETE NO ACTION. With
-- NO ACTION, any single child row in these tables blocks the parent
-- delete — so deleting a client (engagement) fails as soon as it has
-- a single email thread, scheduling proposal, agent classification,
-- meeting prep brief, follow-up watcher, cos run, or its company /
-- contact has a prospect or email thread.
--
-- These 8 tables aren't managed by the current Drizzle schema —
-- they're leftover from earlier app iterations. Set every FK to
-- ON DELETE SET NULL so the parent delete succeeds while preserving
-- the child row (the link just becomes null). All 8 referencing
-- columns are already nullable in prod (verified via
-- information_schema.columns), so SET NULL is safe.

-- ── Tables referencing engagements ────────────────────────────────────

ALTER TABLE agent_classifications
  DROP CONSTRAINT IF EXISTS agent_classifications_related_engagement_id_fkey;
ALTER TABLE agent_classifications
  ADD CONSTRAINT agent_classifications_related_engagement_id_fkey
  FOREIGN KEY (related_engagement_id) REFERENCES engagements(id) ON DELETE SET NULL;

ALTER TABLE cos_runs
  DROP CONSTRAINT IF EXISTS cos_runs_engagement_id_fkey;
ALTER TABLE cos_runs
  ADD CONSTRAINT cos_runs_engagement_id_fkey
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE SET NULL;

ALTER TABLE email_threads
  DROP CONSTRAINT IF EXISTS email_threads_engagement_id_fkey;
ALTER TABLE email_threads
  ADD CONSTRAINT email_threads_engagement_id_fkey
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE SET NULL;

ALTER TABLE follow_up_watchers
  DROP CONSTRAINT IF EXISTS follow_up_watchers_engagement_id_fkey;
ALTER TABLE follow_up_watchers
  ADD CONSTRAINT follow_up_watchers_engagement_id_fkey
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE SET NULL;

ALTER TABLE meeting_prep_briefs
  DROP CONSTRAINT IF EXISTS meeting_prep_briefs_engagement_id_fkey;
ALTER TABLE meeting_prep_briefs
  ADD CONSTRAINT meeting_prep_briefs_engagement_id_fkey
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE SET NULL;

ALTER TABLE scheduling_proposals
  DROP CONSTRAINT IF EXISTS scheduling_proposals_engagement_id_fkey;
ALTER TABLE scheduling_proposals
  ADD CONSTRAINT scheduling_proposals_engagement_id_fkey
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE SET NULL;

-- ── Tables referencing contacts ───────────────────────────────────────

ALTER TABLE agent_classifications
  DROP CONSTRAINT IF EXISTS agent_classifications_related_contact_id_fkey;
ALTER TABLE agent_classifications
  ADD CONSTRAINT agent_classifications_related_contact_id_fkey
  FOREIGN KEY (related_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE email_threads
  DROP CONSTRAINT IF EXISTS email_threads_contact_id_fkey;
ALTER TABLE email_threads
  ADD CONSTRAINT email_threads_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE prospects
  DROP CONSTRAINT IF EXISTS prospects_contact_id_fkey;
ALTER TABLE prospects
  ADD CONSTRAINT prospects_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

-- ── Tables referencing companies ──────────────────────────────────────

ALTER TABLE email_threads
  DROP CONSTRAINT IF EXISTS email_threads_company_id_fkey;
ALTER TABLE email_threads
  ADD CONSTRAINT email_threads_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE prospects
  DROP CONSTRAINT IF EXISTS prospects_company_id_fkey;
ALTER TABLE prospects
  ADD CONSTRAINT prospects_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
