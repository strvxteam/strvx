-- Enable Supabase Realtime on /development tables.
-- RLS policies grant SELECT to any authenticated user (dev/admin tool; all logged-in team members see everything).

-- 1. RLS
ALTER TABLE "dev_repos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev_vercel_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev_supabase_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monitored_sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "uptime_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vercel_deploy_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "github_pr_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "github_ci_cache" ENABLE ROW LEVEL SECURITY;

-- 2. SELECT policies for authenticated role
DROP POLICY IF EXISTS "authenticated_select" ON "dev_repos";
CREATE POLICY "authenticated_select" ON "dev_repos" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select" ON "dev_vercel_projects";
CREATE POLICY "authenticated_select" ON "dev_vercel_projects" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select" ON "dev_supabase_projects";
CREATE POLICY "authenticated_select" ON "dev_supabase_projects" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select" ON "monitored_sites";
CREATE POLICY "authenticated_select" ON "monitored_sites" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select" ON "uptime_checks";
CREATE POLICY "authenticated_select" ON "uptime_checks" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select" ON "vercel_deploy_cache";
CREATE POLICY "authenticated_select" ON "vercel_deploy_cache" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select" ON "github_pr_cache";
CREATE POLICY "authenticated_select" ON "github_pr_cache" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select" ON "github_ci_cache";
CREATE POLICY "authenticated_select" ON "github_ci_cache" FOR SELECT TO authenticated USING (true);

-- 3. Add tables to the Supabase Realtime publication (idempotent)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dev_repos',
    'dev_vercel_projects',
    'dev_supabase_projects',
    'monitored_sites',
    'uptime_checks',
    'vercel_deploy_cache',
    'github_pr_cache',
    'github_ci_cache'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 4. REPLICA IDENTITY FULL so UPDATE/DELETE events include the full old row
-- (Realtime otherwise only emits PK columns on delete, which breaks client-side merging.)
ALTER TABLE "dev_repos" REPLICA IDENTITY FULL;
ALTER TABLE "dev_vercel_projects" REPLICA IDENTITY FULL;
ALTER TABLE "dev_supabase_projects" REPLICA IDENTITY FULL;
ALTER TABLE "monitored_sites" REPLICA IDENTITY FULL;
ALTER TABLE "uptime_checks" REPLICA IDENTITY FULL;
ALTER TABLE "vercel_deploy_cache" REPLICA IDENTITY FULL;
ALTER TABLE "github_pr_cache" REPLICA IDENTITY FULL;
ALTER TABLE "github_ci_cache" REPLICA IDENTITY FULL;
