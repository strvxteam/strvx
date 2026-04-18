import "server-only";
import { getTasks, getAtRiskItems, getInfrastructureAlerts } from "./queries";
import { getPersonalCalendarEvents } from "./google-calendar";

export type InboxItem =
  | { kind: "task"; id: string; title: string; dueDate: string | null; priority: string; engagementId: string | null }
  | { kind: "next-action"; id: string; description: string; dueDate: string | null; engagementId: string; companyName: string }
  | { kind: "meeting"; id: string; title: string; start: string; meetLink: string | null }
  | { kind: "stale-engagement"; id: string; companyName: string; daysSince: number }
  | { kind: "alert-deploy"; id: string; project: string; url: string }
  | { kind: "alert-monitor"; id: string; siteUrl: string; label: string | null; reason: string }
  | { kind: "alert-invoice"; id: string; number: string; client: string; amount: number; dueDate: string | null };

export type InboxSections = {
  doToday: InboxItem[];
  needsAttention: InboxItem[];
  upcoming: InboxItem[];
};

export async function loadInboxData(todayStr: string, userRefreshToken: string | null): Promise<InboxSections> {
  const [tasks, atRisk, alerts, todayEvents] = await Promise.all([
    getTasks(),
    getAtRiskItems().catch(() => ({ overdueActions: [], staleEngagements: [], unpreparedMeetings: [] })),
    getInfrastructureAlerts().catch(() => ({ failedDeploys: [], failingMonitors: [], overdueInvoices: [] })),
    userRefreshToken
      ? getPersonalCalendarEvents(userRefreshToken, todayBounds(todayStr).min, todayBounds(todayStr).max).catch(() => [])
      : Promise.resolve([]),
  ]);

  const overdueTasks: InboxItem[] = tasks
    .filter((t) => t.status !== "done" && t.dueDate && t.dueDate <= todayStr)
    .slice(0, 20)
    .map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      engagementId: t.engagementId,
    }));

  const overdueActionItems: InboxItem[] = (atRisk.overdueActions ?? []).map((a) => ({
    kind: "next-action" as const,
    id: a.id,
    description: a.description,
    dueDate: a.dueDate,
    engagementId: a.engagementId,
    companyName: a.companyName,
  }));

  const meetings: InboxItem[] = (todayEvents as { id: string; title: string; start: string; meetLink?: string | null }[]).map((e) => ({
    kind: "meeting" as const,
    id: e.id,
    title: e.title,
    start: e.start,
    meetLink: e.meetLink ?? null,
  }));

  const stale: InboxItem[] = (
    (atRisk.staleEngagements ?? []) as unknown as {
      id: string;
      company_name: string;
      last_interaction_at: string | null;
    }[]
  ).map((e) => {
    const daysSince = e.last_interaction_at
      ? Math.floor((Date.now() - new Date(e.last_interaction_at).getTime()) / 86400000)
      : 999;
    return { kind: "stale-engagement" as const, id: e.id, companyName: e.company_name, daysSince };
  });

  const deploy: InboxItem[] = alerts.failedDeploys.map((d) => ({
    kind: "alert-deploy" as const,
    id: d.id,
    project: d.project_name,
    url: d.url,
  }));
  const monitor: InboxItem[] = alerts.failingMonitors.map((m) => ({
    kind: "alert-monitor" as const,
    id: m.site_id,
    siteUrl: m.url,
    label: m.label,
    reason: m.status_code ? `${m.status_code} error` : (m.error_message ?? "unreachable"),
  }));
  const invoice: InboxItem[] = alerts.overdueInvoices.map((i) => ({
    kind: "alert-invoice" as const,
    id: i.id,
    number: i.number,
    client: i.client ?? "",
    amount: Number(i.amount),
    dueDate: i.dueDate,
  }));

  const doToday: InboxItem[] = [...overdueTasks, ...overdueActionItems, ...meetings];
  const needsAttention: InboxItem[] = [...stale, ...deploy, ...monitor, ...invoice];

  const upcoming: InboxItem[] = tasks
    .filter((t) => t.status !== "done" && t.dueDate && t.dueDate > todayStr)
    .slice(0, 20)
    .map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      engagementId: t.engagementId,
    }));

  return { doToday, needsAttention, upcoming };
}

function todayBounds(todayStr: string) {
  // Pacific Time bounds for the calendar query
  const d = new Date(`${todayStr}T00:00:00`);
  const month = d.getUTCMonth() + 1;
  const offset = month >= 3 && month <= 11 ? "-07:00" : "-08:00";
  return {
    min: `${todayStr}T00:00:00${offset}`,
    max: `${todayStr}T23:59:59${offset}`,
  };
}
