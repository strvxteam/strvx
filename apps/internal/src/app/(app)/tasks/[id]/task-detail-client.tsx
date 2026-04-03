"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLUMNS,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/mock-tasks";
import { CustomSelect } from "@/components/ui/custom-select";
import { ASSIGNEES } from "@/lib/mock-tasks";
import {
  updateTask as updateTaskAction,
  deleteTask as deleteTaskAction,
} from "@/app/actions";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

interface TaskDetailClientProps {
  task: Task;
  projectName: string | null;
  clientName: string | null;
  userNameToId: Record<string, string>;
}

export function TaskDetailClient({
  task,
  projectName,
  clientName,
  userNameToId,
}: TaskDetailClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [selectedAssignees, setSelectedAssignees] = useState<Task["assignees"]>(task.assignees);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [description, setDescription] = useState(task.description);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const descriptionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistUpdate = useCallback(
    (
      updates: Parameters<typeof updateTaskAction>[1],
      rollback: () => void
    ) => {
      startTransition(async () => {
        try {
          await updateTaskAction(task.id, updates);
          toast.success("Task updated");
        } catch (err) {
          console.error(err);
          rollback();
          toast.error("Failed to update task");
        }
      });
    },
    [task.id]
  );

  function handleStatusChange(val: string) {
    const prev = status;
    const next = val as TaskStatus;
    setStatus(next);
    persistUpdate({ status: next }, () => setStatus(prev));
  }

  function handlePriorityChange(val: string) {
    const prev = priority;
    const next = val as TaskPriority;
    setPriority(next);
    persistUpdate({ priority: next }, () => setPriority(prev));
  }

  function handleAssigneeToggle(name: (typeof ASSIGNEES)[number]) {
    const prev = selectedAssignees;
    const isSelected = prev.includes(name);
    if (isSelected && prev.length <= 1) return;
    const next = isSelected
      ? prev.filter((n) => n !== name)
      : ([...prev, name] as typeof prev);
    setSelectedAssignees(next);
    persistUpdate(
      {
        assigneeIds: next
          .map((n) => userNameToId[n])
          .filter(Boolean),
      },
      () => setSelectedAssignees(prev)
    );
  }

  function handleDueDateChange(val: string) {
    const prev = dueDate;
    setDueDate(val);
    persistUpdate({ dueDate: val }, () => setDueDate(prev));
  }

  function handleDescriptionChange(val: string) {
    setDescription(val);
    // Debounce description saves to avoid spamming on every keystroke
    if (descriptionTimerRef.current) {
      clearTimeout(descriptionTimerRef.current);
    }
    descriptionTimerRef.current = setTimeout(() => {
      const prev = description;
      persistUpdate({ description: val }, () => setDescription(prev));
    }, 600);
  }

  function handleDelete() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setIsDeleting(true);
    deleteTaskAction(task.id)
      .then(() => {
        toast.success("Task deleted");
        router.push("/tasks");
      })
      .catch((err) => {
        console.error(err);
        setIsDeleting(false);
        toast.error("Failed to delete task");
      });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Properties card */}
      <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#888]">
          Properties
        </h3>
        <div className="space-y-3 text-[13px]">
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-[#888]">Status</span>
            <CustomSelect
              value={status}
              onChange={handleStatusChange}
              options={TASK_STATUS_COLUMNS.map((s) => ({
                value: s,
                label: TASK_STATUS_LABELS[s],
              }))}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-[#888]">Priority</span>
            <CustomSelect
              value={priority}
              onChange={handlePriorityChange}
              options={[
                { value: "urgent", label: "Urgent" },
                { value: "high", label: "High" },
                { value: "normal", label: "Normal" },
                { value: "low", label: "Low" },
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-[#888]">Assignees</span>
            <div className="flex gap-1.5">
              {ASSIGNEES.map((name) => {
                const isSelected = selectedAssignees.includes(name);
                return (
                  <button
                    key={name}
                    onClick={() => handleAssigneeToggle(name)}
                    disabled={isPending}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      isSelected
                        ? "bg-[#111] text-white"
                        : "bg-[#f5f5f5] text-[#777] hover:bg-[#eee]"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#888]">Due Date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => handleDueDateChange(e.target.value)}
              className="appearance-none rounded-lg border border-[#e0e0e0] bg-[#fafafa] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat px-3 py-2 pr-8 text-[13px] text-[#222] outline-none transition-colors focus:border-[#1a73e8] focus:bg-white"
            />
          </div>

          {projectName && (
            <div className="flex items-center justify-between">
              <span className="text-[#888]">Project</span>
              <span className="font-medium text-[#1a73e8]">
                {projectName}
              </span>
            </div>
          )}
          {clientName && (
            <div className="flex items-center justify-between">
              <span className="text-[#888]">Client</span>
              <span className="font-medium text-[#1a73e8]">
                {clientName}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#888]">
          Description
        </h3>
        <textarea
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-[#1a73e8]"
          placeholder="Add a description..."
        />
      </div>

      {/* Metadata + Delete */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[#aaa]">
          Created{" "}
          {task.createdAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-[#c0392b] transition-colors hover:bg-[#fde8e8] disabled:opacity-50"
        >
          <Trash2 size={13} strokeWidth={1.5} />
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
