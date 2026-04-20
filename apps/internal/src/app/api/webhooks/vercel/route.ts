export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { devVercelProjects, vercelDeployCache } from "@strvx/db/schema";
import { eq } from "drizzle-orm";
import { syncVercelProjects, unlinkVercelProject } from "@/lib/dev-sync";

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature) return false;
  const expected = crypto.createHmac("sha1", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type DeploymentPayload = {
  id?: string;
  uid?: string;
  url?: string;
  target?: string | null;
  state?: string;
  name?: string;
  meta?: Record<string, string | undefined>;
  createdAt?: number;
  readyAt?: number | null;
  buildingAt?: number | null;
  project?: { id?: string };
  projectId?: string;
};

type ProjectPayload = {
  id?: string;
  name?: string;
};

async function upsertDeployment(d: DeploymentPayload) {
  const deploymentId = d.uid ?? d.id;
  const projectId = d.projectId ?? d.project?.id;
  if (!deploymentId || !projectId) return;

  const [link] = await db
    .select()
    .from(devVercelProjects)
    .where(eq(devVercelProjects.vercelProjectId, projectId));
  if (!link) return;

  const meta = d.meta ?? {};
  const branch = meta.githubCommitRef ?? meta.gitCommitRef ?? null;
  const sha = meta.githubCommitSha ?? meta.gitCommitSha ?? null;
  const message = meta.githubCommitMessage ?? meta.gitCommitMessage ?? null;
  const author = meta.githubCommitAuthorName ?? meta.gitCommitAuthorName ?? null;
  const createdAt = d.createdAt ? new Date(d.createdAt) : new Date();
  const readyAt = d.readyAt ? new Date(d.readyAt) : null;
  const buildDurationMs = d.readyAt && d.buildingAt ? d.readyAt - d.buildingAt : null;
  const state = (d.state ?? "QUEUED").toUpperCase();

  await db
    .insert(vercelDeployCache)
    .values({
      repoId: link.devRepoId,
      devVercelProjectId: link.id,
      deploymentId,
      url: d.url ? (d.url.startsWith("http") ? d.url : `https://${d.url}`) : "",
      target: (d.target ?? null) as string | null,
      state,
      branch,
      commitSha: sha,
      commitMessage: message,
      commitAuthor: author,
      buildDurationMs,
      createdAtRemote: createdAt,
      readyAt,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: vercelDeployCache.deploymentId,
      set: {
        devVercelProjectId: link.id,
        state,
        readyAt,
        buildDurationMs,
        fetchedAt: new Date(),
      },
    });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-vercel-signature");
  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: { type?: string; payload?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const type = event.type ?? "";
  const payload = event.payload ?? {};

  if (type.startsWith("deployment.")) {
    const deployment = (payload.deployment ?? payload) as DeploymentPayload;
    await upsertDeployment(deployment);
    return NextResponse.json({ ok: true, type });
  }

  if (type === "project.created") {
    await syncVercelProjects();
    return NextResponse.json({ ok: true, type });
  }

  if (type === "project.removed") {
    const project = (payload.project ?? payload) as ProjectPayload;
    if (project.id) {
      const unlinked = await unlinkVercelProject(project.id);
      return NextResponse.json({ ok: true, type, unlinked });
    }
    return NextResponse.json({ ok: true, skipped: "no project id" });
  }

  if (type === "project.updated" || type === "integration-configuration.removed") {
    await syncVercelProjects();
    return NextResponse.json({ ok: true, type });
  }

  return NextResponse.json({ ok: true, skipped: type });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "POST only; use /api/dev/sync-vercel for bootstrap." });
}
