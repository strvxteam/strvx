-- Migration 014: add partner_id to follow_up_links
--
-- Allows a booking link to be associated with a partner. When someone books
-- via a partner-bound link, the partner is auto-added as a calendar attendee.
-- partner_id stays NULL for engagement-bound and internal links; only set
-- for partner links.
--
-- Safe to run repeatedly (IF NOT EXISTS guards).

ALTER TABLE follow_up_links
  ADD COLUMN IF NOT EXISTS partner_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'follow_up_links'
      AND constraint_name = 'follow_up_links_partner_id_partners_id_fk'
  ) THEN
    ALTER TABLE follow_up_links
      ADD CONSTRAINT follow_up_links_partner_id_partners_id_fk
      FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS follow_up_links_partner_idx ON follow_up_links(partner_id);
