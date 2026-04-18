-- Manual migration (drizzle-kit meta for 0001/0002 is out of sync, so
-- drizzle-kit generate can't be run without an interactive TTY to answer
-- rename/create prompts for every pre-existing table). This table was
-- applied directly via postgres-js on 2026-04-18; this file records the
-- schema change for future reference and for fresh-DB bootstrap.

CREATE TABLE IF NOT EXISTS "user_recents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "ref" text NOT NULL,
  "label" text NOT NULL,
  "last_visited_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_recents_user_kind_ref" ON "user_recents"("user_id", "kind", "ref");
CREATE INDEX IF NOT EXISTS "user_recents_user_recent" ON "user_recents"("user_id", "last_visited_at");
