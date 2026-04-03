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
  KANBAN_STAGES,
  type PipelineEngagement,
} from "@/lib/pipeline-constants";
import { changeStage } from "@/app/actions";
import { PipelineColumn } from "./pipeline-column";
import { PipelineCard } from "./pipeline-card";
import { toast } from "sonner";

type EngagementsByStage = Record<string, PipelineEngagement[]>;

export function PipelineBoard({
  initialEngagements,
}: {
  initialEngagements: EngagementsByStage;
}) {
  const dndId = useId();
  const [engagementsByStage, setEngagementsByStage] =
    useState<EngagementsByStage>(initialEngagements);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prevInitial, setPrevInitial] = useState(initialEngagements);
  const serverStateRef = useRef(initialEngagements);
  const [, startTransition] = useTransition();

  // Sync with server data when props change (render-time adjustment)
  if (prevInitial !== initialEngagements) {
    setPrevInitial(initialEngagements);
    setEngagementsByStage(initialEngagements);
  }

  // Keep ref in sync for drag-drop revert (must be in effect, not render)
  useEffect(() => {
    serverStateRef.current = initialEngagements;
  }, [initialEngagements]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const allEngagements = Object.values(engagementsByStage).flat();
  const activeEngagement = activeId
    ? allEngagements.find((e) => e.id === activeId) ?? null
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeEngId = active.id as string;
      const overId = over.id as string;

      // Find current stage of the dragged engagement
      let sourceStage: string | null = null;
      for (const [stage, engs] of Object.entries(engagementsByStage)) {
        if (engs.some((e) => e.id === activeEngId)) {
          sourceStage = stage;
          break;
        }
      }
      if (!sourceStage) return;

      // Determine target stage
      let targetStage: string | null = null;
      if (
        KANBAN_STAGES.includes(overId as (typeof KANBAN_STAGES)[number])
      ) {
        targetStage = overId;
      } else {
        // Hovering over another engagement — find its stage
        for (const [stage, engs] of Object.entries(engagementsByStage)) {
          if (engs.some((e) => e.id === overId)) {
            targetStage = stage;
            break;
          }
        }
      }

      if (!targetStage || sourceStage === targetStage) return;

      // Move engagement between stages
      setEngagementsByStage((prev) => {
        const engagement = prev[sourceStage].find(
          (e) => e.id === activeEngId
        );
        if (!engagement) return prev;

        return {
          ...prev,
          [sourceStage]: prev[sourceStage].filter(
            (e) => e.id !== activeEngId
          ),
          [targetStage]: [
            ...prev[targetStage],
            { ...engagement, stage: targetStage },
          ],
        };
      });
    },
    [engagementsByStage]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);

      const activeEngId = event.active.id as string;
      let newStage: string | null = null;

      for (const [stage, engs] of Object.entries(engagementsByStage)) {
        if (engs.some((e) => e.id === activeEngId)) {
          newStage = stage;
          break;
        }
      }

      if (!newStage) return;

      let originalStage: string | null = null;
      for (const [stage, engs] of Object.entries(serverStateRef.current)) {
        if (engs.some((e) => e.id === activeEngId)) {
          originalStage = stage;
          break;
        }
      }

      if (newStage && originalStage && newStage !== originalStage) {
        startTransition(async () => {
          try {
            await changeStage(activeEngId, newStage as Parameters<typeof changeStage>[1]);
            toast.success("Stage updated");
          } catch {
            setEngagementsByStage(serverStateRef.current);
            toast.error("Failed to update stage");
          }
        });
      }
    },
    [engagementsByStage, startTransition]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setEngagementsByStage(serverStateRef.current);
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
            {KANBAN_STAGES.map((stage) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                engagements={engagementsByStage[stage] ?? []}
              />
            ))}
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeEngagement ? (
          <PipelineCard engagement={activeEngagement} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
