-- Monorepo support: one dev_repo can have multiple Vercel projects.
-- New table dev_vercel_projects is the source of truth for Vercel linkage.

CREATE TABLE IF NOT EXISTS "dev_vercel_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dev_repo_id" uuid NOT NULL REFERENCES "dev_repos"("id") ON DELETE CASCADE,
  "vercel_project_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "production_url" text,
  "monitored_site_id" uuid REFERENCES "monitored_sites"("id") ON DELETE SET NULL,
  "last_refreshed_at" timestamptz,
  "last_refresh_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dev_vercel_projects_repo_idx" ON "dev_vercel_projects"("dev_repo_id");

-- New join column on vercel_deploy_cache. Nullable for backward compat.
ALTER TABLE "vercel_deploy_cache" ADD COLUMN IF NOT EXISTS "dev_vercel_project_id" uuid;
DO $$ BEGIN
  ALTER TABLE "vercel_deploy_cache"
    ADD CONSTRAINT "vercel_deploy_cache_dev_vercel_project_id_fk"
    FOREIGN KEY ("dev_vercel_project_id") REFERENCES "dev_vercel_projects"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "vercel_deploy_cache_project_created_idx"
  ON "vercel_deploy_cache"("dev_vercel_project_id","created_at_remote");
