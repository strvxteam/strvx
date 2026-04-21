"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Loader, ExternalLink, Minus } from "lucide-react";

interface Run {
  id: string;
  repoId: string;
  repoName: string;
  repoColor: string;
  runId: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
  branch: string | null;
  event: string | null;
  actor: string | null;
  htmlUrl: string;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
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

function StatusIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === "in_progress" || status === "queued") {
    return <Loader size={14} style={{ color: "#1d4ed8" }} />;
  }
  if (conclusion === "success") return <CheckCircle2 size={14} style={{ color: "#047857" }} />;
  if (conclusion === "failure") return <XCircle size={14} style={{ color: "#b91c1c" }} />;
  if (conclusion === "cancelled") return <Minus size={14} style={{ color: "#888" }} />;
  if (conclusion === "skipped") return <Minus size={14} style={{ color: "#ccc" }} />;
  return <Minus size={14} style={{ color: "#ccc" }} />;
}

function statusLabel(status: string, conclusion: string | null): string {
  if (status === "in_progress") return "Running";
  if (status === "queued") return "Queued";
  if (conclusion) return conclusion.charAt(0).toUpperCase() + conclusion.slice(1);
  return status;
}

export default function ActionsClient({
  runs,
  repos,
}: {
  runs: Run[];
  repos: { id: string; name: string }[];
}) {
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [resultFilter, setResultFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (repoFilter !== "all" && r.repoId !== repoFilter) return false;
      if (resultFilter === "failure" && r.conclusion !== "failure") return false;
      if (resultFilter === "success" && r.conclusion !== "success") return false;
      if (resultFilter === "running" && r.status !== "in_progress" && r.status !== "queued") return false;
      return true;
    });
  }, [runs, repoFilter, resultFilter]);

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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Actions</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {filtered.length} of {runs.length} workflow runs
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select style={selectStyle} value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}>
            <option value="all">All repos</option>
            {repos.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
          <select style={selectStyle} value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
            <option value="all">All results</option>
            <option value="success">Success</option>
            <option value="failure">Failed</option>
            <option value="running">Running</option>
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
          gridTemplateColumns: "140px 40px 1fr 140px 100px 90px 90px 90px 32px",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid #f0f0f0",
          backgroundColor: "#fafafa",
          flexShrink: 0,
        }}>
          {["Repo", "", "Workflow", "Branch", "Event", "Duration", "Status", "When", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888" }}>{h}</span>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: "#888" }}>
              No workflow runs match these filters.
            </div>
          ) : filtered.map((r) => (
            <div
              key={r.id}
              data-divided-grid
              style={{
                display: "grid",
                gridTemplateColumns: "140px 40px 1fr 140px 100px 90px 90px 90px 32px",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid #f0f0f0",
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 500, color: "#111" }}>{r.repoName}</span>
              <StatusIcon status={r.status} conclusion={r.conclusion} />
              <div style={{ overflow: "hidden" }}>
                <p style={{ color: "#111", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.workflowName}
                </p>
                {r.actor && (
                  <p style={{ fontSize: 11, color: "#888", marginTop: 2 }}>by {r.actor}</p>
                )}
              </div>
              <span style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.branch ?? "—"}
              </span>
              <span style={{ fontSize: 12, color: "#555" }}>{r.event ?? "—"}</span>
              <span style={{ fontSize: 12, color: "#555" }}>{formatDuration(r.durationMs)}</span>
              <span style={{ fontSize: 12, color: r.conclusion === "failure" ? "#b91c1c" : "#555", fontWeight: r.conclusion === "failure" ? 600 : 400 }}>
                {statusLabel(r.status, r.conclusion)}
              </span>
              <span style={{ fontSize: 12, color: "#888" }}>{timeAgo(r.createdAt)}</span>
              <a
                href={r.htmlUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#1a73e8", display: "inline-flex", alignItems: "center" }}
                aria-label="Open run"
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
