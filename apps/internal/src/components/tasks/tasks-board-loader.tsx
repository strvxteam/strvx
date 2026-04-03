"use client";

import dynamic from "next/dynamic";
import type { Task } from "@/lib/mock-tasks";

const TasksBoard = dynamic(
  () =>
    import("@/components/tasks/tasks-board").then((m) => m.TasksBoard),
  { ssr: false }
);

export interface ProjectOption {
  id: string;
  name: string;
  client: string | null;
}

export interface ClientOption {
  id: string;
  name: string;
}

interface TasksBoardLoaderProps {
  initialTasks: Task[];
  userNameToId: Record<string, string>;
  projects: ProjectOption[];
  clients: ClientOption[];
  autoOpenAdd?: boolean;
  defaultProjectId?: string;
}

export function TasksBoardLoader({ initialTasks, userNameToId, projects, clients, autoOpenAdd, defaultProjectId }: TasksBoardLoaderProps) {
  return <TasksBoard initialTasks={initialTasks} userNameToId={userNameToId} projects={projects} clients={clients} autoOpenAdd={autoOpenAdd} defaultProjectId={defaultProjectId} />;
}
