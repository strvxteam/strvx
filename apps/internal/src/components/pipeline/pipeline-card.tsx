"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  STAGE_DOT_COLORS,
  type PipelineEngagement,
} from "@/lib/pipeline-constants";

export function PipelineCard({
  engagement,
  isOverlay,
  onArchive,
}: {
  engagement: PipelineEngagement;
  isOverlay?: boolean;
  onArchive?: (id: string, companyName: string) => void;
}) {
  const [now] = useState(() => Date.now());
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: engagement.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const daysInStage = Math.floor(
    (now - new Date(engagement.stageEnteredAt).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const daysColor =
    daysInStage > 30
      ? "text-[#c0392b] bg-[#fde8e8]"
      : daysInStage > 14
        ? "text-[#e67e22] bg-[#fef3e2]"
        : "text-[#27ae60] bg-[#e8f5e9]";

  const borderColor = STAGE_DOT_COLORS[engagement.stage] ?? "#888";

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={`group relative rounded-md border border-[#e0e0e0] bg-white transition-all hover:border-[#bbb] hover:shadow-sm ${
        isDragging && !isOverlay ? "opacity-40" : ""
      } ${isOverlay ? "shadow-md" : ""}`}
    >
      {!isOverlay && onArchive && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onArchive(engagement.id, engagement.companyName);
          }}
          aria-label={`Archive ${engagement.companyName}`}
          title="Archive"
          className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded text-[#aaa] opacity-0 transition-opacity hover:bg-[#f0f0f0] hover:text-[#555] group-hover:opacity-100"
        >
          <Archive size={12} />
        </button>
      )}
      <Link
        href={`/clients/${engagement.id}`}
        draggable={false}
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
        className="block p-3"
        style={{ borderLeft: `3px solid ${borderColor}`, borderRadius: "6px" }}
      >
        <div className="text-[13px] font-semibold text-[#222]">
          {engagement.companyName}
        </div>
        <div className="mt-0.5 text-[11px] text-[#888]">
          {engagement.name}
        </div>
        {engagement.contactName && (
          <div className="mt-0.5 text-[11px] text-[#aaa]">
            {engagement.contactName}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          {engagement.dealValue ? (
            <span className="text-[12px] font-medium text-[#333]">
              ${Number(engagement.dealValue).toLocaleString()}
            </span>
          ) : (
            <span className="text-[11px] text-[#ccc]">No value</span>
          )}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${daysColor}`}
          >
            {daysInStage}d
          </span>
        </div>
        {engagement.nextActionDueDate && (
          <div
            className={`mt-1.5 text-[10px] ${
              new Date(engagement.nextActionDueDate) < new Date()
                ? "font-semibold text-[#c0392b]"
                : "text-[#e67e22]"
            }`}
          >
            {new Date(engagement.nextActionDueDate) < new Date()
              ? "Overdue: "
              : "Next: "}
            {new Date(
              engagement.nextActionDueDate + "T00:00:00"
            ).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        )}
      </Link>
    </div>
  );
}
