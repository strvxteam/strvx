import type { Metadata } from "next";
import { db } from "@/lib/db";
import { devRepos, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import ReposClient from "./repos-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Repos" };

export default async function ReposPage() {
  const [repos, userRows] = await Promise.all([
    db.select().from(devRepos).orderBy(devRepos.name),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
  ]);

  return (
    <ReposClient
      repos={repos.map((r) => ({
        id: r.id,
        name: r.name,
        githubOwner: r.githubOwner,
        githubRepo: r.githubRepo,
        defaultBranch: r.defaultBranch,
        vercelProjectId: r.vercelProjectId,
        ownerUserId: r.ownerUserId,
        color: r.color,
        isActive: r.isActive,
        lastRefreshedAt: r.lastRefreshedAt?.toISOString() ?? null,
        lastRefreshError: r.lastRefreshError,
      }))}
      teamMembers={userRows}
    />
  );
}
