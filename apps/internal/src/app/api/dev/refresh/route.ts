export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  devRepos,
  githubPrCache,
  vercelDeployCache,
  githubCiCache,
  dependabotAlertCache,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  listPullRequests,
  listWorkflowRuns,
  listDependabotAlerts,
  getRepoMeta,
  isGithubConfigured,
} from "@/lib/github";
import { listDeployments, isVercelConfigured } from "@/lib/vercel";

function authorized(req: NextRequest): boolean {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-refresh-secret");
  const expected = process.env.DEV_OPS_REFRESH_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return secret === expected;
}

async function refreshRepo(repo: typeof devRepos.$inferSelect) {
  const errors: string[] = [];
  const coord = { owner: repo.githubOwner, repo: repo.githubRepo };

  if (isGithubConfigured()) {
    const meta = await getRepoMeta(coord).catch((e) => {
      errors.push(`repo-meta: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    if (meta && meta.defaultBranch !== repo.defaultBranch) {
      await db
        .update(devRepos)
        .set({ defaultBranch: meta.defaultBranch })
        .where(eq(devRepos.id, repo.id));
    }

    try {
      const prs = await listPullRequests(coord);
      await db
        .delete(githubPrCache)
        .where(and(eq(githubPrCache.repoId, repo.id), eq(githubPrCache.state, "open")));
      if (prs.length > 0) {
        await db.insert(githubPrCache).values(
          prs.map((pr) => ({
            repoId: repo.id,
            number: pr.number,
            title: pr.title,
            state: pr.state,
            isDraft: pr.isDraft,
            authorLogin: pr.authorLogin,
            authorAvatarUrl: pr.authorAvatarUrl,
            headBranch: pr.headBranch,
            baseBranch: pr.baseBranch,
            htmlUrl: pr.htmlUrl,
            requestedReviewers: pr.requestedReviewers,
            ciStatus: pr.ciStatus,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changedFiles,
            createdAtRemote: new Date(pr.createdAt),
            updatedAtRemote: new Date(pr.updatedAt),
            mergedAt: pr.mergedAt ? new Date(pr.mergedAt) : null,
            fetchedAt: new Date(),
          })),
        );
      }
    } catch (e) {
      errors.push(`prs: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const runs = await listWorkflowRuns(coord, 30);
      for (const run of runs) {
        await db
          .insert(githubCiCache)
          .values({
            repoId: repo.id,
            runId: run.runId,
            workflowName: run.workflowName,
            status: run.status,
            conclusion: run.conclusion,
            branch: run.branch,
            event: run.event,
            actor: run.actor,
            htmlUrl: run.htmlUrl,
            durationMs: run.durationMs,
            createdAtRemote: new Date(run.createdAt),
            updatedAtRemote: new Date(run.updatedAt),
            fetchedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: githubCiCache.runId,
            set: {
              status: run.status,
              conclusion: run.conclusion,
              durationMs: run.durationMs,
              updatedAtRemote: new Date(run.updatedAt),
              fetchedAt: new Date(),
            },
          });
      }
      await db.execute(
        sql`DELETE FROM github_ci_cache WHERE repo_id = ${repo.id} AND id NOT IN (SELECT id FROM github_ci_cache WHERE repo_id = ${repo.id} ORDER BY created_at_remote DESC LIMIT 50)`,
      );
    } catch (e) {
      errors.push(`runs: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const alerts = await listDependabotAlerts(coord);
      await db.delete(dependabotAlertCache).where(eq(dependabotAlertCache.repoId, repo.id));
      if (alerts.length > 0) {
        await db.insert(dependabotAlertCache).values(
          alerts.map((a) => ({
            repoId: repo.id,
            alertNumber: a.number,
            state: a.state,
            severity: a.severity,
            packageName: a.packageName,
            ecosystem: a.ecosystem,
            summary: a.summary,
            htmlUrl: a.htmlUrl,
            createdAtRemote: new Date(a.createdAt),
            fetchedAt: new Date(),
          })),
        );
      }
    } catch (e) {
      errors.push(`alerts: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    errors.push("github: GITHUB_TOKEN not configured");
  }

  if (isVercelConfigured() && repo.vercelProjectId) {
    try {
      const deployments = await listDeployments(repo.vercelProjectId, 20);
      for (const d of deployments) {
        await db
          .insert(vercelDeployCache)
          .values({
            repoId: repo.id,
            deploymentId: d.deploymentId,
            url: d.url,
            target: d.target,
            state: d.state,
            branch: d.branch,
            commitSha: d.commitSha,
            commitMessage: d.commitMessage,
            commitAuthor: d.commitAuthor,
            buildDurationMs: d.buildDurationMs,
            createdAtRemote: new Date(d.createdAt),
            readyAt: d.readyAt ? new Date(d.readyAt) : null,
            fetchedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: vercelDeployCache.deploymentId,
            set: {
              state: d.state,
              readyAt: d.readyAt ? new Date(d.readyAt) : null,
              buildDurationMs: d.buildDurationMs,
              fetchedAt: new Date(),
            },
          });
      }
      await db.execute(
        sql`DELETE FROM vercel_deploy_cache WHERE repo_id = ${repo.id} AND id NOT IN (SELECT id FROM vercel_deploy_cache WHERE repo_id = ${repo.id} ORDER BY created_at_remote DESC LIMIT 50)`,
      );
    } catch (e) {
      errors.push(`deploys: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await db
    .update(devRepos)
    .set({
      lastRefreshedAt: new Date(),
      lastRefreshError: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
    })
    .where(eq(devRepos.id, repo.id));

  return { repoId: repo.id, name: repo.name, errors };
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repos = await db
    .select()
    .from(devRepos)
    .where(eq(devRepos.isActive, true));

  const results = [];
  for (const repo of repos) {
    results.push(await refreshRepo(repo));
  }

  return NextResponse.json({
    ok: true,
    refreshed: results.length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
