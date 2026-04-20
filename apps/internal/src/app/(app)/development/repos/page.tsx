import type { Metadata } from "next";
import { db } from "@/lib/db";
import { devRepos, devVercelProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import ReposClient from "./repos-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Repos" };

export default async function ReposPage() {
  const [repos, links] = await Promise.all([
    db.select().from(devRepos).orderBy(devRepos.name),
    db.select().from(devVercelProjects),
  ]);
  const linksByRepo = new Map<string, typeof links>();
  for (const l of links) {
    const bucket = linksByRepo.get(l.devRepoId) ?? [];
    bucket.push(l);
    linksByRepo.set(l.devRepoId, bucket);
  }

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
        vercelProjects: (linksByRepo.get(r.id) ?? []).map((l) => ({
          id: l.id,
          name: l.name,
          productionUrl: l.productionUrl,
        })),
        color: r.color,
        isActive: r.isActive,
        lastRefreshedAt: r.lastRefreshedAt?.toISOString() ?? null,
        lastRefreshError: r.lastRefreshError,
      }))}
    />
  );
}
