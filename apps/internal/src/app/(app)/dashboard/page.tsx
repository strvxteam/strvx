import type { Metadata } from "next";
import Link from "next/link";
import { Target } from "lucide-react";
import { google } from "googleapis";
// drizzle-orm imports handled by queries
import { EVENT_TYPE_COLORS } from "@/lib/mock-calendar";
import { formatHour } from "@/lib/calendar-utils";
import {
  getRecentActivity,
  getPipelineEngagements,
  getCalendarEvents,
  getInvoices,
  getUsers,
  getCurrentUserForPage,
  getPipelineVelocity,
  getWinLossRate,
  getEngagementHealthScores,
  getAtRiskItems,
  getTeamWorkload,
} from "@/lib/queries";
import { db } from "@/lib/db";
import { googleTokens } from "@/lib/google-calendar";
import { QuickAddBar } from "@/components/quick-add-bar";
import { TeamStatus } from "./team-status";

async function getTeamCalendarBusy(): Promise<Map<string, boolean>> {
  const busyMap = new Map<string, boolean>();

  try {
    // 3-second timeout so Google API doesn't block the whole page
    const result = await Promise.race([
      (async () => {
        const tokenRows = await db
          .select({ userId: googleTokens.userId, refreshToken: googleTokens.refreshToken })
          .from(googleTokens);

        if (tokenRows.length === 0) return busyMap;

        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(now.getTime() + 60_000).toISOString();

        await Promise.all(
          tokenRows.map(async ({ userId, refreshToken }) => {
            try {
              const oauth2 = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI,
              );
              oauth2.setCredentials({ refresh_token: refreshToken });
              const cal = google.calendar({ version: "v3", auth: oauth2 });
              const res = await cal.events.list({
                calendarId: "primary",
                timeMin,
                timeMax,
                singleEvents: true,
                maxResults: 5,
              });
              const busy = (res.data.items ?? []).some(
                (e) => e.status !== "cancelled" && !!e.start?.dateTime,
              );
              busyMap.set(userId, busy);
            } catch {
              // Token unavailable
            }
          }),
        );
        return busyMap;
      })(),
      new Promise<Map<string, boolean>>((resolve) => setTimeout(() => resolve(busyMap), 3000)),
    ]);
    return result;
  } catch {
    return busyMap;
  }

  return busyMap;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard" };

const TEAM_AVATARS: Record<string, string> = {
  Nick: "/avatars/nick.png",
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

  const [recentActivityRaw, engData, dbCalEvents, dbInvoices, dbUsers, currentUser, velocityData, winLoss, healthScores, atRiskItems, teamWorkload, calendarBusy] =
    await Promise.all([
      getRecentActivity(),
      getPipelineEngagements(),
      getCalendarEvents(),
      getInvoices(),
      getUsers(),
      getCurrentUserForPage(),
      getPipelineVelocity(),
      getWinLossRate(),
      getEngagementHealthScores(),
      getAtRiskItems(),
      getTeamWorkload(),
      getTeamCalendarBusy(),
    ]);

  const recentActivity = recentActivityRaw as ActivityItem[];

  const allEngagements = engData.map((e) => ({
    id: e.id,
    name: e.name,
    companyName: e.companyName,
  }));


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


  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#111]">
          {greeting}, {currentUser?.name ?? "team"}
        </h1>
        <span className="text-[13px] text-[#999]">
          {now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>


      {/* Daily briefing */}
      {(() => {
        const overdueCount = atRiskItems.overdueActions.length;
        const staleCount = (atRiskItems.staleEngagements as unknown[]).length;
        const unprepCount = (atRiskItems.unpreparedMeetings as unknown[]).length;
        const totalAlerts = overdueCount + staleCount + unprepCount;
        if (totalAlerts === 0) return null;
        return (
          <div className="mb-6 rounded-lg border border-[#e0e0e0] bg-[#fffbf5] px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#e67e22]">Daily Briefing</p>
            <div className="flex flex-wrap gap-4 text-[13px]">
              {overdueCount > 0 && (
                <Link href="/tasks" className="flex items-center gap-1.5 text-[#c0392b] hover:underline">
                  <span className="font-semibold">{overdueCount}</span> overdue action{overdueCount !== 1 ? "s" : ""}
                </Link>
              )}
              {staleCount > 0 && (
                <Link href="/clients" className="flex items-center gap-1.5 text-[#e67e22] hover:underline">
                  <span className="font-semibold">{staleCount}</span> stale client{staleCount !== 1 ? "s" : ""} (no activity 7+ days)
                </Link>
              )}
              {unprepCount > 0 && (
                <Link href="/calendar" className="flex items-center gap-1.5 text-[#8e24aa] hover:underline">
                  <span className="font-semibold">{unprepCount}</span> meeting{unprepCount !== 1 ? "s" : ""} without prep notes
                </Link>
              )}
            </div>
          </div>
        );
      })()}

      {/* Client health alerts */}
      {(() => {
        const atRisk = healthScores.filter((h) => h.health === "at_risk");
        const needsAttention = healthScores.filter((h) => h.health === "needs_attention");
        if (atRisk.length === 0 && needsAttention.length === 0) return null;
        return (
          <div className="mb-6 rounded-lg border border-[#e0e0e0] bg-white">
            {atRisk.length > 0 && (
              <div className="border-b border-[#f0f0f0] px-4 py-2.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#c0392b]">At Risk</p>
                <div className="flex flex-wrap gap-2">
                  {atRisk.map((h) => (
                    <Link key={h.id} href={`/clients/${h.id}`}
                      className="flex items-center gap-2 rounded-md border border-[#fde8e8] bg-[#fff5f5] px-2.5 py-1.5 text-[12px] transition-colors hover:bg-[#fde8e8]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#c0392b]" />
                      <span className="font-medium text-[#222]">{h.company_name}</span>
                      <span className="text-[#888]">
                        {Number(h.overdue_actions) > 0 && `${h.overdue_actions} overdue`}
                        {Number(h.overdue_actions) > 0 && Number(h.days_since_interaction) > 7 && " · "}
                        {Number(h.days_since_interaction) > 7 && `${Math.round(Number(h.days_since_interaction))}d silent`}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {needsAttention.length > 0 && (
              <div className="px-4 py-2.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#e67e22]">Needs Attention</p>
                <div className="flex flex-wrap gap-2">
                  {needsAttention.map((h) => (
                    <Link key={h.id} href={`/clients/${h.id}`}
                      className="flex items-center gap-2 rounded-md border border-[#fef3e2] bg-[#fffbf5] px-2.5 py-1.5 text-[12px] transition-colors hover:bg-[#fef3e2]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#e67e22]" />
                      <span className="font-medium text-[#222]">{h.company_name}</span>
                      <span className="text-[#888]">
                        {Number(h.overdue_actions) > 0 && `${h.overdue_actions} overdue`}
                        {Number(h.overdue_actions) > 0 && Number(h.days_since_interaction) > 3 && " · "}
                        {Number(h.days_since_interaction) > 3 && `${Math.round(Number(h.days_since_interaction))}d silent`}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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

      {/* Analytics snapshot */}
      <section className="mt-6">
        <h2 className="mb-3 text-[13px] font-semibold text-[#333]">Analytics</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Win Rate */}
          <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Win Rate</p>
            {winLoss.totalClosed > 0 ? (
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f0f0f0" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#27ae60" strokeWidth="3"
                      strokeDasharray={`${winLoss.winRate} ${100 - winLoss.winRate}`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[14px] font-bold text-[#222]">
                    {winLoss.winRate}%
                  </span>
                </div>
                <div>
                  <p className="text-[12px] text-[#555]"><span className="font-semibold text-[#27ae60]">{winLoss.won}</span> won</p>
                  <p className="text-[12px] text-[#555]"><span className="font-semibold text-[#c0392b]">{winLoss.lost}</span> lost</p>
                  {winLoss.wonValue > 0 && (
                    <p className="mt-1 text-[11px] text-[#888]">${winLoss.wonValue.toLocaleString()} closed</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-[12px] text-[#bbb]">No closed deals yet</p>
            )}
          </div>

          {/* Pipeline Velocity */}
          <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Stage Velocity</p>
            {velocityData.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {(() => {
                  const maxDays = Math.max(...velocityData.map((v) => Number(v.avg_days)), 1);
                  const activeStageOrder = ["lead", "contacted", "discovery", "building_mvp", "proposal", "negotiation", "build", "deliver"];
                  return velocityData
                    .filter((v) => activeStageOrder.includes(v.stage))
                    .map((v) => (
                      <div key={v.stage} className="flex items-center gap-2">
                        <span className="w-[68px] truncate text-[11px] capitalize text-[#555]">{v.stage.replace("_", " ")}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0f0f0]">
                          <div className="h-full rounded-full bg-[#1a73e8] transition-all"
                            style={{ width: `${Math.min((Number(v.avg_days) / maxDays) * 100, 100)}%` }} />
                        </div>
                        <span className="w-10 text-right text-[11px] font-medium text-[#222]">{v.avg_days}d</span>
                      </div>
                    ));
                })()}
              </div>
            ) : (
              <p className="py-4 text-center text-[12px] text-[#bbb]">No stage transitions yet</p>
            )}
          </div>
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
          status: calendarBusy.get(u.id) === true ? "busy" : "available",
        }))}
      />

      {/* Team workload */}
      {teamWorkload.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-[13px] font-semibold text-[#333]">Team Workload</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {teamWorkload.map((member) => {
              const maxTasks = Math.max(...teamWorkload.map((m) => m.open_tasks), 1);
              const taskPct = (member.open_tasks / maxTasks) * 100;
              return (
                <div key={member.id} className="flex items-center gap-3 rounded-lg border border-[#e0e0e0] bg-white px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[12px] font-semibold text-[#555]">
                    {member.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-[#222]">{member.name}</span>
                      <span className="text-[12px] text-[#888]">{Number(member.hours_this_week)}h this week</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0f0f0]">
                        <div className={`h-full rounded-full transition-all ${taskPct > 80 ? "bg-[#c0392b]" : taskPct > 50 ? "bg-[#e67e22]" : "bg-[#1a73e8]"}`}
                          style={{ width: `${taskPct}%` }} />
                      </div>
                      <span className="w-16 text-right text-[11px] text-[#555]">
                        {member.open_tasks} task{member.open_tasks !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {member.urgent_tasks > 0 && (
                      <p className="mt-1 text-[11px] text-[#c0392b]">{member.urgent_tasks} urgent</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <QuickAddBar engagements={allEngagements} />
    </div>
  );
}
