import type { Metadata } from "next";
import { loadInboxData } from "@/lib/inbox-data";
import {
  getInvoices,
  getCurrentUserForPage,
  getMRR,
  getPipelineEngagements,
} from "@/lib/queries";
import { MetricStrip } from "@/components/inbox/metric-strip";
import { InboxSection } from "@/components/inbox/inbox-section";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Inbox" };

export default async function DashboardPage() {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const refreshToken = process.env.GOOGLE_TEAM_REFRESH_TOKEN ?? null;

  const [user, invoices, mrr, engagements, inbox] = await Promise.all([
    getCurrentUserForPage(),
    getInvoices(),
    getMRR(),
    getPipelineEngagements(),
    loadInboxData(todayStr, refreshToken),
  ]);

  const revenue = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.amount), 0);
  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + Number(i.amount), 0);
  const activeStages = new Set([
    "discovery",
    "building_mvp",
    "proposal",
    "negotiation",
    "build",
    "deliver",
  ]);
  const activeDeals = engagements.filter((e) => activeStages.has(e.stage)).length;

  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-[22px] font-bold">
          {greeting}, {user?.name ?? "team"}
        </h1>
        <span className="text-[13px] text-[#999]">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </header>

      <MetricStrip
        revenue={revenue}
        mrr={mrr}
        activeDeals={activeDeals}
        outstanding={outstanding}
      />

      <InboxSection
        title="Do today"
        items={inbox.doToday}
        emptyMessage="All clear — nothing due today"
      />

      <InboxSection
        title="Needs attention"
        items={inbox.needsAttention}
        emptyMessage="All clear — nothing needs attention"
      />

      <InboxSection
        title="Upcoming"
        items={inbox.upcoming}
        emptyMessage="All clear — nothing due this week"
        collapsible
        startCollapsed
      />
    </div>
  );
}
