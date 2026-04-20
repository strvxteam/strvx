import type { Metadata } from "next";
import { db } from "@/lib/db";
import { devRepos } from "@/lib/db/schema";
import ReposClient from "./repos-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Repos" };

export default async function ReposPage() {
  const repos = await db.select().from(devRepos).orderBy(devRepos.name);

  return (
    <ReposClient
      repos={repos.map((r) => ({
        id: r.id,
        name: r.name,
        githubOwner: r.githubOwner,
        githubRepo: r.githubRepo,
        defaultBranch: r.defaultBranch,
        isPrivate: r.isPrivate,
        isArchived: r.isArchived,
        isFork: r.isFork,
        vercelProjectId: r.vercelProjectId,
        vercelProductionUrl: r.vercelProductionUrl,
        color: r.color,
        isActive: r.isActive,
        lastRefreshedAt: r.lastRefreshedAt?.toISOString() ?? null,
        lastRefreshError: r.lastRefreshError,
      }))}
    />
  );
}
