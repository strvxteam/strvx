import type { Metadata } from "next";
import Link from "next/link";
import {
  getDevReposOverview,
  getAllOpenDependabotAlerts,
  getAllRecentDeployments,
} from "@/lib/queries";
import OverviewClient from "./overview-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Development" };

export default async function DevelopmentOverviewPage() {
  const [repos, alerts, recentDeploys] = await Promise.all([
    getDevReposOverview(),
    getAllOpenDependabotAlerts(),
    getAllRecentDeployments(8),
  ]);

  const criticalAlerts = alerts.filter((a) => a.severity === "critical" || a.severity === "high");
  const failingDeploys = repos.filter((r) => r.latestDeployState === "ERROR").length;
  const totalOpenPrs = repos.reduce((sum, r) => sum + r.openPrCount, 0);
  const totalFailingCi = repos.reduce((sum, r) => sum + r.failingCiCount, 0);

  if (repos.length === 0) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Development</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>DevOps and team collaboration across client projects</p>
          </div>
        </div>
        <div style={{
          border: "2px dashed #e0e0e0",
          borderRadius: 10,
          padding: 48,
          textAlign: "center",
          backgroundColor: "#fafafa",
        }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#333", marginBottom: 6 }}>No repos yet</p>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Add your first client repo to start tracking deploys, PRs, and CI.</p>
          <Link
            href="/development/repos"
            style={{
              display: "inline-block",
              borderRadius: 8,
              backgroundColor: "#111",
              color: "#fff",
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Add Repo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <OverviewClient
      repos={repos.map((r) => ({
        ...r,
        lastRefreshedAt: r.lastRefreshedAt?.toISOString() ?? null,
        latestDeployAt: r.latestDeployAt?.toISOString() ?? null,
      }))}
      summary={{
        repoCount: repos.length,
        totalOpenPrs,
        totalFailingCi,
        totalCriticalAlerts: criticalAlerts.length,
        failingDeploys,
      }}
      recentDeploys={recentDeploys.map((d) => ({
        id: d.id,
        repoName: d.repoName,
        repoColor: d.repoColor,
        state: d.state,
        target: d.target,
        branch: d.branch,
        url: d.url,
        commitMessage: d.commitMessage,
        createdAt: d.createdAtRemote.toISOString(),
      }))}
    />
  );
}
