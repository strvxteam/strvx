import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  type Task,
  TASK_STATUS_LABELS,
  PRIORITY_COLORS,
} from "@/lib/mock-tasks";
import { TaskDetailClient } from "./task-detail-client";
import { getTask, getProject, getEngagement, getUsers } from "@/lib/queries";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dbTask = await getTask(id);
  if (!dbTask) return notFound();

  // Resolve human-readable names and user mapping in parallel
  const [project, engagement, dbUsers] = await Promise.all([
    dbTask.projectId ? getProject(dbTask.projectId) : null,
    dbTask.engagementId ? getEngagement(dbTask.engagementId) : null,
    getUsers(),
  ]);

  const projectName = project
    ? project.client
      ? `${project.client} — ${project.name}`
      : project.name
    : null;

  const clientName = engagement
    ? engagement.companyName
      ? `${engagement.companyName} — ${engagement.name}`
      : engagement.name
    : null;

  const userNameToId: Record<string, string> = {};
  for (const u of dbUsers) {
    userNameToId[u.name] = u.id;
  }

  type AssigneeName = "Nick" | "Alex";
  const validNames = new Set<string>(["Nick", "Alex"]);
  const assignees = dbTask.assigneeNames
    .filter((name): name is AssigneeName => validNames.has(name));

  const task: Task = {
    id: dbTask.id,
    title: dbTask.title,
    description: dbTask.description ?? "",
    status: dbTask.status as Task["status"],
    priority: dbTask.priority as Task["priority"],
    assignees,
    dueDate: dbTask.dueDate ?? new Date().toISOString().split("T")[0],
    projectId: dbTask.projectId ?? null,
    engagementId: dbTask.engagementId ?? null,
    createdAt: dbTask.createdAt ? new Date(dbTask.createdAt) : new Date(),
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back link */}
      <Link
        href="/tasks"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#888] transition-colors hover:text-[#555]"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Tasks
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${PRIORITY_COLORS[task.priority]}`}
          >
            {task.priority}
          </span>
          <span className="rounded bg-[#f0f0f0] px-2 py-0.5 text-[11px] text-[#555]">
            {TASK_STATUS_LABELS[task.status]}
          </span>
        </div>
        <h1 className="text-xl font-semibold">{task.title}</h1>
      </div>

      <TaskDetailClient
        task={task}
        projectName={projectName}
        clientName={clientName}
        userNameToId={userNameToId}
      />
    </div>
  );
}
