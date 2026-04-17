-- Migration 009: Add component detail fields + corrections table

-- Add key_props and when_to_use to skill_components
ALTER TABLE skill_components ADD COLUMN IF NOT EXISTS key_props TEXT;
ALTER TABLE skill_components ADD COLUMN IF NOT EXISTS when_to_use TEXT;

-- Corrections enums
CREATE TYPE correction_severity AS ENUM ('critical', 'important', 'minor');
CREATE TYPE correction_category AS ENUM ('layout', 'component-choice', 'spacing', 'scrolling', 'responsive', 'accessibility', 'performance', 'styling', 'pattern', 'other');

-- Corrections table (learnings from past UI mistakes)
CREATE TABLE corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  wrong_approach TEXT,
  correct_approach TEXT,
  code_example TEXT,
  severity correction_severity NOT NULL DEFAULT 'important',
  category correction_category NOT NULL DEFAULT 'other',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_corrections" ON corrections
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_corrections" ON corrections
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_corrections" ON corrections
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_corrections" ON corrections
  FOR DELETE TO authenticated USING (public.is_strvx_member());
