"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, GitFork, Archive, Lock } from "lucide-react";

interface VercelProjectLink {
  id: string;
  name: string;
  productionUrl: string | null;
}
interface Repo {
  id: string;
  name: string;
  githubOwner: string;
  githubRepo: string;
  defaultBranch: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  vercelProjects: VercelProjectLink[];
  color: string;
  isActive: boolean;
  lastRefreshedAt: string | null;
  lastRefreshError: string | null;
}

export default function ReposClient({ repos }: { repos: Repo[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const runSync = () => {
    setSyncError(null);
    setSyncSummary(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/dev/sync-github", { method: "POST" });
        const body = await res.json();
        if (!res.ok && res.status !== 207) {
          setSyncError(body.error ?? `HTTP ${res.status}`);
          return;
        }
        const parts: string[] = [];
        if (body.inserted) parts.push(`${body.inserted} added`);
        if (body.renamed) parts.push(`${body.renamed} renamed`);
        if (body.updated) parts.push(`${body.updated} updated`);
        if (body.deleted) parts.push(`${body.deleted} removed`);
        if (body.backfilled) parts.push(`${body.backfilled} backfilled`);
        setSyncSummary(parts.length > 0 ? parts.join(" · ") : "No changes");
        if ((body.errors ?? []).length > 0) setSyncError(body.errors.join("; "));
        router.refresh();
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : "Sync failed");
      }
    });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Repos</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {repos.length} {repos.length === 1 ? "repo" : "repos"} auto-synced from strvxteam
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={isPending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            backgroundColor: "#fff",
            color: "#333",
            padding: "7px 14px",
            fontSize: 13,
            fontWeight: 500,
            opacity: isPending ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
          {isPending ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {(syncSummary || syncError) && (
        <div style={{
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 8,
          border: `1px solid ${syncError ? "#fecaca" : "#d1e4ff"}`,
          backgroundColor: syncError ? "#fef2f2" : "#f0f6ff",
          fontSize: 12,
          color: syncError ? "#b91c1c" : "#1a73e8",
        }}>
          {syncSummary && <p>{syncSummary}</p>}
          {syncError && <p style={{ marginTop: syncSummary ? 4 : 0 }}>{syncError}</p>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {repos.map((r) => (
          <div
            key={r.id}
            style={{
              borderRadius: 10,
              border: "1px solid #e0e0e0",
              borderLeft: `4px solid ${r.color}`,
              backgroundColor: "#fff",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{r.name}</h3>
                  {r.isPrivate && <Lock size={12} color="#888" aria-label="Private" />}
                  {r.isArchived && <Archive size={12} color="#888" aria-label="Archived" />}
                  {r.isFork && <GitFork size={12} color="#888" aria-label="Fork" />}
                </div>
                <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {r.githubOwner}/{r.githubRepo}
                </p>
              </div>
              <a
                href={`https://github.com/${r.githubOwner}/${r.githubRepo}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  color: "#555",
                }}
                title="GitHub"
              >
                <ExternalLink size={14} />
              </a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888" }}>Default branch</span>
                <span style={{ color: "#333", fontFamily: "ui-monospace,monospace" }}>{r.defaultBranch}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Vercel</span>
                  <span style={{ color: r.vercelProjects.length > 0 ? "#333" : "#bbb" }}>
                    {r.vercelProjects.length === 0
                      ? "Not linked"
                      : `${r.vercelProjects.length} project${r.vercelProjects.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {r.vercelProjects.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 8 }}>
                    {r.vercelProjects.map((p) => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                        <span style={{ color: "#555" }}>{p.name}</span>
                        {p.productionUrl && (
                          <a href={p.productionUrl} target="_blank" rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#1a73e8" }}>
                            {p.productionUrl.replace(/^https?:\/\//, "")}
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888" }}>Last refresh</span>
                <span style={{ color: r.lastRefreshedAt ? "#333" : "#bbb" }}>
                  {r.lastRefreshedAt ? new Date(r.lastRefreshedAt).toLocaleString() : "Never"}
                </span>
              </div>
              {r.lastRefreshError && (
                <p style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>
                  {r.lastRefreshError}
                </p>
              )}
            </div>
          </div>
        ))}
        {repos.length === 0 && (
          <div style={{
            gridColumn: "1 / -1",
            border: "2px dashed #e0e0e0",
            borderRadius: 10,
            padding: 48,
            textAlign: "center",
            backgroundColor: "#fafafa",
          }}>
            <p style={{ fontSize: 13, color: "#888" }}>No repos synced yet. Click Sync now to pull strvxteam repos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
