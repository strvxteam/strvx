-- Migration 011: Patterns table for extracted codebase layout patterns

CREATE TABLE patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  archetype TEXT NOT NULL CHECK (archetype IN ('list', 'detail', 'dashboard', 'form', 'editor', 'split')),
  source_project TEXT NOT NULL,
  source_file TEXT,
  layout_tree TEXT NOT NULL,
  code_example TEXT,
  annotations JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_patterns" ON patterns
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_patterns" ON patterns
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_patterns" ON patterns
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_patterns" ON patterns
  FOR DELETE TO authenticated USING (public.is_strvx_member());
