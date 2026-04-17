-- Migration 012: time_entries schema modernization + skills column backfill
--
-- Changes:
--   1. time_entries: add duration_minutes, task_id, started_at, stopped_at
--      - Backfill duration_minutes from legacy `hours` column (hours * 60)
--      - Make duration_minutes NOT NULL (required by new code)
--      - Relax hours to nullable so new-code INSERTs (which only set duration_minutes) succeed
--      - Keep `hours` column for now — drop in a future migration after new code stabilizes
--   2. skills: add scope + export_to_agent columns referenced by skills-actions/queries
--
-- Safe to run against any state:
--   - IF NOT EXISTS / IF EXISTS guards everywhere
--   - UPDATE only fills NULL duration_minutes (idempotent)
--   - Two Supabase CLI migrations writing the same DB would no-op after first apply

-- ── time_entries: add new columns ────────────────────────────────────────────

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS stopped_at TIMESTAMPTZ;

-- Backfill duration_minutes from hours for any existing rows
UPDATE time_entries
SET duration_minutes = ROUND(hours::numeric * 60)::integer
WHERE duration_minutes IS NULL AND hours IS NOT NULL;

-- Safety fallback for any NULL-hours rows
UPDATE time_entries SET duration_minutes = 0 WHERE duration_minutes IS NULL;

-- Enforce NOT NULL now that every row has a value
ALTER TABLE time_entries ALTER COLUMN duration_minutes SET NOT NULL;

-- Allow hours to be NULL so new-code INSERTs (which only set duration_minutes) don't fail
ALTER TABLE time_entries ALTER COLUMN hours DROP NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS time_entries_user_idx ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS time_entries_date_idx ON time_entries(date);
CREATE INDEX IF NOT EXISTS time_entries_project_idx ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS time_entries_task_idx ON time_entries(task_id);

-- ── skills: add columns referenced by new code ──────────────────────────────

ALTER TABLE skills ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'importable';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS export_to_agent BOOLEAN NOT NULL DEFAULT false;
