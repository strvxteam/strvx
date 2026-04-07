-- ── Follow-up Links ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS follow_up_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  engagement_id UUID      NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  meeting_type TEXT       NOT NULL DEFAULT 'proposal',
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Extend bookings with follow-up fields ────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_token TEXT,
  ADD COLUMN IF NOT EXISTS meeting_type TEXT;
