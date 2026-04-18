-- Manual migration (drizzle-kit meta for 0001/0002 is out of sync, so
-- drizzle-kit generate can't be run without an interactive TTY to answer
-- rename/create prompts for every pre-existing table). This table was
-- applied directly via postgres-js on 2026-04-18; this file records the
-- schema change for future reference and for fresh-DB bootstrap.

CREATE TABLE IF NOT EXISTS "user_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "ref" text NOT NULL,
  "label" text NOT NULL,
  "icon_key" text NOT NULL DEFAULT '',
  "position" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_pins_user_kind_ref" ON "user_pins"("user_id", "kind", "ref");
CREATE INDEX IF NOT EXISTS "user_pins_user_position" ON "user_pins"("user_id", "position");
