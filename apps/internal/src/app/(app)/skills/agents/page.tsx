import type { Metadata } from "next";
import { getAgents, getAgentWithRules, getSkills } from "@/lib/queries";
import { AgentWorkbench } from "./agent-workbench";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skills — Agents" };

export default async function SkillAgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const params = await searchParams;
  const [agentsList, allSkills] = await Promise.all([getAgents(), getSkills()]);

  // Load selected agent or default to first
  const selectedId = params.agent ?? agentsList[0]?.id;
  const agentData = selectedId ? await getAgentWithRules(selectedId) : null;

  return (
    <AgentWorkbench
      key={selectedId ?? "none"}
      agents={agentsList}
      allSkills={allSkills}
      initialAgentData={agentData}
      initialSelectedId={selectedId ?? null}
    />
  );
}
