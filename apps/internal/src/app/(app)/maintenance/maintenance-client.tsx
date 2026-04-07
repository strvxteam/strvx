"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";

interface MaintenanceClientData {
  id: string;
  engagementName: string;
  companyName: string;
  monthlyFee: number | null;
  nextCheckin: string | null;
  daysInMaintain: number;
  daysSinceInteraction: number;
  lastInteraction: string | null;
  openActions: number;
  overdueActions: number;
  projectId: string | null;
  projectName: string | null;
}

interface UptimeResult {
  url: string;
  status: "up" | "down" | "unknown";
  responseMs: number | null;
}

function getCheckinStatus(nextCheckin: string | null): { label: string; color: string } {
  if (!nextCheckin) return { label: "Not scheduled", color: "text-[#888]" };
  const diff = Math.ceil((new Date(nextCheckin).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: "text-[#c0392b]" };
  if (diff === 0) return { label: "Today", color: "text-[#e65100]" };
  if (diff <= 3) return { label: `In ${diff}d`, color: "text-[#e67e22]" };
  return { label: `In ${diff}d`, color: "text-[#27ae60]" };
}

function getHealthColor(daysSinceInteraction: number, overdueActions: number): string {
  if (overdueActions > 0 || daysSinceInteraction > 14) return "border-l-[#c0392b]";
  if (daysSinceInteraction > 7) return "border-l-[#e67e22]";
  return "border-l-[#27ae60]";
}

export default function MaintenanceClient({
  clients,
  totalMRR,
}: {
  clients: MaintenanceClientData[];
  totalMRR: number;
}) {
  const [uptimeResults, setUptimeResults] = useState<Record<string, UptimeResult>>({});
  const [pinging, setPinging] = useState<string | null>(null);

  const checkinsDue = clients.filter((c) => {
    if (!c.nextCheckin) return false;
    const diff = Math.ceil((new Date(c.nextCheckin).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff <= 3;
  }).length;

  const staleCount = clients.filter((c) => c.daysSinceInteraction > 14).length;

  async function pingUrl(clientId: string, url: string) {
    setPinging(clientId);
    try {
      const start = Date.now();
      const res = await fetch(url, { mode: "no-cors", cache: "no-store" });
      const ms = Date.now() - start;
      setUptimeResults((prev) => ({
        ...prev,
        [clientId]: { url, status: "up", responseMs: ms },
      }));
    } catch {
      setUptimeResults((prev) => ({
        ...prev,
        [clientId]: { url, status: "down", responseMs: null },
      }));
    } finally {
      setPinging(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Maintenance</h1>
        <span className="text-[13px] text-[#888]">{clients.length} active client{clients.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-[#e0e0e0] border-l-[3px] border-l-[#1a73e8] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Total MRR</p>
          <p className="mt-1 text-xl font-semibold text-[#1a73e8]">${totalMRR.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] border-l-[3px] border-l-[#27ae60] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Active Clients</p>
          <p className="mt-1 text-xl font-semibold text-[#222]">{clients.length}</p>
        </div>
        <div className={`rounded-lg border border-[#e0e0e0] border-l-[3px] bg-white p-4 ${checkinsDue > 0 ? "border-l-[#e67e22]" : "border-l-[#e0e0e0]"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Check-ins Due</p>
          <p className={`mt-1 text-xl font-semibold ${checkinsDue > 0 ? "text-[#e67e22]" : "text-[#222]"}`}>{checkinsDue}</p>
        </div>
        <div className={`rounded-lg border border-[#e0e0e0] border-l-[3px] bg-white p-4 ${staleCount > 0 ? "border-l-[#c0392b]" : "border-l-[#e0e0e0]"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Stale (&gt;14d)</p>
          <p className={`mt-1 text-xl font-semibold ${staleCount > 0 ? "text-[#c0392b]" : "text-[#222]"}`}>{staleCount}</p>
        </div>
      </div>

      {/* Client list */}
      {clients.length === 0 ? (
        <div style={{ minHeight: "calc(100vh - 280px)" }} className="flex items-center justify-center rounded-lg border border-dashed border-[#e0e0e0] bg-white">
          <div className="text-center">
            <p className="text-[15px] font-medium text-[#aaa]">No maintenance clients yet</p>
            <p className="mt-1 text-[13px] text-[#ccc]">Clients in the &quot;maintain&quot; stage will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {clients.map((client) => {
            const checkin = getCheckinStatus(client.nextCheckin);
            const healthBorder = getHealthColor(client.daysSinceInteraction, client.overdueActions);
            const uptime = uptimeResults[client.id];

            return (
              <div key={client.id} className={`rounded-lg border border-[#e0e0e0] border-l-[3px] ${healthBorder} bg-white p-5`}>
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/clients/${client.id}`} className="text-[15px] font-semibold text-[#222] hover:text-[#1a73e8]">
                      {client.companyName}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-[#888]">
                      {client.engagementName}
                      {client.projectName && (
                        <> · <Link href={`/projects/${client.projectId}`} className="text-[#1a73e8] hover:underline">{client.projectName}</Link></>
                      )}
                    </p>
                  </div>
                  {client.monthlyFee && (
                    <div className="flex items-center gap-1 rounded-full bg-[#e8f0fe] px-2.5 py-1 text-[12px] font-semibold text-[#1a73e8]">
                      <DollarSign size={12} />
                      {client.monthlyFee.toLocaleString()}/mo
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px]">
                  {/* Check-in status */}
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-[#888]" />
                    <span className="text-[#888]">Next check-in:</span>
                    <span className={`font-medium ${checkin.color}`}>{checkin.label}</span>
                  </div>

                  {/* Last interaction */}
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${client.daysSinceInteraction > 14 ? "bg-[#c0392b]" : client.daysSinceInteraction > 7 ? "bg-[#e67e22]" : "bg-[#27ae60]"}`} />
                    <span className="text-[#888]">Last contact:</span>
                    <span className="font-medium text-[#555]">
                      {client.daysSinceInteraction === 0 ? "Today" : `${client.daysSinceInteraction}d ago`}
                    </span>
                  </div>

                  {/* Open actions */}
                  {client.openActions > 0 && (
                    <div className="flex items-center gap-1.5">
                      {client.overdueActions > 0 ? (
                        <AlertTriangle size={13} className="text-[#c0392b]" />
                      ) : (
                        <CheckCircle2 size={13} className="text-[#888]" />
                      )}
                      <span className={client.overdueActions > 0 ? "font-medium text-[#c0392b]" : "text-[#555]"}>
                        {client.openActions} action{client.openActions !== 1 ? "s" : ""}
                        {client.overdueActions > 0 && ` (${client.overdueActions} overdue)`}
                      </span>
                    </div>
                  )}

                  {/* Uptime check */}
                  {uptime && (
                    <div className="flex items-center gap-1.5">
                      {uptime.status === "up" ? (
                        <Wifi size={13} className="text-[#27ae60]" />
                      ) : (
                        <WifiOff size={13} className="text-[#c0392b]" />
                      )}
                      <span className={`font-medium ${uptime.status === "up" ? "text-[#27ae60]" : "text-[#c0392b]"}`}>
                        {uptime.status === "up" ? `Up (${uptime.responseMs}ms)` : "Down"}
                      </span>
                    </div>
                  )}

                  {/* Maintained for */}
                  <span className="text-[#aaa]">{client.daysInMaintain}d in maintenance</span>
                </div>

                {/* Quick actions */}
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href={`/clients/${client.id}`}
                    className="rounded-md border border-[#e0e0e0] px-2.5 py-1 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f5]"
                  >
                    View Client
                  </Link>
                  {client.projectId && (
                    <Link
                      href={`/projects/${client.projectId}`}
                      className="rounded-md border border-[#e0e0e0] px-2.5 py-1 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f5]"
                    >
                      View Project
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      const url = prompt("Enter the client's app URL to check uptime (e.g., https://app.example.com)");
                      if (url) pingUrl(client.id, url);
                    }}
                    disabled={pinging === client.id}
                    className="flex items-center gap-1 rounded-md border border-[#e0e0e0] px-2.5 py-1 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f5] disabled:opacity-40"
                  >
                    {pinging === client.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <ExternalLink size={11} />
                    )}
                    Ping
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
