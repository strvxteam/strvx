"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Trash2,
  RefreshCw,
  Globe,
  Server,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { addMonitoredSite, removeMonitoredSite } from "@/app/actions";

interface HistoryPoint {
  status: string;
  responseMs: number | null;
  checkedAt: string;
}

interface SiteData {
  id: string;
  name: string;
  url: string;
  type: "internal" | "client";
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

function StatusDot({ status }: { status: "up" | "down" | null }) {
  if (!status) return <div className="h-3 w-3 rounded-full bg-[#e0e0e0]" />;
  return (
    <div className={`h-3 w-3 rounded-full ${status === "up" ? "bg-[#27ae60]" : "bg-[#c0392b]"}`}>
      <div className={`h-3 w-3 animate-ping rounded-full opacity-30 ${status === "up" ? "bg-[#27ae60]" : "bg-[#c0392b]"}`} />
    </div>
  );
}

function UptimeBar({ history }: { history: HistoryPoint[] }) {
  if (history.length === 0) return <div className="h-6 rounded bg-[#f0f0f0]" />;

  // Show last 50 checks as a bar
  const checks = history.slice(-50);
  return (
    <div className="flex h-6 gap-px overflow-hidden rounded">
      {checks.map((h, i) => (
        <div
          key={i}
          className={`flex-1 ${h.status === "up" ? "bg-[#27ae60]" : "bg-[#c0392b]"}`}
          title={`${new Date(h.checkedAt).toLocaleTimeString()} — ${h.status} ${h.responseMs ? `(${h.responseMs}ms)` : ""}`}
        />
      ))}
    </div>
  );
}

function ResponseChart({ history }: { history: HistoryPoint[] }) {
  const upChecks = history.filter((h) => h.status === "up" && h.responseMs);
  if (upChecks.length < 2) return null;

  const maxMs = Math.max(...upChecks.map((h) => h.responseMs!));
  const points = upChecks.map((h, i) => {
    const x = (i / (upChecks.length - 1)) * 100;
    const y = 100 - (h.responseMs! / maxMs) * 80;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="mt-2">
      <p className="mb-1 text-[10px] text-[#888]">Response time (24h)</p>
      <svg viewBox="0 0 100 100" className="h-10 w-full" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="#1a73e8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export default function MaintenanceClient({ sites }: { sites: SiteData[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checking, setChecking] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState<"internal" | "client">("client");

  const upCount = sites.filter((s) => s.status === "up").length;
  const downCount = sites.filter((s) => s.status === "down").length;
  const unchecked = sites.filter((s) => !s.status).length;

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

  function handleAdd() {
    if (!newName.trim() || !newUrl.trim()) return;
    startTransition(async () => {
      try {
        await addMonitoredSite({ name: newName.trim(), url: newUrl.trim(), type: newType });
        setNewName("");
        setNewUrl("");
        setShowAdd(false);
        router.refresh();
        toast.success("Site added");
      } catch {
        toast.error("Failed to add site");
      }
    });
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
            onClick={runChecks}
            disabled={checking}
            className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {checking ? "Checking..." : "Check All"}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#333]"
          >
            <Plus size={14} />
            Add Site
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      {/* Add site form */}
      {showAdd && (
        <div className="mb-6 rounded-lg border border-[#1a73e8] bg-white p-4">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Site name"
              className="w-40 rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
              autoFocus
            />
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "internal" | "client")}
              className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none"
            >
              <option value="internal">Internal</option>
              <option value="client">Client</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newUrl.trim() || isPending}
              className="rounded-md bg-[#111] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-40"
            >
              Add
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded-md p-2 text-[#888] hover:bg-[#f0f0f0]">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Sites list */}
      {sites.length === 0 ? (
        <div style={{ minHeight: "calc(100vh - 300px)" }} className="flex items-center justify-center rounded-lg border border-dashed border-[#e0e0e0] bg-white">
          <div className="text-center">
            <p className="text-[15px] font-medium text-[#aaa]">No sites monitored yet</p>
            <p className="mt-1 text-[13px] text-[#ccc]">Click &quot;Add Site&quot; to start monitoring.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Group by type */}
          {(["internal", "client"] as const).map((type) => {
            const typeSites = sites.filter((s) => s.type === type);
            if (typeSites.length === 0) return null;
            return (
              <div key={type}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#888]">
                  {type === "internal" ? "strvx Internal" : "Client Apps"}
                </p>
                <div className="flex flex-col gap-2">
                  {typeSites.map((site) => (
                    <div key={site.id} className="rounded-lg border border-[#e0e0e0] bg-white p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <StatusDot status={site.status} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-[#222]">{site.name}</span>
                              {site.type === "internal" ? (
                                <Server size={12} className="text-[#888]" />
                              ) : (
                                <Globe size={12} className="text-[#888]" />
                              )}
                            </div>
                            <a href={site.url} target="_blank" rel="noopener noreferrer"
                              className="text-[12px] text-[#1a73e8] hover:underline">{site.url}</a>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {site.responseMs && (
                            <span className="text-[13px] font-medium text-[#555]">{site.responseMs}ms</span>
                          )}
                          {site.uptime24h !== null && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              site.uptime24h >= 99 ? "bg-[#e6f9e6] text-[#27ae60]" :
                              site.uptime24h >= 95 ? "bg-[#fff3e0] text-[#e65100]" :
                              "bg-[#fde8e8] text-[#c0392b]"
                            }`}>
                              {site.uptime24h}% uptime
                            </span>
                          )}
                          <button
                            onClick={() => handleRemove(site.id)}
                            className="rounded p-1 text-[#ccc] hover:bg-[#fde8e8] hover:text-[#c0392b]"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Uptime bar */}
                      <div className="mt-3">
                        <UptimeBar history={site.history} />
                      </div>

                      {/* Response time chart */}
                      <ResponseChart history={site.history} />

                      {/* Meta */}
                      <div className="mt-2 flex items-center gap-4 text-[11px] text-[#888]">
                        {site.lastChecked && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(site.lastChecked).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                          </span>
                        )}
                        {site.statusCode && <span>HTTP {site.statusCode}</span>}
                        {site.errorMessage && (
                          <span className="text-[#c0392b]">{site.errorMessage.slice(0, 60)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
