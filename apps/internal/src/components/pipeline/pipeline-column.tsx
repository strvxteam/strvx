"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  STAGE_LABELS,
  STAGE_DOT_COLORS,
  type PipelineEngagement,
} from "@/lib/pipeline-constants";
import { PipelineCard } from "./pipeline-card";

export function PipelineColumn({
  stage,
  engagements,
  onArchive,
}: {
  stage: string;
  engagements: PipelineEngagement[];
  onArchive?: (id: string, companyName: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const dotColor = STAGE_DOT_COLORS[stage] ?? "#888";
  const ids = engagements.map((e) => e.id);

  return (
    <div className="flex min-h-[420px] flex-col rounded-lg border border-[#e0e0e0] bg-white">
      <div className="flex items-center justify-between border-b border-[#f0f0f0] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            {STAGE_LABELS[stage] ?? stage}
          </span>
        </div>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f0f0f0] text-[10px] font-semibold text-[#888]">
          {engagements.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 p-2 transition-colors ${
          isOver ? "bg-[#f8f8f8]" : ""
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {engagements.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-[11px] text-[#ddd]">No engagements</span>
            </div>
          ) : (
            engagements.map((eng) => (
              <PipelineCard key={eng.id} engagement={eng} onArchive={onArchive} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
