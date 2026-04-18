"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Circle, GitPullRequest, ExternalLink } from "lucide-react";

interface PR {
  id: string;
  repoId: string;
  repoName: string;
  repoColor: string;
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  headBranch: string | null;
  baseBranch: string | null;
  htmlUrl: string;
  reviewers: string[];
  ciStatus: string | null;
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

function CiIcon({ status }: { status: string | null }) {
  if (status === "success") return <CheckCircle2 size={14} style={{ color: "#047857" }} />;
  if (status === "failure") return <XCircle size={14} style={{ color: "#b91c1c" }} />;
  if (status === "pending") return <Circle size={14} style={{ color: "#a16207" }} />;
  return <Circle size={14} style={{ color: "#ccc" }} />;
}

export default function PRsClient({
  prs,
  repos,
}: {
  prs: PR[];
  repos: { id: string; name: string }[];
}) {
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [draftFilter, setDraftFilter] = useState<"all" | "draft" | "ready">("all");

  const filtered = useMemo(() => {
    return prs.filter((pr) => {
      if (repoFilter !== "all" && pr.repoId !== repoFilter) return false;
      if (draftFilter === "draft" && !pr.isDraft) return false;
      if (draftFilter === "ready" && pr.isDraft) return false;
      return true;
    });
  }, [prs, repoFilter, draftFilter]);

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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Pull Requests</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {filtered.length} open · unified inbox
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select style={selectStyle} value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}>
            <option value="all">All repos</option>
            {repos.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
          <select style={selectStyle} value={draftFilter} onChange={(e) => setDraftFilter(e.target.value as "all" | "draft" | "ready")}>
            <option value="all">All</option>
            <option value="ready">Ready for review</option>
            <option value="draft">Drafts</option>
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
          gridTemplateColumns: "140px 50px 1fr 140px 110px 90px 32px",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid #f0f0f0",
          backgroundColor: "#fafafa",
          flexShrink: 0,
        }}>
          {["Repo", "CI", "Title", "Branch → Base", "Author", "Updated", ""].map((h) => (
            <span key={h} style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888" }}>{h}</span>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: "#888" }}>
              <GitPullRequest size={32} style={{ color: "#ccc", margin: "0 auto 12px" }} />
              No open pull requests.
            </div>
          ) : filtered.map((pr) => (
            <div
              key={pr.id}
              data-divided-grid
              style={{
                display: "grid",
                gridTemplateColumns: "140px 50px 1fr 140px 110px 90px 32px",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid #f0f0f0",
                borderLeft: `3px solid ${pr.repoColor}`,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 500, color: "#111" }}>{pr.repoName}</span>
              <CiIcon status={pr.ciStatus} />
              <div style={{ overflow: "hidden" }}>
                <p style={{
                  color: "#111",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: pr.isDraft ? 400 : 500,
                  opacity: pr.isDraft ? 0.7 : 1,
                }}>
                  #{pr.number} {pr.title}
                  {pr.isDraft && <span style={{ marginLeft: 8, fontSize: 10, color: "#888" }}>(draft)</span>}
                </p>
              </div>
              <span style={{ fontSize: 11, fontFamily: "ui-monospace,monospace", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pr.headBranch} → {pr.baseBranch}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                {pr.authorAvatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pr.authorAvatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: 999 }} />
                )}
                <span style={{ fontSize: 12, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pr.authorLogin ?? "unknown"}
                </span>
              </span>
              <span style={{ fontSize: 12, color: "#888" }}>{timeAgo(pr.updatedAt)}</span>
              <a
                href={pr.htmlUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#1a73e8", display: "inline-flex", alignItems: "center" }}
                aria-label="Open PR"
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
