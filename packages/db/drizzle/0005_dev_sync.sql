-- Dev sync: add columns needed for auto-synced GitHub repos + Vercel project linkage,
-- and drop the (now-unused) user_recents table.

-- New columns on dev_repos
ALTER TABLE "dev_repos" ADD COLUMN IF NOT EXISTS "github_id" integer;
ALTER TABLE "dev_repos" ADD COLUMN IF NOT EXISTS "is_private" boolean NOT NULL DEFAULT false;
ALTER TABLE "dev_repos" ADD COLUMN IF NOT EXISTS "is_archived" boolean NOT NULL DEFAULT false;
ALTER TABLE "dev_repos" ADD COLUMN IF NOT EXISTS "is_fork" boolean NOT NULL DEFAULT false;
ALTER TABLE "dev_repos" ADD COLUMN IF NOT EXISTS "vercel_production_url" text;
ALTER TABLE "dev_repos" ADD COLUMN IF NOT EXISTS "monitored_site_id" uuid;

-- Unique index on github_id (nullable — back-filled on first bootstrap sync)
CREATE UNIQUE INDEX IF NOT EXISTS "dev_repos_github_id_idx" ON "dev_repos"("github_id");

-- FK dev_repos.monitored_site_id -> monitored_sites.id
DO $$ BEGIN
  ALTER TABLE "dev_repos"
    ADD CONSTRAINT "dev_repos_monitored_site_id_fk"
    FOREIGN KEY ("monitored_site_id") REFERENCES "monitored_sites"("id")
    ON DELETE set null;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Remove now-unused recents tracking (replaced by pins only)
DROP INDEX IF EXISTS "user_recents_user_kind_ref";
DROP INDEX IF EXISTS "user_recents_user_recent";
DROP TABLE IF EXISTS "user_recents";
