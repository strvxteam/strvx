import type { Metadata } from "next";
import { getPipelineEngagements } from "@/lib/queries";

export const metadata: Metadata = { title: "Pipeline" };
import {
  KANBAN_STAGES,
  type PipelineEngagement,
} from "@/lib/pipeline-constants";
import { PipelineBoardLoader } from "@/components/pipeline/pipeline-board-loader";

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const data = await getPipelineEngagements();
  const allEngagements = data;

  // Group active engagements by stage (exclude closed)
  const engagementsByStage: Record<string, PipelineEngagement[]> = {};
  for (const stage of KANBAN_STAGES) {
    engagementsByStage[stage] = [];
  }
  for (const eng of allEngagements) {
    if (eng.stage === "closed_won" || eng.stage === "closed_lost") continue;
    if (engagementsByStage[eng.stage]) {
      engagementsByStage[eng.stage].push(eng as PipelineEngagement);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Pipeline</h1>
      </div>

      <PipelineBoardLoader initialEngagements={engagementsByStage} />
    </div>
  );
}
