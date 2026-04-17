-- Skills & Agents tables
-- Migration 008: skill_libraries, skill_components, skills, skill_component_links, agents, agent_runs

-- Enums
CREATE TYPE skill_library_install_method AS ENUM ('copy-paste', 'npm', 'shadcn-cli');
CREATE TYPE skill_library_category AS ENUM ('base', 'animation', 'editor', 'data', 'ai', 'full', 'utility');
CREATE TYPE skill_component_category AS ENUM ('form', 'layout', 'data-display', 'overlay', 'navigation', 'feedback', 'animation', 'text-effect', 'chart', 'editor', 'ai', 'utility', 'background', 'button', 'card', 'table', 'input');
CREATE TYPE skill_component_status AS ENUM ('available', 'installed', 'approved', 'deprecated');
CREATE TYPE skill_type AS ENUM ('preset', 'custom');
CREATE TYPE skill_category AS ENUM ('layout', 'design-tokens', 'component-preference', 'behavioral', 'pattern');
CREATE TYPE agent_type AS ENUM ('builder', 'linter', 'reviewer', 'automation');
CREATE TYPE agent_status AS ENUM ('active', 'paused', 'draft');
CREATE TYPE agent_run_status AS ENUM ('running', 'success', 'failed');

-- Skill Libraries
CREATE TABLE skill_libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  url TEXT,
  github_url TEXT,
  description TEXT,
  install_method skill_library_install_method NOT NULL DEFAULT 'npm',
  license TEXT,
  category skill_library_category NOT NULL DEFAULT 'base',
  is_active BOOLEAN NOT NULL DEFAULT true,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Skill Components
CREATE TABLE skill_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID NOT NULL REFERENCES skill_libraries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  category skill_component_category NOT NULL DEFAULT 'utility',
  install_command TEXT,
  import_path TEXT,
  dependencies TEXT[],
  props_summary JSONB,
  status skill_component_status NOT NULL DEFAULT 'available',
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX skill_components_library_idx ON skill_components(library_id);
CREATE INDEX skill_components_category_idx ON skill_components(category);

-- Skills (rules + patterns)
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  type skill_type NOT NULL DEFAULT 'custom',
  category skill_category NOT NULL DEFAULT 'pattern',
  rules JSONB,
  code_snippets JSONB,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Skill-Component Links
CREATE TABLE skill_component_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES skill_components(id) ON DELETE CASCADE,
  context TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX skill_component_links_skill_idx ON skill_component_links(skill_id);
CREATE INDEX skill_component_links_component_idx ON skill_component_links(component_id);

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  type agent_type NOT NULL DEFAULT 'builder',
  status agent_status NOT NULL DEFAULT 'draft',
  config JSONB,
  skill_ids UUID[],
  trigger TEXT,
  owner_id UUID REFERENCES users(id),
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Runs
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES users(id),
  input TEXT,
  output TEXT,
  status agent_run_status NOT NULL DEFAULT 'running',
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agent_runs_agent_idx ON agent_runs(agent_id);

-- RLS
ALTER TABLE skill_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_component_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies (hardened — same pattern as migration 002)

-- skill_libraries
CREATE POLICY "authenticated_select_skill_libraries" ON skill_libraries
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_skill_libraries" ON skill_libraries
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_skill_libraries" ON skill_libraries
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_skill_libraries" ON skill_libraries
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- skill_components
CREATE POLICY "authenticated_select_skill_components" ON skill_components
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_skill_components" ON skill_components
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_skill_components" ON skill_components
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_skill_components" ON skill_components
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- skills
CREATE POLICY "authenticated_select_skills" ON skills
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_skills" ON skills
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_skills" ON skills
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_skills" ON skills
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- skill_component_links
CREATE POLICY "authenticated_select_skill_component_links" ON skill_component_links
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_skill_component_links" ON skill_component_links
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_skill_component_links" ON skill_component_links
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_skill_component_links" ON skill_component_links
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- agents
CREATE POLICY "authenticated_select_agents" ON agents
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_agents" ON agents
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_agents" ON agents
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_agents" ON agents
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- agent_runs
CREATE POLICY "authenticated_select_agent_runs" ON agent_runs
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_agent_runs" ON agent_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_agent_runs" ON agent_runs
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_agent_runs" ON agent_runs
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- Unique constraint on skill_component_links
CREATE UNIQUE INDEX skill_component_links_unique_idx ON skill_component_links(skill_id, component_id);

-- Unique constraint on skill_components within a library
CREATE UNIQUE INDEX skill_components_library_slug_idx ON skill_components(library_id, slug);
