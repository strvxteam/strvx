"use client";

import { useState } from "react";
import { X, ListTodo, FolderOpen, Building2 } from "lucide-react";
import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  ASSIGNEES,
  TASK_STATUS_LABELS,
  COLUMN_COLORS,
} from "@/lib/mock-tasks";
import { CustomSelect } from "@/components/ui/custom-select";
import type { ProjectOption, ClientOption } from "./tasks-board-loader";

interface AddTaskModalProps {
  defaultStatus?: TaskStatus;
  defaultProjectId?: string;
  onClose: () => void;
  onSubmit: (task: Task) => void;
  projects: ProjectOption[];
  clients: ClientOption[];
}

export function AddTaskModal({
  defaultStatus = "todo",
  defaultProjectId,
  onClose,
  onSubmit,
  projects,
  clients,
}: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [selectedAssignees, setSelectedAssignees] = useState<
    (typeof ASSIGNEES)[number][]
  >([]);
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [engagementId, setEngagementId] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      id: `task-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      assignees: selectedAssignees,
      dueDate,
      projectId: projectId || null,
      engagementId: engagementId || null,
      createdAt: new Date(),
    });
  }

  const inputClass =
    "w-full rounded-lg border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-[13px] text-[#222] outline-none transition-colors focus:border-[#1a73e8] focus:bg-white";
  const labelClass =
    "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#888]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#f0f0f0] px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8f0fe]">
            <ListTodo size={16} strokeWidth={2} className="text-[#1a73e8]" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-[#111]">New Task</h2>
            <p className="text-[11px] text-[#999]">
              Add to {TASK_STATUS_LABELS[defaultStatus]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#aaa] transition-colors hover:bg-[#f5f5f5] hover:text-[#555]"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="space-y-4">
            {/* Title — large, prominent */}
            <div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                className="w-full border-0 bg-transparent text-[16px] font-semibold text-[#111] outline-none placeholder:text-[#ccc]"
                placeholder="What needs to be done?"
              />
            </div>

            {/* Description */}
            <div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[#e8e8e8] bg-[#fafafa] px-3 py-2.5 text-[13px] text-[#333] outline-none transition-colors placeholder:text-[#bbb] focus:border-[#1a73e8] focus:bg-white"
                placeholder="Add a description..."
              />
            </div>

            {/* Status pills — visual selector */}
            <div>
              <label className={labelClass}>Status</label>
              <div className="flex gap-2">
                {(
                  Object.entries(TASK_STATUS_LABELS) as [TaskStatus, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatus(key)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      status === key
                        ? "text-white shadow-sm"
                        : "bg-[#f5f5f5] text-[#777] hover:bg-[#eee]"
                    }`}
                    style={
                      status === key
                        ? { backgroundColor: COLUMN_COLORS[key] }
                        : undefined
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority pills */}
            <div>
              <label className={labelClass}>Priority</label>
              <div className="flex gap-2">
                {(
                  [
                    ["urgent", "Urgent", "#e74c3c"],
                    ["high", "High", "#f39c12"],
                    ["normal", "Normal", "#1a73e8"],
                    ["low", "Low", "#999"],
                  ] as const
                ).map(([key, label, color]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPriority(key as TaskPriority)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      priority === key
                        ? "text-white shadow-sm"
                        : "bg-[#f5f5f5] text-[#777] hover:bg-[#eee]"
                    }`}
                    style={
                      priority === key
                        ? { backgroundColor: color }
                        : undefined
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignees */}
            <div>
              <label className={labelClass}>Assignees</label>
              <div className="flex gap-2">
                {ASSIGNEES.map((name) => {
                  const isSelected = selectedAssignees.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setSelectedAssignees((prev) => {
                          if (isSelected && prev.length <= 1) return prev;
                          return isSelected
                            ? prev.filter((n) => n !== name)
                            : [...prev, name];
                        });
                      }}
                      className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                        isSelected
                          ? "bg-[#111] text-white shadow-sm"
                          : "bg-[#f5f5f5] text-[#777] hover:bg-[#eee]"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Project */}
            <div>
              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <FolderOpen size={11} strokeWidth={2} />
                  Project
                </span>
              </label>
              <CustomSelect
                value={projectId}
                onChange={setProjectId}
                options={[
                  { value: "", label: "No linked project" },
                  ...projects.map((p) => ({
                    value: p.id,
                    label: p.client ? `${p.client} — ${p.name}` : p.name,
                  })),
                ]}
              />
            </div>

            {/* Client */}
            <div>
              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={11} strokeWidth={2} />
                  Client
                </span>
              </label>
              <CustomSelect
                value={engagementId}
                onChange={setEngagementId}
                options={[
                  { value: "", label: "No linked client" },
                  ...clients.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
              />
            </div>

            {/* Due Date */}
            <div>
              <label className={labelClass}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#f0f0f0] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#777] transition-colors hover:bg-[#f5f5f5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="rounded-lg bg-[#111] px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#333] disabled:opacity-30"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
