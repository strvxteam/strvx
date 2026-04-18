import type { Metadata } from "next";
import { getAllRecentDeployments, getAllDevRepos } from "@/lib/queries";
import DeploymentsClient from "./deployments-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Deployments" };

export default async function DeploymentsPage() {
  const [deploys, repos] = await Promise.all([
    getAllRecentDeployments(200),
    getAllDevRepos(),
  ]);

  return (
    <DeploymentsClient
      deploys={deploys.map((d) => ({
        id: d.id,
        repoId: d.repoId,
        repoName: d.repoName,
        repoColor: d.repoColor,
        deploymentId: d.deploymentId,
        url: d.url,
        target: d.target,
        state: d.state,
        branch: d.branch,
        commitSha: d.commitSha,
        commitMessage: d.commitMessage,
        commitAuthor: d.commitAuthor,
        buildDurationMs: d.buildDurationMs,
        createdAt: d.createdAtRemote.toISOString(),
        readyAt: d.readyAt?.toISOString() ?? null,
      }))}
      repos={repos.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
