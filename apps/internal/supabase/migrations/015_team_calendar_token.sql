-- Singleton table holding the strvxteam@gmail.com Google Calendar refresh
-- token. Lets us bypass the per-project Vercel env var (GOOGLE_TEAM_REFRESH_TOKEN)
-- which has to be set separately on landing-page AND strvx-internal-tool —
-- a step that's easy to miss when bringing up the internal project for the
-- first time.
--
-- Single row enforced via boolean PK + check constraint (id can only be true).

CREATE TABLE IF NOT EXISTS team_calendar_token (
  id boolean PRIMARY KEY DEFAULT true,
  refresh_token text NOT NULL,
  email text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_calendar_token_singleton CHECK (id = true)
);

-- No RLS — only server-side code with service-role access ever reads/writes
-- this table.
