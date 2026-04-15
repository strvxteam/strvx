import type { Metadata } from "next";
import { getPartnerPipeline } from "@/lib/partner-queries";
import {
  PARTNER_KANBAN_STAGES,
  type PartnerPipelineItem,
} from "@/lib/partner-constants";
import { PartnerBoard } from "@/components/partner/partner-board";

export const metadata: Metadata = { title: "Partner Pipeline" };

export const dynamic = "force-dynamic";

export default async function PartnerPipelinePage() {
  const data = await getPartnerPipeline();

  // Group partners by stage
  const partnersByStage: Record<string, PartnerPipelineItem[]> = {};
  for (const stage of PARTNER_KANBAN_STAGES) {
    partnersByStage[stage] = [];
  }
  for (const partner of data) {
    if (partnersByStage[partner.stage]) {
      partnersByStage[partner.stage].push(partner as PartnerPipelineItem);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Partner Pipeline</h1>
      </div>

      <PartnerBoard initialPartners={partnersByStage} />
    </div>
  );
}
