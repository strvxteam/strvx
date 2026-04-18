import type { Metadata } from "next";
import Link from "next/link";
import { getPersonalCalendarEvents } from "@/lib/google-calendar";
import {
  getPipelineEngagements,
  getInvoices,
  getCurrentUserForPage,
  getMRR,
  getAtRiskItems,
  getTasks,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Today's boundaries in Pacific Time
  const ptMonth = now.getMonth() + 1;
  const ptOffset = ptMonth >= 3 && ptMonth <= 11 ? "-07:00" : "-08:00";
  const ptToday = now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const todayTimeMin = `${ptToday}T00:00:00${ptOffset}`;
  const todayTimeMax = `${ptToday}T23:59:59${ptOffset}`;

  const teamRefreshToken = process.env.GOOGLE_TEAM_REFRESH_TOKEN;

  const [engData, todayGoogleEvents, dbInvoices, currentUser, mrr, atRiskItems, allTasks] =
    await Promise.all([
      getPipelineEngagements(),
      teamRefreshToken
        ? getPersonalCalendarEvents(teamRefreshToken, todayTimeMin, todayTimeMax).catch(() => [])
        : Promise.resolve([]),
      getInvoices(),
      getCurrentUserForPage(),
      getMRR(),
      getAtRiskItems().catch(() => ({ overdueActions: [], staleEngagements: [], unpreparedMeetings: [] })),
      getTasks(),
    ]);

  // ── Metrics ────────────────────────────────────────────
  const totalRevenue = dbInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((s, inv) => s + Number(inv.amount), 0);

  const outstandingAmount = dbInvoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((s, inv) => s + Number(inv.amount), 0);

  const activeStages = new Set(["discovery", "building_mvp", "proposal", "negotiation", "build", "deliver"]);
  const activeDeals = engData.filter((e) => activeStages.has(e.stage));

  // ── Today's events ─────────────────────────────────────
  const todayEvents = todayGoogleEvents.filter((e) => !e.isAllDay || e.start.startsWith(ptToday));

  // ── Action items ───────────────────────────────────────
  const overdueActions = (atRiskItems.overdueActions ?? []).slice(0, 8) as {
    id: string; description: string; dueDate: string | null; companyName: string; engagementId: string;
  }[];

  const staleEngagements = ((atRiskItems.staleEngagements ?? []) as unknown as {
    id: string; name: string; company_name: string; last_interaction_at: string | null;
  }[]).slice(0, 5);

  // Overdue tasks
  const overdueTasks = allTasks
    .filter((t) => t.status !== "done" && t.dueDate && t.dueDate < todayStr)
    .slice(0, 8);

  // ── Pipeline snapshot ──────────────────────────────────
  const stageOrder = ["lead", "contacted", "discovery", "building_mvp", "proposal", "negotiation", "build", "deliver", "maintain"];
  const stageCounts: { stage: string; count: number }[] = [];
  for (const stage of stageOrder) {
    const count = engData.filter((e) => e.stage === stage).length;
    if (count > 0) stageCounts.push({ stage, count });
  }
  const maxStageCount = Math.max(...stageCounts.map((s) => s.count), 1);

  const STAGE_COLORS: Record<string, string> = {
    lead: "bg-[#f0f0f0] text-[#666]",
    contacted: "bg-[#f0f0f0] text-[#555]",
    discovery: "bg-[#e8f0fe] text-[#1a73e8]",
    building_mvp: "bg-[#fef3e2] text-[#e67e22]",
    proposal: "bg-[#f3e5f5] text-[#8e24aa]",
    negotiation: "bg-[#fce4ec] text-[#c62828]",
    build: "bg-[#e8f5e9] text-[#27ae60]",
    deliver: "bg-[#e0f2f1] text-[#00897b]",
    maintain: "bg-[#e3f2fd] text-[#1565c0]",
  };

  const totalActions = overdueActions.length + staleEngagements.length + overdueTasks.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#111]">
          {greeting}, {currentUser?.name ?? "team"}
        </h1>
        <span className="text-[13px] text-[#999]">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </div>

      {/* Zone 1: Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-[#e0e0e0] bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#999]">Revenue</p>
          <p className="mt-1 text-[20px] font-bold text-[#27ae60]">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#999]">MRR</p>
          <p className="mt-1 text-[20px] font-bold text-[#1a73e8]">${mrr.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#999]">Active Deals</p>
          <p className="mt-1 text-[20px] font-bold text-[#222]">{activeDeals.length}</p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#999]">Outstanding</p>
          <p className={`mt-1 text-[20px] font-bold ${outstandingAmount > 0 ? "text-[#e67e22]" : "text-[#222]"}`}>
            ${outstandingAmount.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Zone 2: Two columns */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Action Items */}
        <div style={{ height: 340 }} className="flex flex-col rounded-lg border border-[#e0e0e0] bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[#333]">Needs Attention</h2>
            {totalActions > 0 && (
              <span className="rounded-full bg-[#c0392b] px-2 py-0.5 text-[10px] font-bold text-white">{totalActions}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {totalActions === 0 ? (
              <div className="flex h-full items-center justify-center text-[13px] text-[#bbb]">
                All clear — nothing needs attention
              </div>
            ) : (
              <div className="divide-y divide-[#f5f5f5]">
                {overdueTasks.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c0392b]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-[#222]">{t.title}</p>
                      <p className="text-[11px] text-[#c0392b]">Task overdue · {t.dueDate}</p>
                    </div>
                  </Link>
                ))}
                {overdueActions.map((a) => (
                  <Link key={a.id} href={`/clients/${a.engagementId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e67e22]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-[#222]">{a.description}</p>
                      <p className="text-[11px] text-[#e67e22]">{a.companyName} · overdue</p>
                    </div>
                  </Link>
                ))}
                {staleEngagements.map((e) => (
                  <Link key={e.id} href={`/clients/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#888]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-[#222]">{e.company_name}</p>
                      <p className="text-[11px] text-[#888]">No contact in 7+ days</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Today's Schedule */}
        <div style={{ height: 340 }} className="flex flex-col rounded-lg border border-[#e0e0e0] bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[#333]">Today</h2>
            <Link href="/calendar" className="text-[11px] font-medium text-[#888] hover:text-[#555]">
              Calendar →
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            {todayEvents.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[13px] text-[#bbb]">
                No meetings today
              </div>
            ) : (
              <div className="divide-y divide-[#f5f5f5]">
                {todayEvents.map((evt) => {
                  const timeLabel = evt.isAllDay
                    ? "All day"
                    : new Date(evt.start).toLocaleTimeString("en-US", {
                        timeZone: "America/Los_Angeles",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                  return (
                    <div key={evt.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-[52px] shrink-0 text-[12px] font-medium text-[#555]">
                        {timeLabel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[#222]">{evt.title}</p>
                      </div>
                      {evt.meetLink && (
                        <a href={evt.meetLink} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[10px] font-medium text-[#1a73e8] hover:bg-[#d2e3fc]">
                          Meet
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zone 3: Mini Kanban Pipeline */}
      <div style={{ height: 300 }} className="flex flex-col rounded-lg border border-[#e0e0e0] bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[#333]">Pipeline</h2>
          <Link href="/pipeline" className="text-[11px] font-medium text-[#888] hover:text-[#555]">
            View all →
          </Link>
        </div>
        <div className="flex flex-1 overflow-x-auto">
          {(() => {
            const kanbanStages = ["discovery", "building_mvp", "proposal", "build", "deliver", "maintain"];
            const stageLabels: Record<string, string> = {
              discovery: "Discovery", building_mvp: "Building MVP", proposal: "Proposal",
              build: "Build", deliver: "Deliver", maintain: "Maintain",
            };
            const stageDots: Record<string, string> = {
              discovery: "bg-[#1a73e8]", building_mvp: "bg-[#e67e22]", proposal: "bg-[#8e24aa]",
              build: "bg-[#27ae60]", deliver: "bg-[#00897b]", maintain: "bg-[#1565c0]",
            };
            return kanbanStages.map((stage) => {
              const deals = activeDeals.filter((d) => d.stage === stage);
              return (
                <div key={stage} className="flex min-w-[150px] flex-1 flex-col border-r border-[#f0f0f0] last:border-r-0">
                  <div className="flex shrink-0 items-center gap-2 px-3 py-2 border-b border-[#f5f5f5]">
                    <span className={`h-2 w-2 rounded-full ${stageDots[stage]}`} />
                    <span className="text-[11px] font-semibold text-[#555]">{stageLabels[stage]}</span>
                    {deals.length > 0 && (
                      <span className="rounded-full bg-[#f0f0f0] px-1.5 text-[10px] font-medium text-[#888]">{deals.length}</span>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto px-2 py-1.5">
                    {deals.length === 0 ? (
                      <div className="flex h-full items-center justify-center">
                        <span className="text-[11px] text-[#ccc]">—</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {deals.map((deal) => (
                          <Link key={deal.id} href={`/clients/${deal.id}`}
                            className="rounded-md border border-[#f0f0f0] bg-[#fafafa] px-2.5 py-2 transition-colors hover:border-[#ddd] hover:bg-white">
                            <p className="truncate text-[12px] font-medium text-[#222]">{deal.companyName}</p>
                            {deal.dealValue && (
                              <p className="text-[10px] text-[#888]">${Number(deal.dealValue).toLocaleString()}</p>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
