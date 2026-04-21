const MGMT_API = "https://api.supabase.com";

function token(): string {
  const t = process.env.SUPABASE_ACCESS_TOKEN;
  if (!t) throw new Error("SUPABASE_ACCESS_TOKEN not configured");
  return t;
}

export function isSupabaseMgmtConfigured(): boolean {
  return Boolean(process.env.SUPABASE_ACCESS_TOKEN);
}

async function mgmtFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MGMT_API}${path}`, {
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
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface SbProject {
  ref: string;
  name: string;
  region: string;
  status: string;
  dbVersion?: string;
  createdAt?: string;
}

export async function listSupabaseProjects(): Promise<SbProject[]> {
  type Raw = { id: string; name: string; region: string; status: string; created_at?: string; database?: { version?: string } };
  const raw = await mgmtFetch<Raw[]>("/v1/projects");
  return raw.map((p) => ({
    ref: p.id,
    name: p.name,
    region: p.region,
    status: p.status,
    dbVersion: p.database?.version,
    createdAt: p.created_at,
  }));
}

export interface SbProjectStats {
  sizeBytes: number;
  sizePretty: string;
  activeConnections: number;
  tableCount: number;
  pingMs: number;
}

export async function getSupabaseProjectStats(ref: string): Promise<SbProjectStats> {
  const start = Date.now();
  type QRow = {
    size_bytes: string | number;
    size_pretty: string;
    active_connections: string | number;
    table_count: string | number;
  };
  const rows = await mgmtFetch<QRow[]>(`/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({
      query: `
        SELECT
          pg_database_size(current_database()) AS size_bytes,
          pg_size_pretty(pg_database_size(current_database())) AS size_pretty,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
          (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS table_count
      `,
    }),
  });
  const pingMs = Date.now() - start;
  const r = rows[0];
  return {
    sizeBytes: Number(r.size_bytes),
    sizePretty: String(r.size_pretty),
    activeConnections: Number(r.active_connections),
    tableCount: Number(r.table_count),
    pingMs,
  };
}
