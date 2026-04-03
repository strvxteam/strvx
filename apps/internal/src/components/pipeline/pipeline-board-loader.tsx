"use client";

import dynamic from "next/dynamic";
import type { PipelineEngagement } from "@/lib/pipeline-constants";

function PipelineSkeleton() {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-[#e0e0e0] bg-[#fafafa] p-3">
          <div className="mb-3 h-4 w-20 animate-pulse rounded bg-[#e0e0e0]" />
          <div className="space-y-2">
            <div className="h-24 animate-pulse rounded-md bg-[#e8e8e8]" />
          </div>
        </div>
      ))}
    </div>
  );
}

const PipelineBoard = dynamic(
  () =>
    import("@/components/pipeline/pipeline-board").then(
      (m) => m.PipelineBoard
    ),
  { ssr: false, loading: () => <PipelineSkeleton /> }
);

export function PipelineBoardLoader({
  initialEngagements,
}: {
  initialEngagements: Record<string, PipelineEngagement[]>;
}) {
  return <PipelineBoard initialEngagements={initialEngagements} />;
}
