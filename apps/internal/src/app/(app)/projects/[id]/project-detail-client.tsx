"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderOpen,
  Mail,
  CalendarPlus,
  Columns3,
  Plus,
  CheckCircle2,
  Circle,
  AlertTriangle,
  MessageSquare,
  Receipt,
  Settings,
  X,
} from "lucide-react";
import {
  PROJECT_STATUS_COLORS,
  type ProjectStatus,
} from "@/lib/mock-projects";
import { COLUMN_COLORS, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/mock-tasks";
import { EVENT_TYPE_COLORS, type EventType } from "@/lib/mock-calendar";
import { formatHour } from "@/lib/calendar-utils";
import { updateTask, createTask, addProjectTimelineEntry } from "@/app/actions";
import { toast } from "sonner";

interface SerializedTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignees: string[];
  dueDate: string;
  projectId: string | null;
  createdAt: string;
}

interface SerializedEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  startHour: number;
  durationHours: number;
  client: string | null;
  zoomLink: string | null;
  projectId: string | null;
}

interface SerializedProject {
  id: string;
  name: string;
  client: string;
  status: string;
  team: string[];
  startDate: string;
  endDate: string | null;
  updatedAt: string;
  description: string;
}

const TIMELINE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  note: { icon: MessageSquare, color: "text-[#888]" },
  email: { icon: Mail, color: "text-[#1a73e8]" },
  meeting: { icon: CalendarPlus, color: "text-[#8e24aa]" },
  task: { icon: CheckCircle2, color: "text-[#27ae60]" },
  invoice: { icon: Receipt, color: "text-[#e67e22]" },
  system: { icon: Settings, color: "text-[#ccc]" },
};

interface SerializedTimelineEntry {
  id: string;
  type: string;
  title: string;
  description: string | null;
  date: string;
  person: string | null;
}

export default function ProjectDetailPage({
  initialProject,
  initialTasks,
  initialEvents,
  initialTimeline = [],
}: {
  initialProject: SerializedProject | null;
  initialTasks: SerializedTask[];
  initialEvents: SerializedEvent[];
  initialTimeline?: SerializedTimelineEntry[];
}) {
  if (!initialProject) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-[#888]">Project not found</p>
      </div>
    );
  }

  return (
    <ProjectWorkspace
      project={initialProject}
      initialTasks={initialTasks}
      initialEvents={initialEvents}
      initialTimeline={initialTimeline}
    />
  );
}

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  todo: 1,
  blocked: 2,
  done: 3,
};

function ProjectWorkspace({
  project,
  initialTasks,
  initialEvents,
  initialTimeline = [],
}: {
  project: SerializedProject;
  initialTasks: SerializedTask[];
  initialEvents: SerializedEvent[];
  initialTimeline?: SerializedTimelineEntry[];
}) {
  const [timeline, setTimeline] = useState<
    { id: string; type: string; title: string; description: string | null; date: Date; person: string | null }[]
  >(() =>
    initialTimeline.map((t) => ({
      ...t,
      date: new Date(t.date),
    }))
  );
  const [tasks, setTasks] = useState(() =>
    [...initialTasks].sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    )
  );
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const projectEvents = useMemo(
    () =>
      [...initialEvents].sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        return dateCmp !== 0 ? dateCmp : a.startHour - b.startHour;
      }),
    [initialEvents]
  );

  const projectStatus = project.status as ProjectStatus;

  function addTimelineNote(title: string, description: string | null) {
    const tempId = `tl-${Date.now()}`;
    const content = description ? `${title}\n${description}` : title;

    // Optimistic update
    setTimeline((prev) => [
      ...prev,
      {
        id: tempId,
        type: "note" as const,
        title,
        description,
        date: new Date(),
        person: "Team",
      },
    ]);

    // Persist to DB
    startTransition(async () => {
      try {
        const result = await addProjectTimelineEntry(project.id, content);
        // Replace temp ID with real DB ID
        setTimeline((prev) =>
          prev.map((entry) =>
            entry.id === tempId ? { ...entry, id: result.id } : entry,
          ),
        );
        toast.success("Update added");
      } catch (err) {
        console.error("Failed to save timeline entry:", err);
        // Revert optimistic update
        setTimeline((prev) => prev.filter((entry) => entry.id !== tempId));
        toast.error("Failed to save update");
      }
    });
  }

  function handleToggleTask(taskId: string) {
    setTasks((prev) =>
      prev
        .map((t) =>
          t.id === taskId
            ? { ...t, status: t.status === "done" ? "todo" : "done" }
            : t
        )
        .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
    );

    // Persist to DB
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const newStatus = task.status === "done" ? "todo" : "done";
      startTransition(async () => {
        try {
          await updateTask(taskId, { status: newStatus });
          toast.success(newStatus === "done" ? "Task completed" : "Task reopened");
        } catch (err) {
          console.error(err);
          toast.error("Failed to update task");
          // Revert on error
          setTasks(
            [...initialTasks].sort(
              (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
            )
          );
        }
      });
    }
  }

  function handleAddTask() {
    if (!newTaskTitle.trim()) return;
    const tempId = `task-${Date.now()}`;
    const newTask: SerializedTask = {
      id: tempId,
      title: newTaskTitle.trim(),
      description: "",
      status: "todo",
      priority: "normal",
      assignees: [],
      dueDate: new Date().toISOString().split("T")[0],
      projectId: project.id,
      createdAt: new Date().toISOString(),
    };

    setTasks((prev) =>
      [newTask, ...prev].sort(
        (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      )
    );
    setNewTaskTitle("");
    setShowAddTask(false);

    // Persist to DB
    startTransition(async () => {
      try {
        const created = await createTask({
          title: newTask.title,
          status: "todo",
          priority: "normal",
          projectId: project.id,
          dueDate: newTask.dueDate,
        });
        setTasks((prev) =>
          prev.map((t) => (t.id === tempId ? { ...t, id: created.id } : t))
        );
        toast.success("Task added");
      } catch (err) {
        console.error(err);
        toast.error("Failed to add task");
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
      }
    });
  }

  return (
    <div className="pb-12">
      {/* Back */}
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#888] transition-colors hover:text-[#555]"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Projects
      </Link>

      {/* Header */}
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111]">{project.name}</h1>
          <p className="mt-0.5 text-[13px] text-[#888]">{project.client}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize ${PROJECT_STATUS_COLORS[projectStatus] ?? "bg-[#f0f0f0] text-[#555]"}`}
        >
          {project.status}
        </span>
      </div>

      {/* Meta */}
      <div className="mb-5 flex items-center gap-4 text-[12px] text-[#888]">
        <span>Team: {project.team.join(", ") || "None"}</span>
        <span className="text-[#ddd]">|</span>
        <span>
          {new Date(project.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {project.endDate && ` — ${new Date(project.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
        </span>
      </div>

      {project.description && (
        <p className="mb-6 max-w-2xl text-[13px] leading-relaxed text-[#666]">
          {project.description}
        </p>
      )}

      {/* Quick Actions */}
      <div className="mb-8 flex gap-2">
        <Link
          href="/assets"
          className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] bg-white px-3 py-2 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
        >
          <FolderOpen size={14} strokeWidth={1.5} />
          View Folder
        </Link>
        <a
          href={`mailto:?subject=${encodeURIComponent(project.name)}`}
          className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] bg-white px-3 py-2 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
        >
          <Mail size={14} strokeWidth={1.5} />
          Email Client
        </a>
        <Link
          href="/calendar"
          className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] bg-white px-3 py-2 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
        >
          <CalendarPlus size={14} strokeWidth={1.5} />
          Schedule Meeting
        </Link>
        <Link
          href="/clients"
          className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] bg-white px-3 py-2 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
        >
          <Columns3 size={14} strokeWidth={1.5} />
          View Pipeline
        </Link>
      </div>

      {/* Tasks */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-semibold text-[#222]">Tasks</h2>
            <Link
              href={`/tasks?add=true&projectId=${project.id}`}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <Plus size={12} />
              Add
            </Link>
          </div>
          <span className="text-[12px] text-[#aaa]">
            {tasks.filter((t) => t.status === "done").length}/{tasks.length} done
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e0e0e0] py-8 text-center text-[13px] text-[#aaa]">
            No tasks linked to this project
          </div>
        ) : (
          <div className="rounded-lg border border-[#e0e0e0] bg-white">
            {tasks.map((task, idx) => (
              <div
                key={task.id}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#fafafa] ${
                  idx < tasks.length - 1 ? "border-b border-[#f5f5f5]" : ""
                }`}
              >
                <button
                  onClick={() => handleToggleTask(task.id)}
                  className="shrink-0"
                  disabled={isPending}
                >
                  {task.status === "done" ? (
                    <CheckCircle2 size={15} strokeWidth={2} className="text-[#27ae60]" />
                  ) : task.status === "blocked" ? (
                    <AlertTriangle size={15} strokeWidth={2} className="text-[#c0392b]" />
                  ) : (
                    <Circle size={15} strokeWidth={1.5} className="text-[#ccc] hover:text-[#27ae60]" />
                  )}
                </button>
                <span
                  className={`flex-1 text-[13px] ${
                    task.status === "done"
                      ? "text-[#aaa] line-through"
                      : "font-medium text-[#222]"
                  }`}
                >
                  {task.title}
                </span>
                <span
                  className="rounded px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: COLUMN_COLORS[task.status as TaskStatus] ?? "#888" }}
                >
                  {TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status}
                </span>
                <span className="text-[11px] text-[#aaa]">{task.assignees.join(", ")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#222]">Upcoming</h2>
          <span className="text-[12px] text-[#aaa]">{projectEvents.length} events</span>
        </div>
        {projectEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e0e0e0] py-8 text-center text-[13px] text-[#aaa]">
            No upcoming meetings or deadlines
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {projectEvents.map((evt) => {
              const evtType = evt.type as EventType;
              const colors = EVENT_TYPE_COLORS[evtType] ?? EVENT_TYPE_COLORS.internal;
              const [y, m, d] = evt.date.split("-").map(Number);
              const evtDate = new Date(y, m - 1, d);
              return (
                <Link
                  key={evt.id}
                  href="/calendar"
                  className={`flex items-center gap-3 rounded-lg border-l-2 ${colors.border} ${colors.bg} px-4 py-2.5 transition-all hover:brightness-95`}
                >
                  <div className="flex-1">
                    <p className={`text-[13px] font-medium ${colors.text}`}>
                      {evt.title}
                    </p>
                    <p className="text-[11px] text-[#888]">
                      {evtDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      at {formatHour(evt.startHour)} –{" "}
                      {formatHour(evt.startHour + evt.durationHours)}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${colors.bg} ${colors.text}`}
                  >
                    {evt.type.replace("_", " ")}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Timeline */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#222]">Timeline</h2>
          <AddUpdateButton onAdd={addTimelineNote} />
        </div>

        {timeline.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e0e0e0] py-8 text-center text-[13px] text-[#aaa]">
            No timeline entries yet
          </div>
        ) : (
          <div className="relative ml-3 border-l-2 border-[#f0f0f0] pl-6">
            {[...timeline]
              .sort((a, b) => b.date.getTime() - a.date.getTime())
              .map((entry) => {
                const { icon: Icon, color } =
                  TIMELINE_ICONS[entry.type] ?? TIMELINE_ICONS.note;
                return (
                  <div key={entry.id} className="relative mb-4 last:mb-0">
                    <div className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#f0f0f0] bg-white">
                      <Icon size={11} strokeWidth={2} className={color} />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#222]">
                        {entry.title}
                      </p>
                      {entry.description && (
                        <p className="mt-0.5 text-[12px] text-[#888]">
                          {entry.description}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-[#bbb]">
                        {entry.date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {entry.person && ` · ${entry.person}`}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}

function AddUpdateButton({
  onAdd,
}: {
  onAdd: (title: string, description: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit() {
    if (!title.trim()) return;
    onAdd(title.trim(), description.trim() || null);
    setTitle("");
    setDescription("");
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
      >
        <Plus size={14} strokeWidth={2} />
        Add Update
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#f0f0f0] px-6 py-4">
              <h3 className="text-[15px] font-bold text-[#111]">Add Update</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[#aaa] transition-colors hover:bg-[#f5f5f5] hover:text-[#555]"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="px-6 py-5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mb-3 w-full rounded-lg border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:bg-white"
                placeholder="What happened?"
                autoFocus
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-none rounded-lg border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:bg-white"
                placeholder="Details (optional)"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-[#f0f0f0] px-6 py-4">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#777] hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!title.trim()}
                className="rounded-lg bg-[#111] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#333] disabled:opacity-30"
              >
                Add Update
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
