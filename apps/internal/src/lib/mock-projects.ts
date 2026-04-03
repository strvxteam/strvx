const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

export type ProjectStatus = "scoping" | "active" | "paused" | "completed" | "cancelled";

export interface TimeEntry {
  id: string;
  date: string;
  person: string;
  hours: number;
  description: string;
  taskId: string | null;
}

export interface TimelineEntry {
  id: string;
  type: "note" | "email" | "meeting" | "task" | "invoice" | "system";
  title: string;
  description: string | null;
  date: Date;
  person: string | null;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  status: ProjectStatus;
  team: string[];
  startDate: string;
  endDate: string | null;
  updatedAt: Date;
  description: string;
  timeEntries: TimeEntry[];
  timeline: TimelineEntry[];
}

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  scoping: "bg-[#f3e5f5] text-[#8e24aa]",
  active: "bg-[#e8f5e9] text-[#27ae60]",
  paused: "bg-[#fef3e2] text-[#e67e22]",
  completed: "bg-[#e8f0fe] text-[#1a73e8]",
  cancelled: "bg-[#fde8e8] text-[#c0392b]",
};

export const ALL_STATUSES: ProjectStatus[] = [
  "scoping",
  "active",
  "paused",
  "completed",
  "cancelled",
];

export const mockProjects: Project[] = [
  {
    id: "proj-1",
    name: "AI Workflow Dashboard",
    client: "The Stability Group",
    status: "active",
    team: ["Nick", "Alex", "Hari"],
    startDate: daysAgo(60).toISOString().split("T")[0],
    endDate: daysFromNow(30).toISOString().split("T")[0],
    updatedAt: daysAgo(1),
    description: "Full-stack AI-powered workflow dashboard with real-time collaboration, automated task routing, and analytics.",
    timeEntries: [
      { id: "te-1", date: daysAgo(1).toISOString().split("T")[0], person: "Nick", hours: 3, description: "Sprint 3 review meeting & notes", taskId: null },
      { id: "te-2", date: daysAgo(2).toISOString().split("T")[0], person: "Alex", hours: 6, description: "Dashboard responsive layout", taskId: "task-1" },
      { id: "te-3", date: daysAgo(3).toISOString().split("T")[0], person: "Hari", hours: 4, description: "AI routing bug fixes", taskId: "task-4" },
      { id: "te-4", date: daysAgo(4).toISOString().split("T")[0], person: "Nick", hours: 2, description: "Client feedback review", taskId: null },
      { id: "te-5", date: daysAgo(5).toISOString().split("T")[0], person: "Alex", hours: 5, description: "Onboarding flow revisions", taskId: null },
      { id: "te-6", date: daysAgo(7).toISOString().split("T")[0], person: "Hari", hours: 7, description: "Real-time update system", taskId: null },
    ],
    timeline: [
      { id: "tl-1", type: "system", title: "Project created", description: null, date: daysAgo(60), person: "Nick" },
      { id: "tl-2", type: "email", title: "Sent proposal to client", description: "Full SOW with timeline and budget breakdown", date: daysAgo(58), person: "Nick" },
      { id: "tl-3", type: "meeting", title: "Kickoff call", description: "Discussed MVP scope, timeline, and priorities", date: daysAgo(55), person: "Nick" },
      { id: "tl-4", type: "task", title: "User auth & onboarding completed", description: null, date: daysAgo(40), person: "Alex" },
      { id: "tl-5", type: "meeting", title: "MVP v1 demo", description: "Presented dashboard with real-time updates", date: daysAgo(30), person: "Nick" },
      { id: "tl-6", type: "invoice", title: "Invoice #1042 sent — $6,000", description: "50% milestone payment", date: daysAgo(28), person: null },
      { id: "tl-7", type: "invoice", title: "Invoice #1042 paid", description: null, date: daysAgo(25), person: null },
      { id: "tl-8", type: "task", title: "AI task routing engine completed", description: null, date: daysAgo(15), person: "Hari" },
      { id: "tl-9", type: "meeting", title: "MVP v2 review", description: "Client approved routing engine, requested mobile layout", date: daysAgo(9), person: "Nick" },
      { id: "tl-10", type: "note", title: "Client wants to add CSV export", description: "Non-blocking — will scope for final delivery", date: daysAgo(5), person: "Nick" },
      { id: "tl-11", type: "email", title: "Sent responsive design mockups", description: "3 layout options for mobile breakpoints", date: daysAgo(2), person: "Alex" },
    ],
  },
  {
    id: "proj-2",
    name: "Dr. Bob Speaker Website",
    client: "Dr. Bob Nelson",
    status: "scoping",
    team: ["Nick", "Alex"],
    startDate: daysAgo(14).toISOString().split("T")[0],
    endDate: daysFromNow(45).toISOString().split("T")[0],
    updatedAt: daysAgo(3),
    description: "Professional speaker website with booking system, testimonials, media kit, and blog.",
    timeEntries: [
      { id: "te-10", date: daysAgo(3).toISOString().split("T")[0], person: "Nick", hours: 2, description: "Discovery notes & scope", taskId: null },
      { id: "te-11", date: daysAgo(5).toISOString().split("T")[0], person: "Alex", hours: 4, description: "Brand mood board & wireframes", taskId: null },
    ],
    timeline: [
      { id: "tl-20", type: "system", title: "Project created", description: null, date: daysAgo(14), person: "Nick" },
      { id: "tl-21", type: "email", title: "Initial outreach from Dr. Bob", description: "Interested in full website redesign + booking system", date: daysAgo(14), person: null },
      { id: "tl-22", type: "meeting", title: "Discovery call", description: "Discussed speaking topics, audience, brand direction", date: daysAgo(10), person: "Nick" },
      { id: "tl-23", type: "note", title: "Brand mood board shared", description: "Alex created 3 direction options", date: daysAgo(5), person: "Alex" },
    ],
  },
  {
    id: "proj-3",
    name: "Summit E-Commerce Platform",
    client: "Summit Retail",
    status: "active",
    team: ["Nick", "Hari"],
    startDate: daysAgo(90).toISOString().split("T")[0],
    endDate: daysFromNow(10).toISOString().split("T")[0],
    updatedAt: daysAgo(2),
    description: "Full e-commerce platform with product catalog, shopping cart, Stripe payments, and order management.",
    timeEntries: [
      { id: "te-20", date: daysAgo(2).toISOString().split("T")[0], person: "Hari", hours: 5, description: "Payment webhook debugging", taskId: null },
      { id: "te-21", date: daysAgo(3).toISOString().split("T")[0], person: "Nick", hours: 3, description: "Analytics dashboard setup", taskId: null },
      { id: "te-22", date: daysAgo(5).toISOString().split("T")[0], person: "Hari", hours: 6, description: "Cart calculation fix", taskId: null },
    ],
    timeline: [
      { id: "tl-30", type: "system", title: "Project created", description: null, date: daysAgo(90), person: "Nick" },
      { id: "tl-31", type: "meeting", title: "Kickoff & requirements gathering", description: null, date: daysAgo(88), person: "Nick" },
      { id: "tl-32", type: "task", title: "Product catalog & search completed", description: null, date: daysAgo(60), person: "Hari" },
      { id: "tl-33", type: "invoice", title: "Invoice #1038 sent — $12,500", description: "50% milestone payment", date: daysAgo(55), person: null },
      { id: "tl-34", type: "invoice", title: "Invoice #1038 paid", description: null, date: daysAgo(50), person: null },
      { id: "tl-35", type: "task", title: "Stripe payment integration completed", description: null, date: daysAgo(20), person: "Hari" },
      { id: "tl-36", type: "note", title: "QA round 1 complete — 3 bugs found", description: "Cart edge case, mobile layout, email template", date: daysAgo(5), person: "Nick" },
    ],
  },
  {
    id: "proj-4",
    name: "Meridian Labs Chatbot",
    client: "Meridian Labs",
    status: "scoping",
    team: ["Hari"],
    startDate: daysAgo(3).toISOString().split("T")[0],
    endDate: null,
    updatedAt: daysAgo(1),
    description: "AI chatbot for research portal that answers questions about papers and datasets using RAG.",
    timeEntries: [
      { id: "te-30", date: daysAgo(1).toISOString().split("T")[0], person: "Hari", hours: 3, description: "Framework research & comparison", taskId: null },
    ],
    timeline: [
      { id: "tl-40", type: "system", title: "Project created", description: null, date: daysAgo(3), person: "Hari" },
      { id: "tl-41", type: "email", title: "Sarah Chen intro email", description: "Interested in RAG-based chatbot for research portal", date: daysAgo(5), person: null },
      { id: "tl-42", type: "note", title: "Framework research started", description: "Comparing LangChain, LlamaIndex, and custom RAG pipeline", date: daysAgo(1), person: "Hari" },
    ],
  },
  {
    id: "proj-5",
    name: "Apex Client Portal",
    client: "Apex Financial",
    status: "paused",
    team: ["Nick", "Alex"],
    startDate: daysAgo(45).toISOString().split("T")[0],
    endDate: daysFromNow(60).toISOString().split("T")[0],
    updatedAt: daysAgo(15),
    description: "Client-facing financial portal with account overview, document sharing, and secure messaging.",
    timeEntries: [
      { id: "te-40", date: daysAgo(15).toISOString().split("T")[0], person: "Nick", hours: 4, description: "Phase 1 delivery & handoff", taskId: null },
      { id: "te-41", date: daysAgo(20).toISOString().split("T")[0], person: "Alex", hours: 6, description: "Dashboard UI implementation", taskId: null },
    ],
    timeline: [
      { id: "tl-50", type: "system", title: "Project created", description: null, date: daysAgo(45), person: "Nick" },
      { id: "tl-51", type: "meeting", title: "Requirements review", description: null, date: daysAgo(43), person: "Nick" },
      { id: "tl-52", type: "task", title: "Auth & dashboard completed", description: null, date: daysAgo(20), person: "Alex" },
      { id: "tl-53", type: "note", title: "Project paused", description: "Client requested pause — internal restructuring. Resume TBD.", date: daysAgo(15), person: "Nick" },
    ],
  },
];
