import type { Metadata } from "next";
import { getAllOpenPullRequests, getAllDevRepos } from "@/lib/queries";
import PRsClient from "./prs-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pull Requests" };

export default async function PullRequestsPage() {
  const [prs, repos] = await Promise.all([
    getAllOpenPullRequests(),
    getAllDevRepos(),
  ]);

  return (
    <PRsClient
      prs={prs.map((pr) => ({
        id: pr.id,
        repoId: pr.repoId,
        repoName: pr.repoName,
        repoColor: pr.repoColor,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        isDraft: pr.isDraft,
        authorLogin: pr.authorLogin,
        authorAvatarUrl: pr.authorAvatarUrl,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
        htmlUrl: pr.htmlUrl,
        reviewers: Array.isArray(pr.requestedReviewers) ? pr.requestedReviewers : [],
        ciStatus: pr.ciStatus,
        createdAt: pr.createdAtRemote.toISOString(),
        updatedAt: pr.updatedAtRemote.toISOString(),
      }))}
      repos={repos.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
