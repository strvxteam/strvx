const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: ("Nick" | "Alex" | "Hari")[];
  dueDate: string;
  projectId: string | null;
  engagementId: string | null;
  /** @deprecated Use projectId/engagementId instead */
  linkedEntity?: { type: "deal" | "project"; id: string; name: string } | null;
  createdAt: Date;
}

export const mockTasks: Task[] = [
  {
    id: "task-1",
    title: "Follow up on MVP v2 feedback",
    description: "Jesse wants mobile-first dashboard. Get feedback on latest prototype.",
    status: "todo",
    priority: "urgent",
    assignees: ["Nick"],
    dueDate: daysFromNow(1).toISOString().split("T")[0],
    projectId: null, engagementId: "eng-1",
    createdAt: daysAgo(2),
  },
  {
    id: "task-2",
    title: "Design responsive layout for dashboard",
    description: "Create mobile and tablet breakpoints for main dashboard view.",
    status: "in_progress",
    priority: "high",
    assignees: ["Alex"],
    dueDate: daysFromNow(3).toISOString().split("T")[0],
    projectId: "proj-1", engagementId: null,
    createdAt: daysAgo(5),
  },
  {
    id: "task-3",
    title: "Set up CI/CD pipeline for staging",
    description: "Configure GitHub Actions for automatic deployment to staging environment.",
    status: "done",
    priority: "normal",
    assignees: ["Hari"],
    dueDate: daysAgo(3).toISOString().split("T")[0],
    projectId: "proj-1", engagementId: null,
    createdAt: daysAgo(10),
  },
  {
    id: "task-4",
    title: "Send revised proposal to Dr. Bob",
    description: "Include maintenance pricing and updated timeline.",
    status: "todo",
    priority: "urgent",
    assignees: ["Nick"],
    dueDate: daysFromNow(0).toISOString().split("T")[0],
    projectId: null, engagementId: "eng-2",
    createdAt: daysAgo(1),
  },
  {
    id: "task-5",
    title: "Research chatbot frameworks",
    description: "Compare LangChain, Vercel AI SDK, and custom RAG solutions for Meridian Labs.",
    status: "in_progress",
    priority: "high",
    assignees: ["Hari"],
    dueDate: daysFromNow(4).toISOString().split("T")[0],
    projectId: null, engagementId: "eng-3",
    createdAt: daysAgo(2),
  },
  {
    id: "task-6",
    title: "Add CSV export feature",
    description: "Implement CSV export for reporting module per client request.",
    status: "blocked",
    priority: "normal",
    assignees: ["Alex"],
    dueDate: daysFromNow(7).toISOString().split("T")[0],
    projectId: "proj-1", engagementId: null,
    createdAt: daysAgo(8),
  },
  {
    id: "task-7",
    title: "Review Summit Retail analytics setup",
    description: "Verify tracking pixels and conversion events are firing correctly.",
    status: "todo",
    priority: "normal",
    assignees: ["Nick"],
    dueDate: daysFromNow(5).toISOString().split("T")[0],
    projectId: "proj-3", engagementId: null,
    createdAt: daysAgo(3),
  },
  {
    id: "task-8",
    title: "Write API documentation",
    description: "Document all REST endpoints for the workflow API.",
    status: "in_progress",
    priority: "low",
    assignees: ["Hari"],
    dueDate: daysFromNow(10).toISOString().split("T")[0],
    projectId: "proj-1", engagementId: null,
    createdAt: daysAgo(6),
  },
  {
    id: "task-9",
    title: "Client onboarding flow wireframes",
    description: "Create wireframes for the new onboarding experience.",
    status: "done",
    priority: "high",
    assignees: ["Alex"],
    dueDate: daysAgo(1).toISOString().split("T")[0],
    projectId: "proj-1", engagementId: null,
    createdAt: daysAgo(7),
  },
  {
    id: "task-10",
    title: "Prepare demo for Apex Financial",
    description: "Build interactive demo of the client portal for David Kim.",
    status: "todo",
    priority: "high",
    assignees: ["Nick"],
    dueDate: daysFromNow(2).toISOString().split("T")[0],
    projectId: null, engagementId: "eng-6",
    createdAt: daysAgo(4),
  },
  {
    id: "task-11",
    title: "Fix payment webhook handler",
    description: "Stripe webhooks timing out intermittently. Investigate and fix.",
    status: "blocked",
    priority: "urgent",
    assignees: ["Hari"],
    dueDate: daysFromNow(1).toISOString().split("T")[0],
    projectId: "proj-3", engagementId: null,
    createdAt: daysAgo(1),
  },
  {
    id: "task-12",
    title: "Update brand assets for speaker site",
    description: "New headshots and media kit assets from Dr. Bob.",
    status: "todo",
    priority: "low",
    assignees: ["Alex"],
    dueDate: daysFromNow(6).toISOString().split("T")[0],
    projectId: "proj-2", engagementId: null,
    createdAt: daysAgo(2),
  },
  {
    id: "task-13",
    title: "Deploy e-commerce hotfix",
    description: "Fix cart total calculation bug reported by Summit Retail.",
    status: "done",
    priority: "urgent",
    assignees: ["Hari"],
    dueDate: daysAgo(2).toISOString().split("T")[0],
    projectId: "proj-3", engagementId: null,
    createdAt: daysAgo(3),
  },
  {
    id: "task-14",
    title: "Scope Harbor Freight requirements",
    description: "Draft technical requirements doc for inventory management system.",
    status: "in_progress",
    priority: "normal",
    assignees: ["Nick"],
    dueDate: daysFromNow(5).toISOString().split("T")[0],
    projectId: null, engagementId: "eng-4",
    createdAt: daysAgo(1),
  },
  {
    id: "task-15",
    title: "Set up monitoring for AI dashboard",
    description: "Configure error tracking and performance monitoring with Sentry.",
    status: "done",
    priority: "normal",
    assignees: ["Alex"],
    dueDate: daysAgo(4).toISOString().split("T")[0],
    projectId: "proj-1", engagementId: null,
    createdAt: daysAgo(12),
  },
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

export const TASK_STATUS_COLUMNS: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "bg-[#fde8e8] text-[#c0392b]",
  high: "bg-[#fff3e0] text-[#e65100]",
  normal: "bg-[#e8f0fe] text-[#1a73e8]",
  low: "bg-[#f0f0f0] text-[#555]",
};

export const PRIORITY_BORDER_COLORS: Record<TaskPriority, string> = {
  urgent: "border-l-[#e74c3c]",
  high: "border-l-[#f39c12]",
  normal: "border-l-[#1a73e8]",
  low: "border-l-[#ccc]",
};

export const COLUMN_COLORS: Record<TaskStatus, string> = {
  todo: "#888",
  in_progress: "#1a73e8",
  blocked: "#e74c3c",
  done: "#27ae60",
};

export const ASSIGNEES = ["Nick", "Alex", "Hari"] as const;

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function isOverdue(dateString: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateString + "T00:00:00");
  return date < today;
}

export function formatRelativeDate(dateString: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateString + "T00:00:00");
  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `In ${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
