import { TasksBoardLoader } from "@/components/tasks/tasks-board-loader";
import { getTasks, getUsers, getProjects, getPipelineEngagements } from "@/lib/queries";
import { type Task } from "@/lib/mock-tasks";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; projectId?: string }>;
}) {
  const params = await searchParams;
  const [dbTasks, dbUsers, dbProjects, dbEngagements] = await Promise.all([
    getTasks(),
    getUsers(),
    getProjects(),
    getPipelineEngagements(),
  ]);

  // Build name -> id mapping for server action calls
  const userNameToId: Record<string, string> = {};
  for (const u of dbUsers) {
    userNameToId[u.name] = u.id;
  }

  const projectsList = dbProjects.map((p) => ({ id: p.id, name: p.name, client: p.client }));
  const clientsList = dbEngagements.map((e) => ({
    id: e.id,
    name: e.companyName ? `${e.companyName} — ${e.name}` : e.name,
  }));

  type AssigneeName = "Nick" | "Alex";
  const validNames = new Set<string>(["Nick", "Alex"]);

  const initialTasks: Task[] = dbTasks.map((t) => {
    const assignees = t.assigneeNames
      .filter((name): name is AssigneeName => validNames.has(name));

    return {
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      status: t.status as Task["status"],
      priority: t.priority as Task["priority"],
      assignees,
      dueDate: t.dueDate ?? new Date().toISOString().split("T")[0],
      projectId: t.projectId ?? null,
      engagementId: t.engagementId ?? null,
      createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
    };
  });

  return (
    <TasksBoardLoader
      initialTasks={initialTasks}
      userNameToId={userNameToId}
      projects={projectsList}
      clients={clientsList}
      autoOpenAdd={params.add === "true"}
      defaultProjectId={params.projectId}
    />
  );
}
