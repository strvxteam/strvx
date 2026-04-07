"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, FolderOpen, Building2, GripVertical } from "lucide-react";
import {
  type Task,
  PRIORITY_COLORS,
  formatRelativeDate,
  isOverdue,
} from "@/lib/mock-tasks";

const PRIORITY_LEFT: Record<string, string> = {
  urgent: "#e74c3c",
  high: "#f39c12",
  normal: "#1a73e8",
  low: "#ccc",
};

const TEAM_AVATARS: Record<string, string> = {
  Nick: "/avatars/nick.png",
  Alex: "/avatars/alex.png",
};

const ASSIGNEE_COLORS: Record<string, { bg: string; text: string }> = {
  Nick: { bg: "#e8f0fe", text: "#1a73e8" },
  Alex: { bg: "#f3e5f5", text: "#8e24aa" },
};

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isOverlay?: boolean;
  projectName?: string | null;
  companyName?: string | null;
}

export function TaskCard({ task, onClick, isOverlay, projectName, companyName }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeft: `4px solid ${PRIORITY_LEFT[task.priority] ?? "#ccc"}`,
  };

  const overdue = isOverdue(task.dueDate) && task.status !== "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg bg-white transition-all ${
        isDragging
          ? "opacity-30"
          : "shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
      } ${isOverlay ? "rotate-[2deg] shadow-[0_12px_28px_rgba(0,0,0,0.2)]" : ""}`}
    >
      {/* Drag handle + clickable area */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 flex h-full w-6 cursor-grab items-center justify-center rounded-l-lg opacity-0 transition-opacity group-hover:opacity-100"
      >
        <GripVertical size={12} className="text-[#bbb]" />
      </div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (!isDragging) onClick();
        }}
        className="cursor-pointer p-4 pl-5"
      >
        {/* Title */}
        <p className="text-[13px] font-semibold leading-snug text-[#111]">
          {task.title}
        </p>

        {/* Description */}
        {task.description && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#777] line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Tags row */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_COLORS[task.priority]}`}
          >
            {task.priority}
          </span>
          {projectName && (
            <span className="flex items-center gap-1 rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-medium text-[#666]">
              <FolderOpen size={9} strokeWidth={2} />
              {projectName}
            </span>
          )}
          {companyName && (
            <span className="flex items-center gap-1 rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-medium text-[#666]">
              <Building2 size={9} strokeWidth={2} />
              {companyName}
            </span>
          )}
        </div>

        {/* Footer: due date + assignee */}
        <div className="mt-3 flex items-center justify-between border-t border-[#f0f0f0] pt-2.5">
          <span
            className={`flex items-center gap-1 text-[11px] font-medium ${
              overdue ? "text-[#e74c3c]" : "text-[#999]"
            }`}
          >
            <Clock size={11} strokeWidth={2} />
            {formatRelativeDate(task.dueDate)}
          </span>
          <div className="flex items-center gap-1.5">
            {task.assignees.length === 1 && (
              <span className="text-[11px] text-[#999]">{task.assignees[0]}</span>
            )}
            <div className="flex -space-x-1.5">
              {task.assignees.map((name) => {
                const avatar = TEAM_AVATARS[name];
                if (avatar) {
                  return (
                    <img
                      key={name}
                      src={avatar}
                      alt={name}
                      className="h-6 w-6 rounded-full border-2 border-white object-cover"
                    />
                  );
                }
                const c = ASSIGNEE_COLORS[name] ?? { bg: "#f0f0f0", text: "#555" };
                return (
                  <span
                    key={name}
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold"
                    style={{ backgroundColor: c.bg, color: c.text }}
                  >
                    {name[0]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
