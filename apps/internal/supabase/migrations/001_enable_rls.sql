-- ============================================================================
-- RLS Policies for strvx-internal-tool
-- ============================================================================
-- Context: 3-person co-founder team. All authenticated users get full access.
-- The anon key is exposed in the client bundle — without RLS, anyone who
-- extracts NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY can
-- read/write all data via the Supabase REST API.
--
-- Server-side Drizzle queries use DATABASE_URL (postgres superuser) and
-- bypass RLS automatically. These policies protect against:
--   1. Direct REST API access with the anon key
--   2. Supabase Realtime subscriptions (need authenticated SELECT)
--   3. Supabase Dashboard access with anon key
--
-- Future: add auth_id column to users table to enable per-user row ownership.
-- ============================================================================

-- ── Add auth_id column to users for future per-user RLS ──────────────
-- Maps Supabase Auth uid to the application users table.
-- getCurrentUser() syncs this on first login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id uuid UNIQUE;

-- ── Enable RLS on all tables ─────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- ── Authenticated user policies ──────────────────────────────────────
-- Any logged-in team member gets full CRUD on all tables.
-- Uses DROP IF EXISTS + CREATE for idempotency.

-- users
DROP POLICY IF EXISTS "authenticated_select_users" ON users;
CREATE POLICY "authenticated_select_users" ON users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_users" ON users;
CREATE POLICY "authenticated_insert_users" ON users
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_users" ON users;
CREATE POLICY "authenticated_update_users" ON users
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_users" ON users;
CREATE POLICY "authenticated_delete_users" ON users
  FOR DELETE TO authenticated USING (true);

-- companies
DROP POLICY IF EXISTS "authenticated_select_companies" ON companies;
CREATE POLICY "authenticated_select_companies" ON companies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_companies" ON companies;
CREATE POLICY "authenticated_insert_companies" ON companies
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_companies" ON companies;
CREATE POLICY "authenticated_update_companies" ON companies
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_companies" ON companies;
CREATE POLICY "authenticated_delete_companies" ON companies
  FOR DELETE TO authenticated USING (true);

-- contacts
DROP POLICY IF EXISTS "authenticated_select_contacts" ON contacts;
CREATE POLICY "authenticated_select_contacts" ON contacts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_contacts" ON contacts;
CREATE POLICY "authenticated_insert_contacts" ON contacts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_contacts" ON contacts;
CREATE POLICY "authenticated_update_contacts" ON contacts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_contacts" ON contacts;
CREATE POLICY "authenticated_delete_contacts" ON contacts
  FOR DELETE TO authenticated USING (true);

-- engagements
DROP POLICY IF EXISTS "authenticated_select_engagements" ON engagements;
CREATE POLICY "authenticated_select_engagements" ON engagements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_engagements" ON engagements;
CREATE POLICY "authenticated_insert_engagements" ON engagements
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_engagements" ON engagements;
CREATE POLICY "authenticated_update_engagements" ON engagements
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_engagements" ON engagements;
CREATE POLICY "authenticated_delete_engagements" ON engagements
  FOR DELETE TO authenticated USING (true);

-- stage_history
DROP POLICY IF EXISTS "authenticated_select_stage_history" ON stage_history;
CREATE POLICY "authenticated_select_stage_history" ON stage_history
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_stage_history" ON stage_history;
CREATE POLICY "authenticated_insert_stage_history" ON stage_history
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_stage_history" ON stage_history;
CREATE POLICY "authenticated_update_stage_history" ON stage_history
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_stage_history" ON stage_history;
CREATE POLICY "authenticated_delete_stage_history" ON stage_history
  FOR DELETE TO authenticated USING (true);

-- interactions
DROP POLICY IF EXISTS "authenticated_select_interactions" ON interactions;
CREATE POLICY "authenticated_select_interactions" ON interactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_interactions" ON interactions;
CREATE POLICY "authenticated_insert_interactions" ON interactions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_interactions" ON interactions;
CREATE POLICY "authenticated_update_interactions" ON interactions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_interactions" ON interactions;
CREATE POLICY "authenticated_delete_interactions" ON interactions
  FOR DELETE TO authenticated USING (true);

-- next_actions
DROP POLICY IF EXISTS "authenticated_select_next_actions" ON next_actions;
CREATE POLICY "authenticated_select_next_actions" ON next_actions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_next_actions" ON next_actions;
CREATE POLICY "authenticated_insert_next_actions" ON next_actions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_next_actions" ON next_actions;
CREATE POLICY "authenticated_update_next_actions" ON next_actions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_next_actions" ON next_actions;
CREATE POLICY "authenticated_delete_next_actions" ON next_actions
  FOR DELETE TO authenticated USING (true);

-- industries
DROP POLICY IF EXISTS "authenticated_select_industries" ON industries;
CREATE POLICY "authenticated_select_industries" ON industries
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_industries" ON industries;
CREATE POLICY "authenticated_insert_industries" ON industries
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_industries" ON industries;
CREATE POLICY "authenticated_update_industries" ON industries
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_industries" ON industries;
CREATE POLICY "authenticated_delete_industries" ON industries
  FOR DELETE TO authenticated USING (true);

-- prospects
DROP POLICY IF EXISTS "authenticated_select_prospects" ON prospects;
CREATE POLICY "authenticated_select_prospects" ON prospects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_prospects" ON prospects;
CREATE POLICY "authenticated_insert_prospects" ON prospects
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_prospects" ON prospects;
CREATE POLICY "authenticated_update_prospects" ON prospects
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_prospects" ON prospects;
CREATE POLICY "authenticated_delete_prospects" ON prospects
  FOR DELETE TO authenticated USING (true);

-- prospect_touches
DROP POLICY IF EXISTS "authenticated_select_prospect_touches" ON prospect_touches;
CREATE POLICY "authenticated_select_prospect_touches" ON prospect_touches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_prospect_touches" ON prospect_touches;
CREATE POLICY "authenticated_insert_prospect_touches" ON prospect_touches
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_prospect_touches" ON prospect_touches;
CREATE POLICY "authenticated_update_prospect_touches" ON prospect_touches
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_prospect_touches" ON prospect_touches;
CREATE POLICY "authenticated_delete_prospect_touches" ON prospect_touches
  FOR DELETE TO authenticated USING (true);

-- apollo_sync_log
DROP POLICY IF EXISTS "authenticated_select_apollo_sync_log" ON apollo_sync_log;
CREATE POLICY "authenticated_select_apollo_sync_log" ON apollo_sync_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_apollo_sync_log" ON apollo_sync_log;
CREATE POLICY "authenticated_insert_apollo_sync_log" ON apollo_sync_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_apollo_sync_log" ON apollo_sync_log;
CREATE POLICY "authenticated_update_apollo_sync_log" ON apollo_sync_log
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_apollo_sync_log" ON apollo_sync_log;
CREATE POLICY "authenticated_delete_apollo_sync_log" ON apollo_sync_log
  FOR DELETE TO authenticated USING (true);

-- projects
DROP POLICY IF EXISTS "authenticated_select_projects" ON projects;
CREATE POLICY "authenticated_select_projects" ON projects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_projects" ON projects;
CREATE POLICY "authenticated_insert_projects" ON projects
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_projects" ON projects;
CREATE POLICY "authenticated_update_projects" ON projects
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_projects" ON projects;
CREATE POLICY "authenticated_delete_projects" ON projects
  FOR DELETE TO authenticated USING (true);

-- project_members
DROP POLICY IF EXISTS "authenticated_select_project_members" ON project_members;
CREATE POLICY "authenticated_select_project_members" ON project_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_project_members" ON project_members;
CREATE POLICY "authenticated_insert_project_members" ON project_members
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_project_members" ON project_members;
CREATE POLICY "authenticated_update_project_members" ON project_members
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_project_members" ON project_members;
CREATE POLICY "authenticated_delete_project_members" ON project_members
  FOR DELETE TO authenticated USING (true);

-- calendar_events
DROP POLICY IF EXISTS "authenticated_select_calendar_events" ON calendar_events;
CREATE POLICY "authenticated_select_calendar_events" ON calendar_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_calendar_events" ON calendar_events;
CREATE POLICY "authenticated_insert_calendar_events" ON calendar_events
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_calendar_events" ON calendar_events;
CREATE POLICY "authenticated_update_calendar_events" ON calendar_events
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_calendar_events" ON calendar_events;
CREATE POLICY "authenticated_delete_calendar_events" ON calendar_events
  FOR DELETE TO authenticated USING (true);

-- tasks
DROP POLICY IF EXISTS "authenticated_select_tasks" ON tasks;
CREATE POLICY "authenticated_select_tasks" ON tasks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_tasks" ON tasks;
CREATE POLICY "authenticated_insert_tasks" ON tasks
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_tasks" ON tasks;
CREATE POLICY "authenticated_update_tasks" ON tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_tasks" ON tasks;
CREATE POLICY "authenticated_delete_tasks" ON tasks
  FOR DELETE TO authenticated USING (true);

-- invoices
DROP POLICY IF EXISTS "authenticated_select_invoices" ON invoices;
CREATE POLICY "authenticated_select_invoices" ON invoices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_invoices" ON invoices;
CREATE POLICY "authenticated_insert_invoices" ON invoices
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_invoices" ON invoices;
CREATE POLICY "authenticated_update_invoices" ON invoices
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_invoices" ON invoices;
CREATE POLICY "authenticated_delete_invoices" ON invoices
  FOR DELETE TO authenticated USING (true);

-- expenses
DROP POLICY IF EXISTS "authenticated_select_expenses" ON expenses;
CREATE POLICY "authenticated_select_expenses" ON expenses
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_expenses" ON expenses;
CREATE POLICY "authenticated_insert_expenses" ON expenses
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_expenses" ON expenses;
CREATE POLICY "authenticated_update_expenses" ON expenses
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_expenses" ON expenses;
CREATE POLICY "authenticated_delete_expenses" ON expenses
  FOR DELETE TO authenticated USING (true);

-- goals
DROP POLICY IF EXISTS "authenticated_select_goals" ON goals;
CREATE POLICY "authenticated_select_goals" ON goals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_goals" ON goals;
CREATE POLICY "authenticated_insert_goals" ON goals
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_goals" ON goals;
CREATE POLICY "authenticated_update_goals" ON goals
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_goals" ON goals;
CREATE POLICY "authenticated_delete_goals" ON goals
  FOR DELETE TO authenticated USING (true);

-- marketing_posts
DROP POLICY IF EXISTS "authenticated_select_marketing_posts" ON marketing_posts;
CREATE POLICY "authenticated_select_marketing_posts" ON marketing_posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_marketing_posts" ON marketing_posts;
CREATE POLICY "authenticated_insert_marketing_posts" ON marketing_posts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_marketing_posts" ON marketing_posts;
CREATE POLICY "authenticated_update_marketing_posts" ON marketing_posts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_marketing_posts" ON marketing_posts;
CREATE POLICY "authenticated_delete_marketing_posts" ON marketing_posts
  FOR DELETE TO authenticated USING (true);

-- documents
DROP POLICY IF EXISTS "authenticated_select_documents" ON documents;
CREATE POLICY "authenticated_select_documents" ON documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_documents" ON documents;
CREATE POLICY "authenticated_insert_documents" ON documents
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_documents" ON documents;
CREATE POLICY "authenticated_update_documents" ON documents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_documents" ON documents;
CREATE POLICY "authenticated_delete_documents" ON documents
  FOR DELETE TO authenticated USING (true);

-- ── Realtime ──────────────────────────────────────────────────────────
-- The supabase_realtime publication already includes the tables the app
-- subscribes to (interactions, next_actions, engagements, contacts,
-- prospects). No changes needed — verified 2026-03-31.
