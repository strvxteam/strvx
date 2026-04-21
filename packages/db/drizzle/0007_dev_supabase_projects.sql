-- Supabase project tracking (analogous to dev_vercel_projects).
CREATE TABLE IF NOT EXISTS "dev_supabase_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dev_repo_id" uuid REFERENCES "dev_repos"("id") ON DELETE SET NULL,
  "project_ref" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "region" text,
  "status" text,
  "db_version" text,
  "size_bytes" bigint,
  "active_connections" integer,
  "last_refreshed_at" timestamptz,
  "last_refresh_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dev_supabase_projects_repo_idx" ON "dev_supabase_projects"("dev_repo_id");
