"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshDevOpsAction } from "@/app/actions";
import {
  RefreshCw,
  GitPullRequest,
  Rocket,
  ShieldAlert,
  XCircle,
  Activity,
  Clock,
} from "lucide-react";

interface Repo {
  id: string;
  name: string;
  githubOwner: string;
  githubRepo: string;
  defaultBranch: string;
  color: string;
  ownerName: string | null;
  lastRefreshedAt: string | null;
  lastRefreshError: string | null;
  openPrCount: number;
  dependabotOpenCount: number;
  failingCiCount: number;
  latestDeployState: string | null;
  latestDeployUrl: string | null;
  latestDeployAt: string | null;
  latestDeployBranch: string | null;
  latestDeployCommitMessage: string | null;
}

interface Summary {
  repoCount: number;
  totalOpenPrs: number;
  totalFailingCi: number;
  totalCriticalAlerts: number;
  failingDeploys: number;
}

interface Deploy {
  id: string;
  repoName: string;
  repoColor: string;
  state: string;
  target: string | null;
  branch: string | null;
  url: string;
  commitMessage: string | null;
  createdAt: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function StateBadge({ state }: { state: string | null }) {
  if (!state) {
    return (
      <span style={{ fontSize: 11, color: "#888", padding: "2px 8px", borderRadius: 6, backgroundColor: "#f5f5f5" }}>
        No deploy
      </span>
    );
  }
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

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone?: "danger" | "warning" | "ok" | "neutral";
}) {
  const toneColor = {
    danger: "#b91c1c",
    warning: "#a16207",
    ok: "#047857",
    neutral: "#111",
  }[tone ?? "neutral"];
  return (
    <div style={{
      borderRadius: 10,
      border: "1px solid #e0e0e0",
      backgroundColor: "#fff",
      padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={14} style={{ color: "#888" }} />
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888" }}>
          {label}
        </span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color: toneColor }}>{value}</p>
    </div>
  );
}

export default function OverviewClient({
  repos,
  summary,
  recentDeploys,
}: {
  repos: Repo[];
  summary: Summary;
  recentDeploys: Deploy[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleRefresh = () => {
    startTransition(async () => {
      await refreshDevOpsAction();
      router.refresh();
    });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Development</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {summary.repoCount} {summary.repoCount === 1 ? "repo" : "repos"} · DevOps and team collaboration
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isPending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            backgroundColor: "#fff",
            padding: "6px 12px",
            fontSize: 13,
            fontWeight: 500,
            color: "#333",
            cursor: isPending ? "wait" : "pointer",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
          {isPending ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard icon={Rocket} label="Repos" value={summary.repoCount} />
        <StatCard icon={GitPullRequest} label="Open PRs" value={summary.totalOpenPrs} tone={summary.totalOpenPrs > 0 ? "warning" : "neutral"} />
        <StatCard icon={XCircle} label="Failed CI (7d)" value={summary.totalFailingCi} tone={summary.totalFailingCi > 0 ? "danger" : "ok"} />
        <StatCard icon={ShieldAlert} label="Critical alerts" value={summary.totalCriticalAlerts} tone={summary.totalCriticalAlerts > 0 ? "danger" : "ok"} />
        <StatCard icon={Activity} label="Failed deploys" value={summary.failingDeploys} tone={summary.failingDeploys > 0 ? "danger" : "ok"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 24 }}>
        <div style={{ borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fff", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>Client fleet</h2>
            <Link href="/development/repos" style={{ fontSize: 12, color: "#1a73e8" }}>Manage →</Link>
          </div>
          <div data-divided-grid style={{ display: "grid", gridTemplateColumns: "1fr 110px 70px 90px 90px 90px", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f0f0f0", backgroundColor: "#fafafa" }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888", paddingRight: 12 }}>Repo</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888", paddingRight: 12 }}>Deploy</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888", paddingRight: 12 }}>PRs</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888", paddingRight: 12 }}>CI fails</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888", paddingRight: 12 }}>Alerts</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#888" }}>Owner</span>
          </div>
          {repos.map((r) => (
            <div
              key={r.id}
              data-divided-grid
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 70px 90px 90px 90px",
                gap: 12,
                padding: "14px 16px",
                borderBottom: "1px solid #f0f0f0",
                borderLeft: `3px solid ${r.color}`,
                alignItems: "center",
              }}
            >
              <div>
                <a
                  href={`https://github.com/${r.githubOwner}/${r.githubRepo}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 13, fontWeight: 600, color: "#111" }}
                >
                  {r.name}
                </a>
                <p style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  {r.githubOwner}/{r.githubRepo}
                  {r.lastRefreshedAt && ` · updated ${timeAgo(r.lastRefreshedAt)}`}
                </p>
              </div>
              <StateBadge state={r.latestDeployState} />
              <span style={{ fontSize: 13, color: r.openPrCount > 0 ? "#333" : "#aaa" }}>{r.openPrCount}</span>
              <span style={{ fontSize: 13, color: r.failingCiCount > 0 ? "#b91c1c" : "#aaa", fontWeight: r.failingCiCount > 0 ? 600 : 400 }}>
                {r.failingCiCount}
              </span>
              <span style={{ fontSize: 13, color: r.dependabotOpenCount > 0 ? "#a16207" : "#aaa", fontWeight: r.dependabotOpenCount > 0 ? 600 : 400 }}>
                {r.dependabotOpenCount}
              </span>
              <span style={{ fontSize: 12, color: "#555" }}>{r.ownerName ?? "—"}</span>
            </div>
          ))}
        </div>

        <div style={{ borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fff", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>Recent deploys</h2>
          </div>
          {recentDeploys.length === 0 ? (
            <p style={{ padding: 16, fontSize: 12, color: "#888" }}>No deploys yet.</p>
          ) : (
            recentDeploys.map((d) => (
              <a
                key={d.id}
                href={d.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block",
                  padding: "12px 16px",
                  borderBottom: "1px solid #f0f0f0",
                  borderLeft: `3px solid ${d.repoColor}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{d.repoName}</span>
                  <StateBadge state={d.state} />
                </div>
                <p style={{ fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.commitMessage ?? d.branch ?? "—"}
                </p>
                <p style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{timeAgo(d.createdAt)}</p>
              </a>
            ))
          )}
        </div>
      </div>

      {repos.some((r) => r.lastRefreshError) && (
        <div style={{
          borderRadius: 10,
          border: "1px solid #fde68a",
          backgroundColor: "#fffbeb",
          padding: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Clock size={14} style={{ color: "#a16207" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#a16207" }}>Refresh warnings</span>
          </div>
          {repos
            .filter((r) => r.lastRefreshError)
            .map((r) => (
              <p key={r.id} style={{ fontSize: 11, color: "#92400e", marginBottom: 4 }}>
                <strong>{r.name}:</strong> {r.lastRefreshError}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
