import { Octokit } from "@octokit/rest";

let cachedClient: Octokit | null = null;

function client(): Octokit {
  if (cachedClient) return cachedClient;
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  cachedClient = new Octokit({ auth: token, request: { fetch } });
  return cachedClient;
}

export interface GhRepoCoord {
  owner: string;
  repo: string;
}

export interface GhPullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  isDraft: boolean;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  headBranch: string | null;
  baseBranch: string | null;
  htmlUrl: string;
  requestedReviewers: string[];
  ciStatus: "success" | "failure" | "pending" | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

export interface GhWorkflowRun {
  runId: string;
  workflowName: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
  branch: string | null;
  event: string;
  actor: string | null;
  htmlUrl: string;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GhDependabotAlert {
  number: number;
  state: "open" | "fixed" | "dismissed" | "auto_dismissed";
  severity: "low" | "medium" | "high" | "critical";
  packageName: string | null;
  ecosystem: string | null;
  summary: string | null;
  htmlUrl: string;
  createdAt: string;
}

export interface GhRepoMeta {
  defaultBranch: string;
  htmlUrl: string;
  pushedAt: string | null;
}

export async function listPullRequests({ owner, repo }: GhRepoCoord): Promise<GhPullRequest[]> {
  const gh = client();
  const { data: prs } = await gh.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 50,
    sort: "updated",
    direction: "desc",
  });

  const results: GhPullRequest[] = [];
  for (const pr of prs) {
    let ciStatus: GhPullRequest["ciStatus"] = null;
    try {
      const sha = pr.head.sha;
      if (sha) {
        const { data: check } = await gh.checks.listForRef({ owner, repo, ref: sha, per_page: 1 });
        if (check.total_count > 0) {
          const runs = check.check_runs;
          if (runs.some((r) => r.conclusion === "failure")) ciStatus = "failure";
          else if (runs.some((r) => r.status !== "completed")) ciStatus = "pending";
          else if (runs.every((r) => r.conclusion === "success" || r.conclusion === "skipped" || r.conclusion === "neutral")) ciStatus = "success";
        }
      }
    } catch {
      ciStatus = null;
    }

    results.push({
      number: pr.number,
      title: pr.title,
      state: pr.merged_at ? "merged" : (pr.state as "open" | "closed"),
      isDraft: Boolean(pr.draft),
      authorLogin: pr.user?.login ?? null,
      authorAvatarUrl: pr.user?.avatar_url ?? null,
      headBranch: pr.head?.ref ?? null,
      baseBranch: pr.base?.ref ?? null,
      htmlUrl: pr.html_url,
      requestedReviewers: (pr.requested_reviewers ?? []).map((r) => r.login).filter(Boolean),
      ciStatus,
      additions: null,
      deletions: null,
      changedFiles: null,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at,
    });
  }

  return results;
}

export async function listWorkflowRuns({ owner, repo }: GhRepoCoord, limit = 30): Promise<GhWorkflowRun[]> {
  const gh = client();
  const { data } = await gh.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    per_page: limit,
  });
  return data.workflow_runs.map((run) => {
    const created = new Date(run.created_at).getTime();
    const updated = new Date(run.updated_at).getTime();
    const durationMs = run.status === "completed" ? updated - created : null;
    return {
      runId: String(run.id),
      workflowName: run.name ?? "workflow",
      status: run.status as GhWorkflowRun["status"],
      conclusion: (run.conclusion ?? null) as GhWorkflowRun["conclusion"],
      branch: run.head_branch,
      event: run.event,
      actor: run.triggering_actor?.login ?? null,
      htmlUrl: run.html_url,
      durationMs,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    };
  });
}

export async function listDependabotAlerts({ owner, repo }: GhRepoCoord): Promise<GhDependabotAlert[]> {
  const gh = client();
  try {
    const { data } = await gh.request("GET /repos/{owner}/{repo}/dependabot/alerts", {
      owner,
      repo,
      state: "open",
      per_page: 50,
    });
    return (data as Array<Record<string, unknown>>).map((alert) => {
      const dep = (alert.dependency as Record<string, unknown> | null) ?? null;
      const pkg = (dep?.package as Record<string, unknown> | null) ?? null;
      const adv = (alert.security_advisory as Record<string, unknown> | null) ?? null;
      return {
        number: Number(alert.number),
        state: alert.state as GhDependabotAlert["state"],
        severity: ((adv?.severity as string) ?? "low").toLowerCase() as GhDependabotAlert["severity"],
        packageName: (pkg?.name as string) ?? null,
        ecosystem: (pkg?.ecosystem as string) ?? null,
        summary: (adv?.summary as string) ?? null,
        htmlUrl: (alert.html_url as string) ?? "",
        createdAt: (alert.created_at as string) ?? new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export async function getRepoMeta({ owner, repo }: GhRepoCoord): Promise<GhRepoMeta | null> {
  const gh = client();
  try {
    const { data } = await gh.repos.get({ owner, repo });
    return {
      defaultBranch: data.default_branch,
      htmlUrl: data.html_url,
      pushedAt: data.pushed_at ?? null,
    };
  } catch {
    return null;
  }
}

export function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

export interface GhOrgRepo {
  id: number;
  name: string;
  owner: string;
  defaultBranch: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  htmlUrl: string;
  pushedAt: string | null;
}

export async function listOrgRepos(org: string): Promise<GhOrgRepo[]> {
  const gh = client();
  const results: GhOrgRepo[] = [];
  let page = 1;
  while (true) {
    const { data } = await gh.repos.listForOrg({
      org,
      type: "all",
      per_page: 100,
      page,
    });
    if (data.length === 0) break;
    for (const r of data) {
      results.push({
        id: r.id,
        name: r.name,
        owner: r.owner.login,
        defaultBranch: r.default_branch ?? "main",
        isPrivate: Boolean(r.private),
        isArchived: Boolean(r.archived),
        isFork: Boolean(r.fork),
        htmlUrl: r.html_url,
        pushedAt: r.pushed_at ?? null,
      });
    }
    if (data.length < 100) break;
    page++;
  }
  return results;
}

export async function getRepoById(githubId: number): Promise<GhOrgRepo | null> {
  const gh = client();
  try {
    const { data } = await gh.request("GET /repositories/{id}", { id: githubId });
    const r = data as {
      id: number; name: string; default_branch: string;
      private: boolean; archived: boolean; fork: boolean;
      html_url: string; pushed_at: string | null;
      owner: { login: string };
    };
    return {
      id: r.id,
      name: r.name,
      owner: r.owner.login,
      defaultBranch: r.default_branch ?? "main",
      isPrivate: Boolean(r.private),
      isArchived: Boolean(r.archived),
      isFork: Boolean(r.fork),
      htmlUrl: r.html_url,
      pushedAt: r.pushed_at ?? null,
    };
  } catch {
    return null;
  }
}
