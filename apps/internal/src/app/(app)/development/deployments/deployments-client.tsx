"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

interface Deploy {
  id: string;
  repoId: string;
  repoName: string;
  repoColor: string;
  deploymentId: string;
  url: string;
  target: string | null;
  state: string;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitAuthor: string | null;
  buildDurationMs: number | null;
  createdAt: string;
  readyAt: string | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function StateBadge({ state }: { state: string }) {
  const styles: Record<string, { bg: string; fg: string; label: string }> = {
    READY: { bg: "#ecfdf5", fg: "#047857", label: "Ready" },
    ERROR: { bg: "#fef2f2", fg: "#b91c1c", label: "Failed" },
    BUILDING: { bg: "#eff6ff", fg: "#1d4ed8", label: "Building" },
    QUEUED: { bg: "#fefce8", fg: "#a16207", label: "Queued" },
    CANCELED: { bg: "#f5f5f5", fg: "#666", label: "Canceled" },
    INITIALIZING: { bg: "#eff6ff", fg: "#1d4ed8", label: "Initializing" },
  };
  const s = styles[state] ?? { bg: "#f5f5f5", fg: "#666", label: state };
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 500,
      color: s.fg,
      padding: "2px 8px",
      borderRadius: 6,
      backgroundColor: s.bg,
    }}>
      {s.label}
    </span>
  );
}

export default function DeploymentsClient({
  deploys,
  repos,
}: {
  deploys: Deploy[];
  repos: { id: string; name: string }[];
}) {
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [targetFilter, setTargetFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return deploys.filter((d) => {
      if (repoFilter !== "all" && d.repoId !== repoFilter) return false;
      if (stateFilter !== "all" && d.state !== stateFilter) return false;
      if (targetFilter !== "all" && d.target !== targetFilter) return false;
      return true;
    });
  }, [deploys, repoFilter, stateFilter, targetFilter]);

  const selectStyle: React.CSSProperties = {
    borderRadius: 6,
    border: "1px solid #e0e0e0",
    backgroundColor: "#fff",
    padding: "6px 10px",
    fontSize: 13,
    color: "#333",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Deployments</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {filtered.length} of {deploys.length} deploys
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select style={selectStyle} value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}>
            <option value="all">All repos</option>
            {repos.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
          <select style={selectStyle} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="all">All states</option>
            <option value="READY">Ready</option>
            <option value="ERROR">Failed</option>
            <option value="BUILDING">Building</option>
            <option value="QUEUED">Queued</option>
            <option value="CANCELED">Canceled</option>
          </select>
          <select style={selectStyle} value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)}>
            <option value="all">All targets</option>
            <option value="production">Production</option>
            <option value="preview">Preview</option>
          </select>
        </div>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        backgroundColor: "#fff",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        <div data-divided-grid style={{
          display: "grid",
          gridTemplateColumns: "140px 1fr 90px 120px 100px 110px 90px 32px",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid #f0f0f0",
          backgroundColor: "#fafafa",
          flexShrink: 0,
        }}>
          {["Repo", "Commit", "Target", "Branch", "State", "Built in", "When", ""].map((h) => (
            <span key={h} style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888" }}>{h}</span>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: "#888" }}>
              No deployments match these filters.
            </div>
          ) : filtered.map((d) => (
            <div
              key={d.id}
              data-divided-grid
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 90px 120px 100px 110px 90px 32px",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid #f0f0f0",
                borderLeft: `3px solid ${d.repoColor}`,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 500, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.repoName}</span>
              <div style={{ overflow: "hidden" }}>
                <p style={{ color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.commitMessage ?? "—"}
                </p>
                {d.commitAuthor && (
                  <p style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{d.commitAuthor}</p>
                )}
              </div>
              <span style={{ fontSize: 12, color: d.target === "production" ? "#047857" : "#555" }}>
                {d.target ?? "—"}
              </span>
              <span style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.branch ?? "—"}
              </span>
              <StateBadge state={d.state} />
              <span style={{ fontSize: 12, color: "#555" }}>{formatDuration(d.buildDurationMs)}</span>
              <span style={{ fontSize: 12, color: "#888" }}>{timeAgo(d.createdAt)}</span>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#1a73e8", display: "inline-flex", alignItems: "center" }}
                aria-label="Open deployment"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
