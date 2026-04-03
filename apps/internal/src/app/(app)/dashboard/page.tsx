import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Target,
} from "lucide-react";
import { EVENT_TYPE_COLORS } from "@/lib/mock-calendar";
import { formatHour } from "@/lib/calendar-utils";
import {
  getRecentActivity,
  getAtRiskItems,
  getPipelineEngagements,
  getCalendarEvents,
  getInvoices,
  getTasks,
  getUsers,
  getCurrentUserForPage,
} from "@/lib/queries";
import { QuickAddBar } from "@/components/quick-add-bar";
import { TeamStatus } from "./team-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard" };

const TEAM_AVATARS: Record<string, string> = {
  Nick: "/avatars/nick.png",
  Hari: "/avatars/hari.png",
  Alex: "/avatars/alex.png",
};

const STAGE_COLORS: Record<string, string> = {
  discovery: "bg-[#e8f0fe] text-[#1a73e8]",
  building_mvp: "bg-[#fef3e2] text-[#e67e22]",
  proposal: "bg-[#f3e5f5] text-[#8e24aa]",
  build: "bg-[#e8f5e9] text-[#27ae60]",
  deliver: "bg-[#e0f2f1] text-[#00897b]",
  maintain: "bg-[#e3f2fd] text-[#1565c0]",
};

type AtRiskItem = {
  id: string;
  description: string;
  dueDate: string | null;
  ownerId: string;
  engagementId: string;
  engagementName: string;
  companyName: string;
};

type ActivityItem = {
  id: string;
  type: string;
  content: string;
  createdAt: Date;
  authorName: string;
  engagementName: string;
  companyName: string;
  engagementId: string;
};

export default async function DashboardPage() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const activeStages = new Set([
    "discovery",
    "building_mvp",
    "proposal",
    "build",
    "deliver",
    "maintain",
  ]);

  const [recentActivityRaw, atRisk, engData, dbCalEvents, dbInvoices, dbTasks, dbUsers, currentUser] =
    await Promise.all([
      getRecentActivity(),
      getAtRiskItems(),
      getPipelineEngagements(),
      getCalendarEvents(),
      getInvoices(),
      getTasks(),
      getUsers(),
      getCurrentUserForPage(),
    ]);

  const recentActivity = recentActivityRaw as ActivityItem[];

  const allEngagements = engData.map((e) => ({
    id: e.id,
    name: e.name,
    companyName: e.companyName,
  }));

  const overdueItems = atRisk.overdueActions as AtRiskItem[];

  const activeEngagements = engData
    .filter((e) => activeStages.has(e.stage))
    .map((e) => ({
      id: e.id,
      name: e.name,
      companyName: e.companyName,
      stage: e.stage,
    }));

  const todayEvents = dbCalEvents
    .filter((e) => e.date === todayStr)
    .map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type as "client_call" | "internal" | "deadline",
      startHour: Number(e.startHour),
      durationHours: Number(e.durationHours),
      client: e.client,
    }))
    .sort((a, b) => a.startHour - b.startHour);

  const urgentTasks = dbTasks
    .filter(
      (t) =>
        t.status !== "done" &&
        (t.status === "blocked" || t.priority === "urgent")
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignees: t.assigneeNames as string[],
    }));

  // Goal progress
  const totalRevenue = dbInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((s, inv) => s + Number(inv.amount), 0);
  const goalMilestones = [
    { target: 25_000, label: "Team Dinner" },
    { target: 50_000, label: "New Gear" },
    { target: 100_000, label: "Miami + LARP" },
    { target: 200_000, label: "Team Retreat" },
    { target: 500_000, label: "The Big One" },
  ];
  const nextGoal =
    goalMilestones.find((g) => totalRevenue < g.target) ??
    goalMilestones[goalMilestones.length - 1];
  const goalPct = Math.min(
    Math.round((totalRevenue / nextGoal.target) * 100),
    100
  );

  const hasAttention = overdueItems.length > 0 || urgentTasks.length > 0;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#111]">
          {greeting}, team
        </h1>
        <span className="text-[13px] text-[#999]">
          {now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>

      {/* Attention items — only shown when there's something */}
      {hasAttention && (
        <section className="mb-6">
          <div className="rounded-lg border border-[#f0e0e0] bg-[#fffbfb]">
            {overdueItems.map((item) => (
              <Link
                key={item.id}
                href={`/clients/${item.engagementId}`}
                className="flex items-center gap-3 border-b border-[#f5e8e8] px-4 py-3 transition-colors last:border-b-0 hover:bg-[#fff5f5]"
              >
                <AlertTriangle size={14} className="shrink-0 text-[#c0392b]" />
                <div className="min-w-0 flex-1 text-[13px]">
                  <strong className="text-[#222]">{item.companyName}</strong>
                  <span className="ml-1.5 text-[#888]">
                    — {item.description}
                  </span>
                </div>
                {item.dueDate && (
                  <span className="text-[11px] text-[#c0392b]">
                    {new Date(item.dueDate + "T00:00:00").toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" }
                    )}
                  </span>
                )}
              </Link>
            ))}
            {urgentTasks.map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex items-center gap-3 border-b border-[#f5e8e8] px-4 py-3 transition-colors last:border-b-0 hover:bg-[#fff5f5]"
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    task.status === "blocked"
                      ? "bg-[#fde8e8] text-[#c0392b]"
                      : "bg-[#fff3e0] text-[#e65100]"
                  }`}
                >
                  {task.status === "blocked" ? "Blocked" : "Urgent"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#222]">
                  {task.title}
                </span>
                <div className="flex -space-x-1">
                  {task.assignees.map((name) =>
                    TEAM_AVATARS[name] ? (
                      <img
                        key={name}
                        src={TEAM_AVATARS[name]}
                        alt={name}
                        className="h-5 w-5 rounded-full border border-white object-cover"
                      />
                    ) : (
                      <div
                        key={name}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-[#e0e0e0] text-[9px] font-semibold text-[#666]"
                      >
                        {name[0]}
                      </div>
                    )
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Two-column: today + active work */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* Today */}
        <section className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#333]">Today</h2>
            <Link
              href="/calendar"
              className="rounded-md border border-[#e0e0e0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
            >
              Calendar
            </Link>
          </div>
          <div className="flex-1 rounded-lg border border-[#e0e0e0] bg-white">
            {todayEvents.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-[#bbb]">
                No meetings today
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {todayEvents.map((evt) => {
                  const colors = EVENT_TYPE_COLORS[evt.type];
                  return (
                    <div
                      key={evt.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span className="min-w-[44px] text-[12px] font-medium text-[#555]">
                        {formatHour(evt.startHour)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[#222]">
                          {evt.title}
                        </p>
                        {evt.client && (
                          <p className="text-[11px] text-[#888]">
                            {evt.client}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full ${colors.bg} px-2 py-0.5 text-[10px] font-medium ${colors.text}`}
                      >
                        {evt.type === "client_call"
                          ? "Client"
                          : evt.type === "internal"
                            ? "Internal"
                            : "Deadline"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Active clients */}
        <section className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#333]">
              Active clients
            </h2>
            <Link
              href="/pipeline"
              className="rounded-md border border-[#e0e0e0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
            >
              Pipeline
            </Link>
          </div>
          <div className="rounded-lg border border-[#e0e0e0] bg-white">
            {activeEngagements.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-[#bbb]">
                No active engagements
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {activeEngagements.map((eng) => (
                  <Link
                    key={eng.id}
                    href={`/clients/${eng.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#fafafa]"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-[#222]">
                        {eng.companyName}
                      </span>
                      <span className="ml-2 text-[12px] text-[#999]">
                        {eng.name}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STAGE_COLORS[eng.stage] ?? "bg-[#f0f0f0] text-[#555]"}`}
                    >
                      {eng.stage.replace("_", " ")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Recent activity */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#333]">
            Recent activity
          </h2>
          <Link
            href="/clients"
            className="rounded-md border border-[#e0e0e0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            All activity
          </Link>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white">
          {recentActivity.slice(0, 5).map((item) => (
            <Link
              key={item.id}
              href={`/clients/${item.engagementId}`}
              className="flex items-center gap-3 border-b border-[#f0f0f0] px-4 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-[#fafafa]"
            >
              {TEAM_AVATARS[item.authorName ?? ""] ? (
                <img
                  src={TEAM_AVATARS[item.authorName ?? ""]}
                  alt={item.authorName ?? ""}
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e0e0e0] text-[10px] font-semibold text-[#666]">
                  {item.authorName?.charAt(0)?.toUpperCase() || "?"}
                </div>
              )}
              <div className="min-w-0 flex-1 text-[#555]">
                <strong className="text-[#222]">{item.authorName}</strong>{" "}
                <span className="capitalize text-[#aaa]">
                  {item.type.replace("_", " ")}
                </span>{" "}
                on <strong className="text-[#222]">{item.companyName}</strong>
                {": "}
                <span className="text-[#666]">
                  {item.content.length > 60
                    ? item.content.slice(0, 60) + "..."
                    : item.content}
                </span>
              </div>
              <span className="shrink-0 text-[11px] text-[#ccc]">
                {new Date(item.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Goal progress — compact bar */}
      <Link
        href="/goals"
        className="mt-6 flex items-center gap-4 rounded-lg border border-[#e0e0e0] bg-white px-4 py-3 transition-colors hover:bg-[#fafafa]"
      >
        <Target size={16} className="shrink-0 text-[#8e24aa]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#8e24aa]">
              {nextGoal.label}
            </span>
            <span className="text-[11px] text-[#aaa]">
              ${(totalRevenue / 1000).toFixed(1)}k / $
              {(nextGoal.target / 1000).toFixed(0)}k
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#f0f0f0]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8e24aa] to-[#ce93d8]"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>
      </Link>

      {/* Team availability */}
      <TeamStatus
        members={dbUsers.map((u) => ({
          id: u.id,
          name: u.name,
          status: u.status,
        }))}
        currentUserId={currentUser?.id ?? null}
      />

      <QuickAddBar engagements={allEngagements} />
    </div>
  );
}
