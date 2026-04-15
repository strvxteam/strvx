"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PARTNER_STAGE_DOT_COLORS,
  PARTNER_TAG_COLORS,
  type PartnerPipelineItem,
} from "@/lib/partner-constants";

export function PartnerCard({
  partner,
  isOverlay,
}: {
  partner: PartnerPipelineItem;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: partner.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const borderColor = PARTNER_STAGE_DOT_COLORS[partner.stage] ?? "#888";

  const stageOpacity =
    partner.stage === "churned"
      ? "opacity-50"
      : partner.stage === "on_hold"
        ? "opacity-70"
        : "";

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={`rounded-md border border-[#e0e0e0] bg-white transition-all hover:border-[#bbb] hover:shadow-sm ${stageOpacity} ${
        isDragging && !isOverlay ? "opacity-40" : ""
      } ${isOverlay ? "shadow-md" : ""}`}
    >
      <Link
        href={`/partners/${partner.id}`}
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
        className="block p-3"
        style={{ borderLeft: `3px solid ${borderColor}`, borderRadius: "6px" }}
      >
        <div className="text-[13px] font-semibold text-[#222]">
          {partner.name}
        </div>
        {partner.company && (
          <div className="mt-0.5 text-[11px] text-[#888]">{partner.company}</div>
        )}

        {partner.tags && partner.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {partner.tags.map((tag) => {
              const colors = PARTNER_TAG_COLORS[tag];
              return (
                <span
                  key={tag}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                    colors ? `${colors.bg} ${colors.text}` : "bg-[#f0f0f0] text-[#888]"
                  }`}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        )}

        {partner.stage === "active" && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[#888]">
            {partner.linkedEngagementCount > 0 && (
              <span>{partner.linkedEngagementCount} engagement{partner.linkedEngagementCount !== 1 ? "s" : ""}</span>
            )}
            {partner.linkedProjectCount > 0 && (
              <span>{partner.linkedProjectCount} project{partner.linkedProjectCount !== 1 ? "s" : ""}</span>
            )}
          </div>
        )}

        {partner.stage === "active" &&
          (partner.outstandingPayable > 0 || partner.outstandingReceivable > 0) && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
              {partner.outstandingPayable > 0 && (
                <span className="text-[#c0392b]">
                  Owe ${Number(partner.outstandingPayable).toLocaleString()}
                </span>
              )}
              {partner.outstandingReceivable > 0 && (
                <span className="text-[#27ae60]">
                  Recv ${Number(partner.outstandingReceivable).toLocaleString()}
                </span>
              )}
            </div>
          )}
      </Link>
    </div>
  );
}
