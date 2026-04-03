import ProjectDetailPage from "./project-detail-client";
import { getProject, getTasks, getCalendarEvents, getAllEngagementTimelines, getPipelineEngagements } from "@/lib/queries";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Project Details" };

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

export interface SerializedTimelineEntry {
  id: string;
  type: string;
  title: string;
  description: string | null;
  date: string;
  person: string | null;
}

export default async function ProjectDetailServerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [dbProject, dbTasks, dbEvents, allTimelines, allEngagements] = await Promise.all([
    getProject(id),
    getTasks(),
    getCalendarEvents(),
    getAllEngagementTimelines(),
    getPipelineEngagements(),
  ]);

  let project: SerializedProject | null = null;
  let projectTasks: SerializedTask[] = [];
  let projectEvents: SerializedEvent[] = [];
  const projectTimeline: SerializedTimelineEntry[] = [];

  if (dbProject) {
    const clientName = dbProject.client ?? "";

    project = {
      id: dbProject.id,
      name: dbProject.name,
      client: clientName,
      status: dbProject.status ?? "scoping",
      team: (dbProject.team as string[]) ?? [],
      startDate: dbProject.startDate ?? new Date().toISOString().split("T")[0],
      endDate: dbProject.endDate ?? null,
      updatedAt: dbProject.createdAt
        ? new Date(dbProject.createdAt).toISOString()
        : new Date().toISOString(),
      description: dbProject.description ?? "",
    };

    projectTasks = dbTasks
      .filter((t) => t.projectId === id)
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? "",
        status: t.status,
        priority: t.priority,
        assignees: t.assigneeNames,
        dueDate: t.dueDate ?? new Date().toISOString().split("T")[0],
        projectId: t.projectId,
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
      }));

    // Match calendar events by projectId OR by client name
    const today = new Date().toISOString().split("T")[0];
    projectEvents = dbEvents
      .filter((e) => e.projectId === id || (clientName && e.client?.toLowerCase() === clientName.toLowerCase()))
      .filter((e) => e.date >= today)
      .map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        date: e.date,
        startHour: Number(e.startHour),
        durationHours: Number(e.durationHours),
        client: e.client,
        zoomLink: e.zoomLink,
        projectId: e.projectId,
      }));

    // Build timeline from interactions matching the project's client
    if (clientName) {
      const clientEngagementIds = allEngagements
        .filter((eng) => eng.companyName.toLowerCase() === clientName.toLowerCase())
        .map((eng) => eng.id);

      for (const engId of clientEngagementIds) {
        const entries = allTimelines[engId] ?? [];
        for (const entry of entries) {
          projectTimeline.push({
            id: entry.id,
            type: entry.type,
            title: entry.content,
            description: null,
            date: entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString(),
            person: entry.authorName,
          });
        }
      }
      // Sort newest first
      projectTimeline.sort((a, b) => b.date.localeCompare(a.date));
    }
  } else {
    return notFound();
  }

  return (
    <ProjectDetailPage
      initialProject={project}
      initialTasks={projectTasks}
      initialEvents={projectEvents}
      initialTimeline={projectTimeline}
    />
  );
}
