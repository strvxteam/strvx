"use client";

import { useState, useTransition, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Trash2,
  RefreshCw,
  Globe,
  Server,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { removeMonitoredSite } from "@/app/actions";

interface HistoryPoint {
  status: string;
  responseMs: number | null;
  checkedAt: string;
}

interface SiteData {
  id: string;
  name: string;
  url: string;
  type: "strvx" | "client" | "demo";
  isActive: boolean;
  status: "up" | "down" | null;
  statusCode: number | null;
  responseMs: number | null;
  errorMessage: string | null;
  lastChecked: string | null;
  uptime24h: number | null;
  avgResponse1h: number | null;
  history: HistoryPoint[];
}

function StatusPill({ site }: { site: SiteData }) {
  const has24hDown = site.history.some((h) => h.status === "down");

  if (site.status === "down") {
    return <span className="text-[13px] font-medium text-[#dc2626]">Down</span>;
  }
  if (site.status === "up" && has24hDown) {
    return <span className="text-[13px] font-medium text-[#d97706]">Degraded</span>;
  }
  if (site.status === "up") {
    return <span className="text-[13px] font-medium text-[#16a34a]">Operational</span>;
  }
  return <span className="text-[13px] font-medium text-[#9ca3af]">No data</span>;
}

function UptimeBar({ history, hours = 24 }: { history: HistoryPoint[]; hours?: number }) {
  const hourMs = 60 * 60 * 1000;

  // useMemo keeps Date.now() out of the render-pure path and re-computes only
  // when history or hours change. React Compiler flags bare Date.now() as impure.
  const buckets = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    return Array.from({ length: hours }, (_, i) => {
      const end = now - (hours - 1 - i) * hourMs;
      const start = end - hourMs;
      const checks = history.filter((h) => {
        const t = new Date(h.checkedAt).getTime();
        return t >= start && t < end;
      });
      const total = checks.length;
      const up = checks.filter((c) => c.status === "up").length;
      return { hourEnd: new Date(end), total, up, down: total - up };
    });
  }, [history, hours, hourMs]);

  let totalChecks = 0;
  let totalUp = 0;
  for (const b of buckets) {
    totalChecks += b.total;
    totalUp += b.up;
  }
  const uptimePct = totalChecks > 0 ? (totalUp / totalChecks) * 100 : null;

  return (
    <div>
      <div className="flex h-10 items-stretch gap-[2px]">
        {buckets.map((b, i) => {
          // Default: assume up (green). Only real down checks shift the color.
          let color = "bg-[#16a34a]";
          let label = "no checks recorded — assumed up";
          if (b.total > 0) {
            const pct = (b.up / b.total) * 100;
            if (pct === 100) color = "bg-[#16a34a]";
            else if (pct >= 95) color = "bg-[#eab308]";
            else color = "bg-[#dc2626]";
            label = `${b.up}/${b.total} up (${pct.toFixed(2)}%)`;
          }
          const hourLabel = b.hourEnd.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            hour12: true,
          });
          return (
            <div
              key={i}
              className={`min-w-[3px] flex-1 rounded-[1px] ${color}`}
              title={`${hourLabel} — ${label}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[12px] text-[#9ca3af]">
        <span className="shrink-0">{hours}h ago</span>
        <div className="h-px flex-1 bg-[#e5e7eb]" />
        <span className="shrink-0">
          {uptimePct !== null ? `${uptimePct.toFixed(2)} % uptime` : "100.00 % uptime"}
        </span>
        <div className="h-px flex-1 bg-[#e5e7eb]" />
        <span className="shrink-0">Now</span>
      </div>
    </div>
  );
}

interface VercelDeploy {
  projectId: string;
  projectName: string;
  vercelProjectId: string;
  productionUrl: string | null;
  repoId: string;
  repoName: string;
  repoColor: string;
  deploymentId: string | null;
  state: string | null;
  url: string | null;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitAuthor: string | null;
  buildDurationMs: number | null;
  createdAt: string | null;
  readyAt: string | null;
}

const VERCEL_STATE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  READY: { label: "Ready", color: "#16a34a", bg: "#dcfce7" },
  ERROR: { label: "Error", color: "#dc2626", bg: "#fee2e2" },
  BUILDING: { label: "Building", color: "#2563eb", bg: "#dbeafe" },
  QUEUED: { label: "Queued", color: "#6b7280", bg: "#f3f4f6" },
  CANCELED: { label: "Canceled", color: "#9ca3af", bg: "#f3f4f6" },
  INITIALIZING: { label: "Initializing", color: "#2563eb", bg: "#dbeafe" },
};

function VercelTile({ d }: { d: VercelDeploy }) {
  const style = d.state ? (VERCEL_STATE_STYLE[d.state] ?? { label: d.state, color: "#6b7280", bg: "#f3f4f6" }) : { label: "No deploys", color: "#9ca3af", bg: "#f3f4f6" };
  const ageHours = d.createdAt ? Math.round((Date.now() - new Date(d.createdAt).getTime()) / 3600000) : null;
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        backgroundColor: "#fff",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0 }}>{d.projectName}</p>
          <p style={{ fontSize: 10, color: "#9ca3af", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: 0.3 }}>
            {d.repoName}
          </p>
          {d.productionUrl && (
            <a href={d.productionUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: "#6b7280", textDecoration: "none" }}>
              {d.productionUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            color: style.color,
            backgroundColor: style.bg,
            whiteSpace: "nowrap",
          }}
        >
          {style.label}
        </span>
      </div>
      {d.deploymentId ? (
        <div style={{ fontSize: 11, color: "#6b7280", display: "flex", flexDirection: "column", gap: 2 }}>
          {d.commitMessage && <p style={{ margin: 0, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.commitMessage}</p>}
          <p style={{ margin: 0 }}>
            {d.branch ?? "?"}
            {d.commitSha && <> · <code style={{ fontFamily: "ui-monospace,monospace" }}>{d.commitSha.slice(0, 7)}</code></>}
            {d.commitAuthor && <> · {d.commitAuthor}</>}
          </p>
          <p style={{ margin: 0 }}>
            {d.buildDurationMs != null && <>{Math.round(d.buildDurationMs / 1000)}s build</>}
            {d.buildDurationMs != null && ageHours != null && " · "}
            {ageHours != null && (ageHours < 1 ? "just now" : ageHours < 24 ? `${ageHours}h ago` : `${Math.round(ageHours / 24)}d ago`)}
          </p>
        </div>
      ) : (
        <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>No deployments yet</p>
      )}
    </div>
  );
}

export default function MonitoringClient({ sites, vercelDeploys = [] }: { sites: SiteData[]; vercelDeploys?: VercelDeploy[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checking, setChecking] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [nextCheck, setNextCheck] = useState(300); // 5 min countdown
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // Auto-check every 5 minutes when page is open
  const silentCheck = useCallback(async () => {
    try {
      await fetch("/api/monitor/check", { method: "POST" });
      router.refresh();
    } catch { /* silent */ }
  }, [router]);

  useEffect(() => {
    if (!autoRefresh) return;
    const countdown = setInterval(() => {
      setNextCheck((prev) => {
        if (prev <= 1) {
          silentCheck();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, [autoRefresh, silentCheck]);

  const upCount = sites.filter((s) => s.status === "up").length;
  const downCount = sites.filter((s) => s.status === "down").length;
  const unchecked = sites.filter((s) => !s.status).length;

  // 24h error aggregates across all sites
  const totalChecks24h = sites.reduce((s, site) => s + site.history.length, 0);
  const totalErrors24h = sites.reduce(
    (s, site) => s + site.history.filter((h) => h.status === "down").length,
    0,
  );
  const errorRate24h = totalChecks24h > 0 ? (totalErrors24h / totalChecks24h) * 100 : 0;

  async function runChecks() {
    setChecking(true);
    try {
      await fetch("/api/monitor/check", { method: "POST" });
      router.refresh();
      toast.success("All sites checked");
    } catch {
      toast.error("Failed to run checks");
    } finally {
      setChecking(false);
    }
  }

  function handleRemove(siteId: string) {
    startTransition(async () => {
      try {
        await removeMonitoredSite(siteId);
        router.refresh();
        toast.success("Site removed");
      } catch {
        toast.error("Failed to remove");
      }
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Monitoring</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              autoRefresh ? "border-[#27ae60] bg-[#e6f9e6] text-[#27ae60]" : "border-[#e0e0e0] text-[#888]"
            }`}
          >
            {autoRefresh ? `Auto ${Math.floor(nextCheck / 60)}:${String(nextCheck % 60).padStart(2, "0")}` : "Auto off"}
          </button>
          <button
            onClick={runChecks}
            disabled={checking}
            className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {checking ? "Checking..." : "Check All"}
          </button>
        </div>
      </div>

      {vercelDeploys.length > 0 && (() => {
        const collapsed = collapsedSections.has("vercel");
        return (
          <div style={{ marginBottom: 32 }}>
            <button
              type="button"
              onClick={() => toggleSection("vercel")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 12, background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
            >
              <h2 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#333", textTransform: "uppercase", letterSpacing: 0.4, margin: 0 }}>
                <ChevronDown size={14} style={{ transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "none", color: "#888" }} />
                Vercel Deployments
              </h2>
              <span style={{ fontSize: 11, color: "#888" }}>
                {vercelDeploys.filter((d) => d.state === "ERROR").length} failing · {vercelDeploys.filter((d) => d.state === "READY").length} ready
              </span>
            </button>
            {!collapsed && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {vercelDeploys.map((d) => <VercelTile key={d.projectId} d={d} />)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-lg border border-[#e0e0e0] border-l-[3px] bg-white p-4 ${downCount > 0 ? "border-l-[#c0392b]" : "border-l-[#27ae60]"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Status</p>
          <p className={`mt-1 text-xl font-semibold ${downCount > 0 ? "text-[#c0392b]" : "text-[#27ae60]"}`}>
            {downCount > 0 ? `${downCount} Down` : "All Operational"}
          </p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] border-l-[3px] border-l-[#1a73e8] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Monitored</p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            {sites.length} site{sites.length !== 1 ? "s" : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-[#888]">
            {upCount} up{unchecked > 0 ? ` · ${unchecked} not checked` : ""}
          </p>
        </div>
        <div
          className={`rounded-lg border border-[#e0e0e0] border-l-[3px] bg-white p-4 ${
            totalErrors24h > 0 ? "border-l-[#dc2626]" : "border-l-[#16a34a]"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Errors (24h)</p>
          <p
            className={`mt-1 text-xl font-semibold ${
              totalErrors24h > 0 ? "text-[#dc2626]" : "text-[#222]"
            }`}
          >
            {totalErrors24h}
          </p>
          <p className="mt-0.5 text-[11px] text-[#888]">
            {totalChecks24h > 0
              ? `${errorRate24h.toFixed(2)}% error rate · ${totalChecks24h} checks`
              : "no checks yet"}
          </p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] border-l-[3px] border-l-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Avg Response</p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            {(() => {
              const withResponse = sites.filter((s) => s.avgResponse1h);
              if (withResponse.length === 0) return "—";
              const avg = Math.round(withResponse.reduce((sum, s) => sum + s.avgResponse1h!, 0) / withResponse.length);
              return `${avg}ms`;
            })()}
          </p>
        </div>
      </div>

      {/* Sites list */}
      {sites.length === 0 ? (
        <div style={{ minHeight: "calc(100vh - 300px)" }} className="flex items-center justify-center rounded-lg border border-dashed border-[#e0e0e0] bg-white">
          <div className="text-center">
            <p className="text-[15px] font-medium text-[#aaa]">No sites monitored yet</p>
            <p className="mt-1 text-[13px] text-[#ccc]">Link a Vercel project to auto-add its production URL.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Group by type: strvx | client | demo */}
          {(
            [
              { key: "strvx", label: "strvx" },
              { key: "client", label: "Clients" },
              { key: "demo", label: "Demos" },
            ] as const
          ).map(({ key: type, label }) => {
            const typeSites = sites.filter((s) => s.type === type);
            if (typeSites.length === 0) return null;
            const collapsed = collapsedSections.has(`sites:${type}`);
            return (
              <div key={type}>
                <button
                  type="button"
                  onClick={() => toggleSection(`sites:${type}`)}
                  className="mb-2 flex w-full items-center gap-1.5 bg-transparent p-0 text-left text-[11px] font-semibold uppercase tracking-wider text-[#888] hover:text-[#555]"
                >
                  <ChevronDown
                    size={12}
                    style={{ transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "none" }}
                  />
                  {label}
                  <span className="text-[10px] font-normal text-[#aaa]">({typeSites.length})</span>
                </button>
                {!collapsed && (
                <div className="flex flex-col gap-2">
                  {typeSites.map((site) => {
                    const siteErrors24h = site.history.filter((h) => h.status === "down").length;
                    const siteChecks24h = site.history.length;
                    const siteErrorRate24h =
                      siteChecks24h > 0 ? (siteErrors24h / siteChecks24h) * 100 : 0;
                    return (
                    <div key={site.id} className="group rounded-lg border border-[#e5e7eb] bg-white p-5">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-semibold text-[#111]">{site.name}</span>
                            {site.type === "strvx" ? (
                              <Server size={12} className="text-[#9ca3af]" />
                            ) : (
                              <Globe size={12} className="text-[#9ca3af]" />
                            )}
                          </div>
                          <a
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12px] text-[#6b7280] hover:text-[#111] hover:underline"
                          >
                            {site.url}
                          </a>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <StatusPill site={site} />
                          <button
                            onClick={() => handleRemove(site.id)}
                            className="rounded p-1 text-[#d1d5db] opacity-0 transition-opacity hover:bg-[#fee2e2] hover:text-[#dc2626] group-hover:opacity-100"
                            aria-label="Remove site"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* 24-hour uptime bar */}
                      <UptimeBar history={site.history} />

                      {/* Meta */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#9ca3af]">
                        {site.lastChecked && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            Last checked{" "}
                            {new Date(site.lastChecked).toLocaleString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                        )}
                        {site.statusCode && <span>HTTP {site.statusCode}</span>}
                        {site.responseMs && <span>{site.responseMs}ms</span>}
                        {siteErrors24h > 0 ? (
                          <span className="text-[#dc2626]">
                            {siteErrors24h} error{siteErrors24h === 1 ? "" : "s"} ·{" "}
                            {siteErrorRate24h.toFixed(2)}% error rate (24h)
                          </span>
                        ) : siteChecks24h > 0 ? (
                          <span>0% error rate (24h)</span>
                        ) : null}
                        {site.errorMessage && (
                          <span className="text-[#dc2626]">{site.errorMessage.slice(0, 60)}</span>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
