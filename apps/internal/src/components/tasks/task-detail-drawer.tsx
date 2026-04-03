"use client";

import { useState } from "react";
import {
  X,
  FolderOpen,
  Clock,
  Trash2,
  Check,
  Calendar,
  AlertTriangle,
  Building2,
} from "lucide-react";
import {
  type Task,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLUMNS,
  PRIORITY_COLORS,
  COLUMN_COLORS,
  ASSIGNEES,
  formatRelativeDate,
  isOverdue,
} from "@/lib/mock-tasks";
import { CustomSelect } from "@/components/ui/custom-select";
import { Users } from "lucide-react";
import type { ProjectOption, ClientOption } from "./tasks-board-loader";

interface TaskDetailDrawerProps {
  task: Task;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  projects: ProjectOption[];
  clients: ClientOption[];
}

export function TaskDetailDrawer({
  task,
  onClose,
  onUpdate,
  onDelete,
  projects,
  clients,
}: TaskDetailDrawerProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const overdue = isOverdue(task.dueDate) && task.status !== "done";

  function saveTitle() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, { title: trimmed });
    } else {
      setTitle(task.title);
    }
  }

  function saveDescription() {
    const trimmed = description.trim();
    if (trimmed !== task.description) {
      onUpdate(task.id, { description: trimmed });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] px-6 py-4">
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COLUMN_COLORS[task.status] }}
            />
            <span className="text-[12px] font-semibold uppercase tracking-wide text-[#888]">
              {TASK_STATUS_LABELS[task.status]}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#aaa] transition-colors hover:bg-[#f5f5f5] hover:text-[#555]"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5">
            {/* Editable title */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className="w-full border-0 bg-transparent text-[18px] font-bold leading-snug text-[#111] outline-none placeholder:text-[#ccc]"
              placeholder="Task title"
            />

            {/* Editable description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              rows={3}
              className="mt-3 w-full resize-none rounded-lg border border-transparent bg-transparent px-0 text-[14px] leading-relaxed text-[#555] outline-none transition-colors placeholder:text-[#bbb] hover:bg-[#fafafa] focus:border-[#e0e0e0] focus:bg-[#fafafa] focus:px-3 focus:py-2"
              placeholder="Add a description..."
            />
          </div>

          {/* Status quick-change */}
          <div className="border-t border-[#f0f0f0] px-6 py-4">
            <label className="mb-2.5 block text-[11px] font-semibold uppercase tracking-wider text-[#aaa]">
              Status
            </label>
            <div className="flex gap-2">
              {TASK_STATUS_COLUMNS.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdate(task.id, { status: s })}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition-all ${
                    task.status === s
                      ? "text-white shadow-sm"
                      : "bg-[#f5f5f5] text-[#777] hover:bg-[#eee]"
                  }`}
                  style={
                    task.status === s
                      ? { backgroundColor: COLUMN_COLORS[s] }
                      : undefined
                  }
                >
                  {task.status === s && <Check size={12} strokeWidth={3} />}
                  {TASK_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Properties grid */}
          <div className="border-t border-[#f0f0f0] px-6 py-4">
            <div className="space-y-4">
              {/* Priority */}
              <div className="flex items-center gap-4">
                <div className="flex w-28 items-center gap-2 text-[12px] text-[#999]">
                  <AlertTriangle size={13} strokeWidth={2} />
                  Priority
                </div>
                <div className="flex gap-1.5">
                  {(["urgent", "high", "normal", "low"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => onUpdate(task.id, { priority: p })}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-all ${
                        task.priority === p
                          ? PRIORITY_COLORS[p]
                          : "text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#888]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignees */}
              <div className="flex items-center gap-4">
                <div className="flex w-28 items-center gap-2 text-[12px] text-[#999]">
                  <Users size={13} strokeWidth={2} />
                  Assignees
                </div>
                <div className="flex gap-1.5">
                  {ASSIGNEES.map((name) => {
                    const isSelected = task.assignees.includes(name);
                    return (
                      <button
                        key={name}
                        onClick={() => {
                          const next = isSelected
                            ? task.assignees.filter((n) => n !== name)
                            : [...task.assignees, name];
                          if (next.length === 0) return;
                          onUpdate(task.id, {
                            assignees: next as typeof task.assignees,
                          });
                        }}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                          isSelected
                            ? "bg-[#111] text-white"
                            : "text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#888]"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Due Date */}
              <div className="flex items-center gap-4">
                <div className="flex w-28 items-center gap-2 text-[12px] text-[#999]">
                  <Calendar size={13} strokeWidth={2} />
                  Due Date
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={task.dueDate}
                    onChange={(e) =>
                      onUpdate(task.id, { dueDate: e.target.value })
                    }
                    className="rounded-lg border border-[#e8e8e8] bg-[#fafafa] px-2.5 py-1.5 text-[13px] text-[#333] outline-none transition-colors focus:border-[#1a73e8] focus:bg-white"
                  />
                  {overdue && (
                    <span className="flex items-center gap-1 rounded-md bg-[#fde8e8] px-2 py-1 text-[11px] font-semibold text-[#e74c3c]">
                      <Clock size={11} strokeWidth={2} />
                      {formatRelativeDate(task.dueDate)}
                    </span>
                  )}
                  {!overdue && (
                    <span className="text-[11px] text-[#aaa]">
                      {formatRelativeDate(task.dueDate)}
                    </span>
                  )}
                </div>
              </div>

              {/* Created */}
              <div className="flex items-center gap-4">
                <div className="flex w-28 items-center gap-2 text-[12px] text-[#999]">
                  <Clock size={13} strokeWidth={2} />
                  Created
                </div>
                <span className="text-[13px] text-[#555]">
                  {task.createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Linked Project */}
          <div className="border-t border-[#f0f0f0] px-6 py-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex w-28 items-center gap-2 text-[12px] text-[#999]">
                  <FolderOpen size={13} strokeWidth={2} />
                  Project
                </div>
                <CustomSelect
                  value={task.projectId || ""}
                  onChange={(val) => {
                    onUpdate(task.id, { projectId: val || null });
                  }}
                  options={[
                    { value: "", label: "No linked project" },
                    ...projects.map((p) => ({
                      value: p.id,
                      label: p.client ? `${p.client} — ${p.name}` : p.name,
                    })),
                  ]}
                  className="min-w-0 flex-1"
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex w-28 items-center gap-2 text-[12px] text-[#999]">
                  <Building2 size={13} strokeWidth={2} />
                  Client
                </div>
                <CustomSelect
                  value={task.engagementId || ""}
                  onChange={(val) => {
                    onUpdate(task.id, { engagementId: val || null });
                  }}
                  options={[
                    { value: "", label: "No linked client" },
                    ...clients.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                  className="min-w-0 flex-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#f0f0f0] px-6 py-3">
          {confirmDelete ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#c0392b]">
                Delete this task?
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg px-3 py-1.5 text-[13px] text-[#777] hover:bg-[#f5f5f5]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="rounded-lg bg-[#e74c3c] px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#c0392b]"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-[#bbb] transition-colors hover:bg-[#fde8e8] hover:text-[#c0392b]"
              >
                <Trash2 size={13} strokeWidth={1.5} />
                Delete
              </button>
              <button
                onClick={onClose}
                className="rounded-lg bg-[#f5f5f5] px-4 py-1.5 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#eee]"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
