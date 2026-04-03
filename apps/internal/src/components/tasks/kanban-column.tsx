"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { TaskCard } from "./task-card";
import {
  type Task,
  type TaskStatus,
  TASK_STATUS_LABELS,
  COLUMN_COLORS,
} from "@/lib/mock-tasks";

const COLUMN_BG: Record<TaskStatus, string> = {
  todo: "#eeeeef",
  in_progress: "#e2ecfc",
  blocked: "#fce8e8",
  done: "#e2f2e8",
};

const COLUMN_HOVER_BG: Record<TaskStatus, string> = {
  todo: "#e4e4e6",
  in_progress: "#d4e2f8",
  blocked: "#f8d8d8",
  done: "#d4eadc",
};

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onCardClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  projectNameMap: Record<string, string>;
  clientNameMap: Record<string, string>;
}

export function KanbanColumn({
  status,
  tasks,
  onCardClick,
  onAddTask,
  projectNameMap,
  clientNameMap,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className="flex flex-col rounded-xl transition-colors"
      style={{
        backgroundColor: isOver ? COLUMN_HOVER_BG[status] : COLUMN_BG[status],
      }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLUMN_COLORS[status] }}
          />
          <span className="text-[12px] font-bold uppercase tracking-wide text-[#555]">
            {TASK_STATUS_LABELS[status]}
          </span>
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/70 px-1.5 text-[11px] font-bold text-[#888]">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(status)}
          className="rounded-md p-1 text-[#999] transition-colors hover:bg-white/60 hover:text-[#555]"
        >
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Cards area */}
      <div
        ref={setNodeRef}
        className="flex min-h-[350px] flex-1 flex-col gap-3 px-2.5 pb-3"
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#e0e0e0]/50 py-12">
              <span className="text-[12px] font-medium text-[#ccc]">
                No tasks
              </span>
              <button
                onClick={() => onAddTask(status)}
                className="rounded-md bg-white/80 px-2.5 py-1 text-[11px] font-medium text-[#999] shadow-sm transition-colors hover:bg-white hover:text-[#555]"
              >
                + Add one
              </button>
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => onCardClick(task)}
                projectName={task.projectId ? projectNameMap[task.projectId] : null}
                companyName={task.engagementId ? clientNameMap[task.engagementId] : null}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
