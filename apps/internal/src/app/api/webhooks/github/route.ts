export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { devRepos } from "@strvx/db/schema";
import { eq } from "drizzle-orm";
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
  const existing = await db.select().from(devRepos).where(eq(devRepos.githubId, r.id));
  if (existing.length === 0) {
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
  } else {
    await db
      .update(devRepos)
      .set({
        name: r.name,
        githubOwner: owner,
        githubRepo: r.name,
        defaultBranch: r.default_branch ?? existing[0].defaultBranch,
        isPrivate: Boolean(r.private),
        isArchived: Boolean(r.archived),
        isFork: Boolean(r.fork),
      })
      .where(eq(devRepos.githubId, r.id));
  }
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
    if (repo) {
      const rows = await db.select().from(devRepos).where(eq(devRepos.githubId, repo.id));
      if (rows.length === 0) {
        await upsertFromRepo(repo);
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
