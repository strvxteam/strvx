"use client";

import { useState, useCallback, useEffect, useId, useRef, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  PARTNER_KANBAN_STAGES,
  type PartnerPipelineItem,
} from "@/lib/partner-constants";
import { changePartnerStage } from "@/app/actions";
import { PartnerColumn } from "./partner-column";
import { PartnerCard } from "./partner-card";
import { toast } from "sonner";

type PartnersByStage = Record<string, PartnerPipelineItem[]>;

export function PartnerBoard({
  initialPartners,
}: {
  initialPartners: PartnersByStage;
}) {
  const dndId = useId();
  const [partnersByStage, setPartnersByStage] =
    useState<PartnersByStage>(initialPartners);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prevInitial, setPrevInitial] = useState(initialPartners);
  const serverStateRef = useRef(initialPartners);
  const [, startTransition] = useTransition();

  // Sync with server data when props change (render-time adjustment)
  if (prevInitial !== initialPartners) {
    setPrevInitial(initialPartners);
    setPartnersByStage(initialPartners);
  }

  // Keep ref in sync for drag-drop revert (must be in effect, not render)
  useEffect(() => {
    serverStateRef.current = initialPartners;
  }, [initialPartners]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const allPartners = Object.values(partnersByStage).flat();
  const activePartner = activeId
    ? allPartners.find((p) => p.id === activeId) ?? null
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activePartnerId = active.id as string;
      const overId = over.id as string;

      // Find current stage of the dragged partner
      let sourceStage: string | null = null;
      for (const [stage, pts] of Object.entries(partnersByStage)) {
        if (pts.some((p) => p.id === activePartnerId)) {
          sourceStage = stage;
          break;
        }
      }
      if (!sourceStage) return;

      // Determine target stage
      let targetStage: string | null = null;
      if (
        PARTNER_KANBAN_STAGES.includes(overId as (typeof PARTNER_KANBAN_STAGES)[number])
      ) {
        targetStage = overId;
      } else {
        // Hovering over another partner — find its stage
        for (const [stage, pts] of Object.entries(partnersByStage)) {
          if (pts.some((p) => p.id === overId)) {
            targetStage = stage;
            break;
          }
        }
      }

      if (!targetStage || sourceStage === targetStage) return;

      // Move partner between stages
      setPartnersByStage((prev) => {
        const partner = prev[sourceStage!].find(
          (p) => p.id === activePartnerId
        );
        if (!partner) return prev;

        return {
          ...prev,
          [sourceStage!]: prev[sourceStage!].filter(
            (p) => p.id !== activePartnerId
          ),
          [targetStage!]: [
            ...prev[targetStage!],
            { ...partner, stage: targetStage! },
          ],
        };
      });
    },
    [partnersByStage]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);

      const activePartnerId = event.active.id as string;
      let newStage: string | null = null;

      for (const [stage, pts] of Object.entries(partnersByStage)) {
        if (pts.some((p) => p.id === activePartnerId)) {
          newStage = stage;
          break;
        }
      }

      if (!newStage) return;

      let originalStage: string | null = null;
      for (const [stage, pts] of Object.entries(serverStateRef.current)) {
        if (pts.some((p) => p.id === activePartnerId)) {
          originalStage = stage;
          break;
        }
      }

      if (newStage && originalStage && newStage !== originalStage) {
        startTransition(async () => {
          try {
            await changePartnerStage(
              activePartnerId,
              newStage as Parameters<typeof changePartnerStage>[1]
            );
            toast.success("Stage updated");
          } catch {
            setPartnersByStage(serverStateRef.current);
            toast.error("Failed to update stage");
          }
        });
      }
    },
    [partnersByStage, startTransition]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setPartnersByStage(serverStateRef.current);
  }, []);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid auto-cols-fr grid-flow-col gap-2">
            {PARTNER_KANBAN_STAGES.map((stage) => (
              <PartnerColumn
                key={stage}
                stage={stage}
                partners={partnersByStage[stage] ?? []}
              />
            ))}
          </div>
        </div>
      </div>
      <DragOverlay>
        {activePartner ? (
          <PartnerCard partner={activePartner} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
