import type { Metadata } from "next";
import {
  getAllSitesLatestStatus,
  getAllSitesCheckHistory,
} from "@/lib/queries";
import MonitoringClient from "./monitoring-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Monitoring" };

export default async function MonitoringPage() {
  const [sites, historyRows] = await Promise.all([
    getAllSitesLatestStatus(),
    getAllSitesCheckHistory(24),
  ]);

  const historyMap: Record<string, { status: string; responseMs: number | null; checkedAt: string }[]> = {};
  for (const h of historyRows) {
    (historyMap[h.site_id] ??= []).push({
      status: h.status,
      responseMs: h.response_ms,
      checkedAt: h.checked_at,
    });
  }

  const serialized = sites.map((s) => ({
    id: s.site_id,
    name: s.name,
    url: s.url,
    type: s.type as "internal" | "client",
    isActive: s.is_active,
    status: (s.status as "up" | "down") ?? null,
    statusCode: s.status_code,
    responseMs: s.response_ms,
    errorMessage: s.error_message,
    lastChecked: s.checked_at,
    uptime24h: s.uptime_24h ? Math.round(s.uptime_24h * 10) / 10 : null,
    avgResponse1h: s.avg_response_1h ? Number(s.avg_response_1h) : null,
    history: historyMap[s.site_id] ?? [],
  }));

  return <MonitoringClient sites={serialized} />;
}
