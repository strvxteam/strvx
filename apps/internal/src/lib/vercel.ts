const VERCEL_API = "https://api.vercel.com";

function token(): string {
  const t = process.env.VERCEL_TOKEN;
  if (!t) throw new Error("VERCEL_TOKEN not configured");
  return t;
}

function teamQuery(): string {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `teamId=${encodeURIComponent(teamId)}` : "";
}

async function vercelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const teamParam = teamQuery();
  const url = `${VERCEL_API}${path}${teamParam ? sep + teamParam : ""}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vercel ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  gitRepoId: number | null;
  gitOwner: string | null;
  gitRepo: string | null;
  productionUrl: string | null;
}

interface RawProject {
  id: string;
  name: string;
  framework?: string | null;
  link?: {
    type?: string;
    repoId?: number;
    org?: string;
    repo?: string;
  } | null;
  targets?: { production?: { alias?: string[] } | null } | null;
}

export async function listProjects(): Promise<VercelProject[]> {
  const data = await vercelFetch<{ projects: RawProject[] }>("/v10/projects?limit=100");
  return data.projects.map((p) => ({
    id: p.id,
    name: p.name,
    framework: p.framework ?? null,
    gitRepoId: p.link?.repoId ?? null,
    gitOwner: p.link?.org ?? null,
    gitRepo: p.link?.repo ?? null,
    productionUrl: p.targets?.production?.alias?.[0] ?? null,
  }));
}

export interface VercelDeployment {
  deploymentId: string;
  url: string;
  target: "production" | "preview" | null;
  state: "READY" | "ERROR" | "BUILDING" | "QUEUED" | "CANCELED" | "INITIALIZING";
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitAuthor: string | null;
  buildDurationMs: number | null;
  createdAt: string;
  readyAt: string | null;
}

interface RawDeployment {
  uid: string;
  url: string;
  target?: string | null;
  state?: string;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitAuthorName?: string;
    gitCommitRef?: string;
    gitCommitSha?: string;
    gitCommitMessage?: string;
    gitCommitAuthorName?: string;
  };
  createdAt: number;
  ready?: number | null;
  buildingAt?: number | null;
}

export async function listDeployments(projectId: string, limit = 20): Promise<VercelDeployment[]> {
  const data = await vercelFetch<{ deployments: RawDeployment[] }>(
    `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=${limit}`,
  );
  return data.deployments.map((d) => {
    const meta = d.meta ?? {};
    const branch = meta.githubCommitRef ?? meta.gitCommitRef ?? null;
    const sha = meta.githubCommitSha ?? meta.gitCommitSha ?? null;
    const msg = meta.githubCommitMessage ?? meta.gitCommitMessage ?? null;
    const author = meta.githubCommitAuthorName ?? meta.gitCommitAuthorName ?? null;
    const buildDurationMs = d.ready && d.buildingAt ? d.ready - d.buildingAt : null;
    return {
      deploymentId: d.uid,
      url: `https://${d.url}`,
      target: (d.target ?? null) as VercelDeployment["target"],
      state: (d.state ?? "QUEUED") as VercelDeployment["state"],
      branch,
      commitSha: sha,
      commitMessage: msg,
      commitAuthor: author,
      buildDurationMs,
      createdAt: new Date(d.createdAt).toISOString(),
      readyAt: d.ready ? new Date(d.ready).toISOString() : null,
    };
  });
}

export function isVercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN);
}
