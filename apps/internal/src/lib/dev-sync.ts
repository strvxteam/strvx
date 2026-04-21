import { db } from "@/lib/db";
import { devRepos, devVercelProjects, monitoredSites } from "@strvx/db/schema";
import { eq, inArray } from "drizzle-orm";
import { listOrgRepos, type GhOrgRepo } from "./github";
import {
  listProjects,
  type VercelProject,
  isVercelConfigured,
} from "./vercel";

export const STRVX_ORG = process.env.GITHUB_ORG ?? "strvxteam";

// Classify a GitHub repo (auto-synced from strvxteam) into a monitored_sites.type.
// strvx  — the strvx app/site itself (the monorepo)
// demo   — demos by pattern (demo-*) or internal product showcases (custos)
// client — everything else (client projects)
export function classifySite(githubRepo: string): "strvx" | "client" | "demo" {
  const r = githubRepo.toLowerCase();
  if (r.startsWith("demo-") || r === "custos") return "demo";
  if (r === "strvx" || r === "strvx-internal-tool") return "strvx";
  return "client";
}

export interface GithubSyncResult {
  org: string;
  total: number;
  inserted: number;
  updated: number;
  renamed: number;
  deleted: number;
  backfilled: number;
  errors: string[];
}

export async function syncGithubRepos(): Promise<GithubSyncResult> {
  const result: GithubSyncResult = {
    org: STRVX_ORG,
    total: 0,
    inserted: 0,
    updated: 0,
    renamed: 0,
    deleted: 0,
    backfilled: 0,
    errors: [],
  };

  let remote: GhOrgRepo[];
  try {
    remote = await listOrgRepos(STRVX_ORG);
  } catch (e) {
    result.errors.push(`listOrgRepos: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }
  result.total = remote.length;

  const existing = await db.select().from(devRepos);
  const byGithubId = new Map<number, typeof existing[number]>();
  const byOwnerRepo = new Map<string, typeof existing[number]>();
  for (const row of existing) {
    if (row.githubId != null) byGithubId.set(row.githubId, row);
    byOwnerRepo.set(`${row.githubOwner}/${row.githubRepo}`, row);
  }

  const remoteIds = new Set<number>();
  for (const r of remote) {
    remoteIds.add(r.id);
    let existingRow = byGithubId.get(r.id);

    if (!existingRow) {
      const ownerRepoKey = `${r.owner}/${r.name}`;
      const orphan = byOwnerRepo.get(ownerRepoKey);
      if (orphan && orphan.githubId == null) {
        existingRow = orphan;
        await db
          .update(devRepos)
          .set({ githubId: r.id })
          .where(eq(devRepos.id, orphan.id));
        result.backfilled++;
      }
    }

    if (!existingRow) {
      try {
        await db.insert(devRepos).values({
          githubId: r.id,
          name: r.name,
          githubOwner: r.owner,
          githubRepo: r.name,
          defaultBranch: r.defaultBranch,
          isPrivate: r.isPrivate,
          isArchived: r.isArchived,
          isFork: r.isFork,
          isActive: !r.isArchived,
        });
        result.inserted++;
      } catch (e) {
        result.errors.push(`insert ${r.owner}/${r.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    const renamed =
      existingRow.githubOwner !== r.owner ||
      existingRow.githubRepo !== r.name ||
      existingRow.name !== r.name;
    const metaChanged =
      existingRow.defaultBranch !== r.defaultBranch ||
      existingRow.isPrivate !== r.isPrivate ||
      existingRow.isArchived !== r.isArchived ||
      existingRow.isFork !== r.isFork;

    if (renamed || metaChanged) {
      await db
        .update(devRepos)
        .set({
          name: r.name,
          githubOwner: r.owner,
          githubRepo: r.name,
          defaultBranch: r.defaultBranch,
          isPrivate: r.isPrivate,
          isArchived: r.isArchived,
          isFork: r.isFork,
        })
        .where(eq(devRepos.id, existingRow.id));
      if (renamed) result.renamed++;
      else result.updated++;
    }
  }

  const toDelete = existing.filter((row) => row.githubId != null && !remoteIds.has(row.githubId));
  const toDeleteByOwnerRepo = existing.filter(
    (row) => row.githubId == null && row.githubOwner === STRVX_ORG && !remote.some((r) => r.name === row.githubRepo),
  );
  const deleteIds = [...toDelete, ...toDeleteByOwnerRepo].map((r) => r.id);
  if (deleteIds.length > 0) {
    await db.delete(devRepos).where(inArray(devRepos.id, deleteIds));
    result.deleted = deleteIds.length;
  }

  return result;
}

export interface VercelSyncResult {
  total: number;
  linked: number;
  unlinked: number;
  sitesUpserted: number;
  sitesRemoved: number;
  errors: string[];
}

function extractGitMeta(project: VercelProject): { owner: string; repo: string } | null {
  if (project.gitOwner && project.gitRepo) {
    return { owner: project.gitOwner, repo: project.gitRepo };
  }
  return null;
}

export async function syncVercelProjects(): Promise<VercelSyncResult> {
  const result: VercelSyncResult = {
    total: 0,
    linked: 0,
    unlinked: 0,
    sitesUpserted: 0,
    sitesRemoved: 0,
    errors: [],
  };

  if (!isVercelConfigured()) {
    result.errors.push("VERCEL_TOKEN not configured");
    return result;
  }

  let projects: VercelProject[];
  try {
    projects = await listProjects();
  } catch (e) {
    result.errors.push(`listProjects: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }
  result.total = projects.length;

  const repos = await db.select().from(devRepos);
  const reposByOwnerName = new Map<string, typeof repos[number]>();
  for (const r of repos) {
    reposByOwnerName.set(`${r.githubOwner.toLowerCase()}/${r.githubRepo.toLowerCase()}`, r);
  }

  const existingLinks = await db.select().from(devVercelProjects);
  const linkByProjectId = new Map<string, typeof existingLinks[number]>();
  for (const l of existingLinks) linkByProjectId.set(l.vercelProjectId, l);

  const vercelIdsSeen = new Set<string>();

  for (const project of projects) {
    vercelIdsSeen.add(project.id);
    const meta = extractGitMeta(project);
    if (!meta) continue;
    const match = reposByOwnerName.get(`${meta.owner.toLowerCase()}/${meta.repo.toLowerCase()}`);
    if (!match) continue;

    const productionUrl = project.productionUrl
      ? (project.productionUrl.startsWith("http") ? project.productionUrl : `https://${project.productionUrl}`)
      : null;

    const existing = linkByProjectId.get(project.id);
    let monitoredSiteId = existing?.monitoredSiteId ?? null;
    const siteType = classifySite(match.githubRepo);

    if (productionUrl) {
      const existingSite = monitoredSiteId
        ? (await db.select().from(monitoredSites).where(eq(monitoredSites.id, monitoredSiteId)))[0]
        : undefined;
      if (existingSite) {
        if (existingSite.url !== productionUrl || existingSite.name !== project.name || existingSite.type !== siteType) {
          await db
            .update(monitoredSites)
            .set({ url: productionUrl, name: project.name, type: siteType })
            .where(eq(monitoredSites.id, existingSite.id));
          result.sitesUpserted++;
        }
      } else {
        const existingByUrl = await db
          .select()
          .from(monitoredSites)
          .where(eq(monitoredSites.url, productionUrl));
        if (existingByUrl.length > 0) {
          monitoredSiteId = existingByUrl[0].id;
          if (existingByUrl[0].type !== siteType) {
            await db
              .update(monitoredSites)
              .set({ type: siteType })
              .where(eq(monitoredSites.id, existingByUrl[0].id));
          }
        } else {
          const [inserted] = await db
            .insert(monitoredSites)
            .values({ name: project.name, url: productionUrl, type: siteType, isActive: true })
            .returning({ id: monitoredSites.id });
          monitoredSiteId = inserted.id;
          result.sitesUpserted++;
        }
      }
    }

    if (existing) {
      const changed =
        existing.devRepoId !== match.id ||
        existing.name !== project.name ||
        existing.productionUrl !== productionUrl ||
        existing.monitoredSiteId !== monitoredSiteId;
      if (changed) {
        await db
          .update(devVercelProjects)
          .set({
            devRepoId: match.id,
            name: project.name,
            productionUrl,
            monitoredSiteId,
          })
          .where(eq(devVercelProjects.id, existing.id));
        result.linked++;
      }
    } else {
      await db.insert(devVercelProjects).values({
        devRepoId: match.id,
        vercelProjectId: project.id,
        name: project.name,
        productionUrl,
        monitoredSiteId,
      });
      result.linked++;
    }
  }

  // Remove dev_vercel_projects rows whose Vercel project no longer exists.
  const stale = existingLinks.filter((l) => !vercelIdsSeen.has(l.vercelProjectId));
  for (const link of stale) {
    if (link.monitoredSiteId) {
      await db.delete(monitoredSites).where(eq(monitoredSites.id, link.monitoredSiteId));
      result.sitesRemoved++;
    }
    await db.delete(devVercelProjects).where(eq(devVercelProjects.id, link.id));
    result.unlinked++;
  }

  return result;
}

export async function deleteRepoByGithubId(githubId: number): Promise<boolean> {
  const [row] = await db
    .select()
    .from(devRepos)
    .where(eq(devRepos.githubId, githubId));
  if (!row) return false;
  // Collect monitored_sites pointed at by any dev_vercel_projects under this repo,
  // delete them before the repo row cascades. (The cascade drops dev_vercel_projects,
  // but leaves orphan monitored_sites unless we clear them first.)
  const links = await db
    .select({ monitoredSiteId: devVercelProjects.monitoredSiteId })
    .from(devVercelProjects)
    .where(eq(devVercelProjects.devRepoId, row.id));
  const siteIds = links.map((l) => l.monitoredSiteId).filter((x): x is string => Boolean(x));
  if (siteIds.length > 0) {
    await db.delete(monitoredSites).where(inArray(monitoredSites.id, siteIds));
  }
  await db.delete(devRepos).where(eq(devRepos.id, row.id));
  return true;
}

export async function unlinkVercelProject(vercelProjectId: string): Promise<boolean> {
  const [link] = await db
    .select()
    .from(devVercelProjects)
    .where(eq(devVercelProjects.vercelProjectId, vercelProjectId));
  if (!link) return false;
  if (link.monitoredSiteId) {
    await db.delete(monitoredSites).where(eq(monitoredSites.id, link.monitoredSiteId));
  }
  await db.delete(devVercelProjects).where(eq(devVercelProjects.id, link.id));
  return true;
}
