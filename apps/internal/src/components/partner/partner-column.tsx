"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  PARTNER_STAGE_LABELS,
  PARTNER_STAGE_DOT_COLORS,
  PARTNER_COLUMN_BG,
  type PartnerPipelineItem,
} from "@/lib/partner-constants";
import { PartnerCard } from "./partner-card";

export function PartnerColumn({
  stage,
  partners,
}: {
  stage: string;
  partners: PartnerPipelineItem[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const dotColor = PARTNER_STAGE_DOT_COLORS[stage] ?? "#888";
  const columnBg = PARTNER_COLUMN_BG[stage] ?? "bg-[#f8f8f8]";
  const ids = partners.map((p) => p.id);

  return (
    <div className="flex min-h-[420px] flex-col rounded-lg border border-[#e0e0e0] bg-white">
      <div className="flex items-center justify-between border-b border-[#f0f0f0] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            {PARTNER_STAGE_LABELS[stage] ?? stage}
          </span>
        </div>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f0f0f0] text-[10px] font-semibold text-[#888]">
          {partners.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 p-2 transition-colors ${columnBg} ${
          isOver ? "brightness-95" : ""
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {partners.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-[11px] text-[#ddd]">No partners</span>
            </div>
          ) : (
            partners.map((partner) => (
              <PartnerCard key={partner.id} partner={partner} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
