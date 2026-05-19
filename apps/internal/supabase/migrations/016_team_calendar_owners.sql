-- Manual mapping from Google calendar id → which team member's events live
-- there. Lets ops assign Alex's/Nick's side calendars (e.g. "Tutoring",
-- "Travel") that the heuristic classifier can't auto-recognize because
-- their ids are opaque hashes and their summary names don't contain a
-- member's name.
--
-- Consulted BEFORE the env-var aliases and summary-name heuristics in
-- apps/internal/src/app/api/availability/team/route.ts.

CREATE TABLE IF NOT EXISTS team_calendar_owners (
  calendar_id text PRIMARY KEY,
  owner text NOT NULL CHECK (owner IN ('alex', 'nick', 'team', 'skip')),
  label text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- No RLS — only server-side code reads/writes.
