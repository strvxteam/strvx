import type { Metadata } from "next";
import { getMaintenanceClients, getMRR } from "@/lib/queries";
import MaintenanceClient from "./maintenance-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const [clients, mrr] = await Promise.all([
    getMaintenanceClients(),
    getMRR(),
  ]);

  const serialized = clients.map((c) => ({
    id: c.id,
    engagementName: c.engagement_name,
    companyName: c.company_name,
    monthlyFee: c.maintenance_monthly_fee ? Number(c.maintenance_monthly_fee) : null,
    nextCheckin: c.maintenance_next_checkin,
    daysInMaintain: Math.round(Number(c.days_in_maintain)),
    daysSinceInteraction: Math.round(Number(c.days_since_interaction)),
    lastInteraction: c.last_interaction,
    openActions: c.open_actions,
    overdueActions: c.overdue_actions,
    projectId: c.project_id,
    projectName: c.project_name,
  }));

  return <MaintenanceClient clients={serialized} totalMRR={mrr} />;
}
