-- ============================================================================
-- Harden RLS: restrict to @strvx.com emails only
-- ============================================================================
-- Even if someone signs up via Supabase Auth with a non-strvx email,
-- they get zero access to any data. Defense-in-depth on top of
-- disabling public signups in the Supabase dashboard.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_strvx_member()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    (auth.jwt() ->> 'email') LIKE '%@strvx.com',
    false
  );
$$;

-- ── Replace all 80 policies: USING (true) → USING (public.is_strvx_member()) ──

-- users
DROP POLICY IF EXISTS "authenticated_select_users" ON users;
CREATE POLICY "authenticated_select_users" ON users
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_users" ON users;
CREATE POLICY "authenticated_insert_users" ON users
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_users" ON users;
CREATE POLICY "authenticated_update_users" ON users
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_users" ON users;
CREATE POLICY "authenticated_delete_users" ON users
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- companies
DROP POLICY IF EXISTS "authenticated_select_companies" ON companies;
CREATE POLICY "authenticated_select_companies" ON companies
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_companies" ON companies;
CREATE POLICY "authenticated_insert_companies" ON companies
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_companies" ON companies;
CREATE POLICY "authenticated_update_companies" ON companies
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_companies" ON companies;
CREATE POLICY "authenticated_delete_companies" ON companies
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- contacts
DROP POLICY IF EXISTS "authenticated_select_contacts" ON contacts;
CREATE POLICY "authenticated_select_contacts" ON contacts
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_contacts" ON contacts;
CREATE POLICY "authenticated_insert_contacts" ON contacts
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_contacts" ON contacts;
CREATE POLICY "authenticated_update_contacts" ON contacts
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_contacts" ON contacts;
CREATE POLICY "authenticated_delete_contacts" ON contacts
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- engagements
DROP POLICY IF EXISTS "authenticated_select_engagements" ON engagements;
CREATE POLICY "authenticated_select_engagements" ON engagements
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_engagements" ON engagements;
CREATE POLICY "authenticated_insert_engagements" ON engagements
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_engagements" ON engagements;
CREATE POLICY "authenticated_update_engagements" ON engagements
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_engagements" ON engagements;
CREATE POLICY "authenticated_delete_engagements" ON engagements
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- stage_history
DROP POLICY IF EXISTS "authenticated_select_stage_history" ON stage_history;
CREATE POLICY "authenticated_select_stage_history" ON stage_history
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_stage_history" ON stage_history;
CREATE POLICY "authenticated_insert_stage_history" ON stage_history
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_stage_history" ON stage_history;
CREATE POLICY "authenticated_update_stage_history" ON stage_history
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_stage_history" ON stage_history;
CREATE POLICY "authenticated_delete_stage_history" ON stage_history
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- interactions
DROP POLICY IF EXISTS "authenticated_select_interactions" ON interactions;
CREATE POLICY "authenticated_select_interactions" ON interactions
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_interactions" ON interactions;
CREATE POLICY "authenticated_insert_interactions" ON interactions
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_interactions" ON interactions;
CREATE POLICY "authenticated_update_interactions" ON interactions
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_interactions" ON interactions;
CREATE POLICY "authenticated_delete_interactions" ON interactions
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- next_actions
DROP POLICY IF EXISTS "authenticated_select_next_actions" ON next_actions;
CREATE POLICY "authenticated_select_next_actions" ON next_actions
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_next_actions" ON next_actions;
CREATE POLICY "authenticated_insert_next_actions" ON next_actions
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_next_actions" ON next_actions;
CREATE POLICY "authenticated_update_next_actions" ON next_actions
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_next_actions" ON next_actions;
CREATE POLICY "authenticated_delete_next_actions" ON next_actions
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- industries
DROP POLICY IF EXISTS "authenticated_select_industries" ON industries;
CREATE POLICY "authenticated_select_industries" ON industries
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_industries" ON industries;
CREATE POLICY "authenticated_insert_industries" ON industries
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_industries" ON industries;
CREATE POLICY "authenticated_update_industries" ON industries
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_industries" ON industries;
CREATE POLICY "authenticated_delete_industries" ON industries
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- prospects
DROP POLICY IF EXISTS "authenticated_select_prospects" ON prospects;
CREATE POLICY "authenticated_select_prospects" ON prospects
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_prospects" ON prospects;
CREATE POLICY "authenticated_insert_prospects" ON prospects
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_prospects" ON prospects;
CREATE POLICY "authenticated_update_prospects" ON prospects
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_prospects" ON prospects;
CREATE POLICY "authenticated_delete_prospects" ON prospects
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- prospect_touches
DROP POLICY IF EXISTS "authenticated_select_prospect_touches" ON prospect_touches;
CREATE POLICY "authenticated_select_prospect_touches" ON prospect_touches
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_prospect_touches" ON prospect_touches;
CREATE POLICY "authenticated_insert_prospect_touches" ON prospect_touches
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_prospect_touches" ON prospect_touches;
CREATE POLICY "authenticated_update_prospect_touches" ON prospect_touches
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_prospect_touches" ON prospect_touches;
CREATE POLICY "authenticated_delete_prospect_touches" ON prospect_touches
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- apollo_sync_log
DROP POLICY IF EXISTS "authenticated_select_apollo_sync_log" ON apollo_sync_log;
CREATE POLICY "authenticated_select_apollo_sync_log" ON apollo_sync_log
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_apollo_sync_log" ON apollo_sync_log;
CREATE POLICY "authenticated_insert_apollo_sync_log" ON apollo_sync_log
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_apollo_sync_log" ON apollo_sync_log;
CREATE POLICY "authenticated_update_apollo_sync_log" ON apollo_sync_log
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_apollo_sync_log" ON apollo_sync_log;
CREATE POLICY "authenticated_delete_apollo_sync_log" ON apollo_sync_log
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- projects
DROP POLICY IF EXISTS "authenticated_select_projects" ON projects;
CREATE POLICY "authenticated_select_projects" ON projects
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_projects" ON projects;
CREATE POLICY "authenticated_insert_projects" ON projects
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_projects" ON projects;
CREATE POLICY "authenticated_update_projects" ON projects
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_projects" ON projects;
CREATE POLICY "authenticated_delete_projects" ON projects
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- project_members
DROP POLICY IF EXISTS "authenticated_select_project_members" ON project_members;
CREATE POLICY "authenticated_select_project_members" ON project_members
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_project_members" ON project_members;
CREATE POLICY "authenticated_insert_project_members" ON project_members
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_project_members" ON project_members;
CREATE POLICY "authenticated_update_project_members" ON project_members
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_project_members" ON project_members;
CREATE POLICY "authenticated_delete_project_members" ON project_members
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- calendar_events
DROP POLICY IF EXISTS "authenticated_select_calendar_events" ON calendar_events;
CREATE POLICY "authenticated_select_calendar_events" ON calendar_events
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_calendar_events" ON calendar_events;
CREATE POLICY "authenticated_insert_calendar_events" ON calendar_events
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_calendar_events" ON calendar_events;
CREATE POLICY "authenticated_update_calendar_events" ON calendar_events
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_calendar_events" ON calendar_events;
CREATE POLICY "authenticated_delete_calendar_events" ON calendar_events
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- tasks
DROP POLICY IF EXISTS "authenticated_select_tasks" ON tasks;
CREATE POLICY "authenticated_select_tasks" ON tasks
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_tasks" ON tasks;
CREATE POLICY "authenticated_insert_tasks" ON tasks
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_tasks" ON tasks;
CREATE POLICY "authenticated_update_tasks" ON tasks
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_tasks" ON tasks;
CREATE POLICY "authenticated_delete_tasks" ON tasks
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- invoices
DROP POLICY IF EXISTS "authenticated_select_invoices" ON invoices;
CREATE POLICY "authenticated_select_invoices" ON invoices
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_invoices" ON invoices;
CREATE POLICY "authenticated_insert_invoices" ON invoices
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_invoices" ON invoices;
CREATE POLICY "authenticated_update_invoices" ON invoices
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_invoices" ON invoices;
CREATE POLICY "authenticated_delete_invoices" ON invoices
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- expenses
DROP POLICY IF EXISTS "authenticated_select_expenses" ON expenses;
CREATE POLICY "authenticated_select_expenses" ON expenses
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_expenses" ON expenses;
CREATE POLICY "authenticated_insert_expenses" ON expenses
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_expenses" ON expenses;
CREATE POLICY "authenticated_update_expenses" ON expenses
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_expenses" ON expenses;
CREATE POLICY "authenticated_delete_expenses" ON expenses
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- goals
DROP POLICY IF EXISTS "authenticated_select_goals" ON goals;
CREATE POLICY "authenticated_select_goals" ON goals
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_goals" ON goals;
CREATE POLICY "authenticated_insert_goals" ON goals
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_goals" ON goals;
CREATE POLICY "authenticated_update_goals" ON goals
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_goals" ON goals;
CREATE POLICY "authenticated_delete_goals" ON goals
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- marketing_posts
DROP POLICY IF EXISTS "authenticated_select_marketing_posts" ON marketing_posts;
CREATE POLICY "authenticated_select_marketing_posts" ON marketing_posts
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_marketing_posts" ON marketing_posts;
CREATE POLICY "authenticated_insert_marketing_posts" ON marketing_posts
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_marketing_posts" ON marketing_posts;
CREATE POLICY "authenticated_update_marketing_posts" ON marketing_posts
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_marketing_posts" ON marketing_posts;
CREATE POLICY "authenticated_delete_marketing_posts" ON marketing_posts
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- documents
DROP POLICY IF EXISTS "authenticated_select_documents" ON documents;
CREATE POLICY "authenticated_select_documents" ON documents
  FOR SELECT TO authenticated USING (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_insert_documents" ON documents;
CREATE POLICY "authenticated_insert_documents" ON documents
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_update_documents" ON documents;
CREATE POLICY "authenticated_update_documents" ON documents
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());

DROP POLICY IF EXISTS "authenticated_delete_documents" ON documents;
CREATE POLICY "authenticated_delete_documents" ON documents
  FOR DELETE TO authenticated USING (public.is_strvx_member());
