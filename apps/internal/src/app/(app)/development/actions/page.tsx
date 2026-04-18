import type { Metadata } from "next";
import { getAllRecentWorkflowRuns, getAllDevRepos } from "@/lib/queries";
import ActionsClient from "./actions-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Actions" };

export default async function ActionsPage() {
  const [runs, repos] = await Promise.all([
    getAllRecentWorkflowRuns(200),
    getAllDevRepos(),
  ]);

  return (
    <ActionsClient
      runs={runs.map((r) => ({
        id: r.id,
        repoId: r.repoId,
        repoName: r.repoName,
        repoColor: r.repoColor,
        runId: r.runId,
        workflowName: r.workflowName,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.branch,
        event: r.event,
        actor: r.actor,
        htmlUrl: r.htmlUrl,
        durationMs: r.durationMs,
        createdAt: r.createdAtRemote.toISOString(),
        updatedAt: r.updatedAtRemote.toISOString(),
      }))}
      repos={repos.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
