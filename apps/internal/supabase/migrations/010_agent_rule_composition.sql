-- Migration 010: Agent rule composition system
-- Rules get a scope (global/importable), agents get deployment tracking

-- Add scope to skills (rules)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'importable'
  CHECK (scope IN ('global', 'importable'));

-- Add deployment tracking to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deployed_output TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deploy_path TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS include_corrections BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS include_components BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS identity TEXT;

-- Agent-rule links (replaces the skill_ids uuid[] column with a proper join table)
CREATE TABLE IF NOT EXISTS agent_rule_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_rule_links_unique_idx ON agent_rule_links(agent_id, skill_id);
CREATE INDEX IF NOT EXISTS agent_rule_links_agent_idx ON agent_rule_links(agent_id);

-- RLS for agent_rule_links
ALTER TABLE agent_rule_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select_agent_rule_links" ON agent_rule_links
  FOR SELECT TO authenticated USING (public.is_strvx_member());
CREATE POLICY "authenticated_insert_agent_rule_links" ON agent_rule_links
  FOR INSERT TO authenticated WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_update_agent_rule_links" ON agent_rule_links
  FOR UPDATE TO authenticated USING (public.is_strvx_member()) WITH CHECK (public.is_strvx_member());
CREATE POLICY "authenticated_delete_agent_rule_links" ON agent_rule_links
  FOR DELETE TO authenticated USING (public.is_strvx_member());

-- Clean out placeholder agents
DELETE FROM agent_runs;
DELETE FROM agents;
