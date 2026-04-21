export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { devRepos, githubCiCache, githubPrCache } from "@strvx/db/schema";
import { and, eq } from "drizzle-orm";
import { deleteRepoByGithubId, STRVX_ORG } from "@/lib/dev-sync";
import { getRepoById } from "@/lib/github";

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type RepoPayload = {
  id: number;
  name: string;
  default_branch?: string;
  private?: boolean;
  archived?: boolean;
  fork?: boolean;
  owner?: { login: string };
};

async function upsertFromRepo(r: RepoPayload) {
  const owner = r.owner?.login ?? STRVX_ORG;
  // Look up by github_id first (stable), then fall back to (owner, repo) so we
  // can backfill github_id on rows inserted before the auto-sync rollout.
  const byId = await db.select().from(devRepos).where(eq(devRepos.githubId, r.id));
  if (byId.length > 0) {
    await db
      .update(devRepos)
      .set({
        name: r.name,
        githubOwner: owner,
        githubRepo: r.name,
        defaultBranch: r.default_branch ?? byId[0].defaultBranch,
        isPrivate: Boolean(r.private),
        isArchived: Boolean(r.archived),
        isFork: Boolean(r.fork),
      })
      .where(eq(devRepos.githubId, r.id));
    return;
  }
  const byOwnerRepo = await db
    .select()
    .from(devRepos)
    .where(and(eq(devRepos.githubOwner, owner), eq(devRepos.githubRepo, r.name)));
  if (byOwnerRepo.length > 0) {
    await db
      .update(devRepos)
      .set({
        githubId: r.id,
        name: r.name,
        defaultBranch: r.default_branch ?? byOwnerRepo[0].defaultBranch,
        isPrivate: Boolean(r.private),
        isArchived: Boolean(r.archived),
        isFork: Boolean(r.fork),
      })
      .where(eq(devRepos.id, byOwnerRepo[0].id));
    return;
  }
  await db.insert(devRepos).values({
    githubId: r.id,
    name: r.name,
    githubOwner: owner,
    githubRepo: r.name,
    defaultBranch: r.default_branch ?? "main",
    isPrivate: Boolean(r.private),
    isArchived: Boolean(r.archived),
    isFork: Boolean(r.fork),
    isActive: !r.archived,
  });
}

type WorkflowRunPayload = {
  workflow_run?: {
    id: number;
    name?: string;
    status: string;
    conclusion: string | null;
    head_branch: string | null;
    event?: string;
    actor?: { login?: string };
    html_url: string;
    run_started_at?: string;
    created_at: string;
    updated_at: string;
  };
};

async function writeWorkflowRun(repoId: string, payload: Record<string, unknown>) {
  const run = (payload as WorkflowRunPayload).workflow_run;
  if (!run) return;
  const started = run.run_started_at ? new Date(run.run_started_at).getTime() : null;
  const ended = run.status === "completed" ? new Date(run.updated_at).getTime() : null;
  const durationMs = started && ended ? ended - started : null;

  await db
    .insert(githubCiCache)
    .values({
      repoId,
      runId: String(run.id),
      workflowName: run.name ?? "unknown",
      status: run.status,
      conclusion: run.conclusion,
      branch: run.head_branch,
      event: run.event ?? null,
      actor: run.actor?.login ?? null,
      htmlUrl: run.html_url,
      durationMs,
      createdAtRemote: new Date(run.created_at),
      updatedAtRemote: new Date(run.updated_at),
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: githubCiCache.runId,
      set: {
        status: run.status,
        conclusion: run.conclusion,
        durationMs,
        updatedAtRemote: new Date(run.updated_at),
        fetchedAt: new Date(),
      },
    });
}

type PullRequestPayload = {
  pull_request?: {
    number: number;
    title: string;
    state: string;
    merged?: boolean;
    draft?: boolean;
    user?: { login?: string; avatar_url?: string };
    head?: { ref?: string };
    base?: { ref?: string };
    html_url: string;
    requested_reviewers?: Array<{ login?: string }>;
    additions?: number;
    deletions?: number;
    changed_files?: number;
    created_at: string;
    updated_at: string;
    merged_at?: string | null;
  };
};

async function writePullRequest(repoId: string, payload: Record<string, unknown>) {
  const pr = (payload as PullRequestPayload).pull_request;
  if (!pr) return;
  const state = pr.merged ? "merged" : pr.state;
  const reviewers = (pr.requested_reviewers ?? [])
    .map((r) => r.login)
    .filter((l): l is string => Boolean(l));

  await db
    .insert(githubPrCache)
    .values({
      repoId,
      number: pr.number,
      title: pr.title,
      state,
      isDraft: Boolean(pr.draft),
      authorLogin: pr.user?.login ?? null,
      authorAvatarUrl: pr.user?.avatar_url ?? null,
      headBranch: pr.head?.ref ?? null,
      baseBranch: pr.base?.ref ?? null,
      htmlUrl: pr.html_url,
      requestedReviewers: reviewers,
      ciStatus: null,
      additions: pr.additions ?? null,
      deletions: pr.deletions ?? null,
      changedFiles: pr.changed_files ?? null,
      createdAtRemote: new Date(pr.created_at),
      updatedAtRemote: new Date(pr.updated_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [githubPrCache.repoId, githubPrCache.number],
      set: {
        title: pr.title,
        state,
        isDraft: Boolean(pr.draft),
        headBranch: pr.head?.ref ?? null,
        baseBranch: pr.base?.ref ?? null,
        requestedReviewers: reviewers,
        additions: pr.additions ?? null,
        deletions: pr.deletions ?? null,
        changedFiles: pr.changed_files ?? null,
        updatedAtRemote: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        fetchedAt: new Date(),
      },
    });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event") ?? "";
  const delivery = req.headers.get("x-github-delivery") ?? "";

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const orgLogin = (payload.organization as { login?: string } | undefined)?.login
    ?? (payload.repository as { owner?: { login?: string } } | undefined)?.owner?.login
    ?? null;
  if (orgLogin && orgLogin.toLowerCase() !== STRVX_ORG.toLowerCase()) {
    return NextResponse.json({ ok: true, skipped: "not our org" });
  }

  if (event === "ping") {
    return NextResponse.json({ ok: true, delivery, pong: true });
  }

  if (event === "repository") {
    const action = payload.action as string | undefined;
    const repo = payload.repository as RepoPayload | undefined;
    if (!repo) return NextResponse.json({ ok: true, skipped: "no repo" });
    switch (action) {
      case "created":
      case "publicized":
      case "privatized":
      case "archived":
      case "unarchived":
      case "edited":
      case "renamed":
        await upsertFromRepo(repo);
        return NextResponse.json({ ok: true, action });
      case "deleted": {
        const deleted = await deleteRepoByGithubId(repo.id);
        return NextResponse.json({ ok: true, action, deleted });
      }
      case "transferred": {
        const changes = payload.changes as { owner?: { from?: { user?: { login?: string }; organization?: { login?: string } } } } | undefined;
        const fromOwner = changes?.owner?.from?.organization?.login ?? changes?.owner?.from?.user?.login;
        if (repo.owner?.login.toLowerCase() !== STRVX_ORG.toLowerCase()) {
          const deleted = await deleteRepoByGithubId(repo.id);
          return NextResponse.json({ ok: true, action, deleted, from: fromOwner });
        }
        await upsertFromRepo(repo);
        return NextResponse.json({ ok: true, action });
      }
      default:
        return NextResponse.json({ ok: true, skipped: `repository.${action ?? "unknown"}` });
    }
  }

  if (event === "meta") {
    const action = payload.action as string | undefined;
    if (action === "deleted") {
      const repoId = (payload.repository as RepoPayload | undefined)?.id;
      if (repoId) {
        const fresh = await getRepoById(repoId);
        if (!fresh) await deleteRepoByGithubId(repoId);
      }
    }
    return NextResponse.json({ ok: true, action });
  }

  if (event === "push" || event === "pull_request" || event === "workflow_run" || event === "dependabot_alert") {
    const repo = payload.repository as RepoPayload | undefined;
    let repoId: string | null = null;
    if (repo) {
      try {
        const rows = await db.select().from(devRepos).where(eq(devRepos.githubId, repo.id));
        if (rows.length === 0) {
          await upsertFromRepo(repo);
          const after = await db.select().from(devRepos).where(eq(devRepos.githubId, repo.id));
          repoId = after[0]?.id ?? null;
        } else {
          repoId = rows[0].id;
        }
      } catch (e) {
        console.error("webhooks/github passthrough upsert failed", { event, repo: repo.id, err: e instanceof Error ? e.message : String(e) });
      }
    }

    if (repoId && event === "workflow_run") {
      try {
        await writeWorkflowRun(repoId, payload);
      } catch (e) {
        console.error("webhooks/github workflow_run write failed", { err: e instanceof Error ? e.message : String(e) });
      }
    }
    if (repoId && event === "pull_request") {
      try {
        await writePullRequest(repoId, payload);
      } catch (e) {
        console.error("webhooks/github pull_request write failed", { err: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ ok: true, event, cached: true });
  }

  if (event === "organization") {
    const action = payload.action as string | undefined;
    if (action === "member_added" || action === "member_removed") {
      return NextResponse.json({ ok: true, action });
    }
  }

  return NextResponse.json({ ok: true, skipped: event });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "POST only; use /api/dev/sync-github for bootstrap." });
}
