"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ChevronDown, CheckCircle2, XCircle } from "lucide-react";
import type {
  DbHealth,
  TableStats,
  MigrationStatus,
  ActivityRow,
} from "@/lib/db-stats";

type ActivityResult =
  | { enabled: true; rows: ActivityRow[] }
  | { enabled: false; reason: string };

export default function DatabaseClient({
  health,
  tables,
  migrations,
  activity,
}: {
  health: DbHealth;
  tables: TableStats[];
  migrations: MigrationStatus[];
  activity: ActivityResult;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const refresh = () => startTransition(() => router.refresh());

  const sectionHeader = (key: string, label: string, tail?: React.ReactNode) => {
    const isCollapsed = collapsed.has(key);
    return (
      <button
        type="button"
        onClick={() => toggle(key)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 12, background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#333", textTransform: "uppercase", letterSpacing: 0.4 }}>
          <ChevronDown size={14} style={{ transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "none", color: "#888" }} />
          {label}
        </span>
        {tail && <span style={{ fontSize: 11, color: "#888" }}>{tail}</span>}
      </button>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Database</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            Supabase Postgres — live stats
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 8, border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#333", padding: "7px 14px", fontSize: 13, fontWeight: 500, opacity: isPending ? 0.6 : 1 }}
        >
          <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
          {isPending ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Panel 1 — Health */}
      <div style={{ marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <HealthCard
          label="Status"
          value={health.reachable ? "Reachable" : "Unreachable"}
          valueColor={health.reachable ? "#16a34a" : "#dc2626"}
          icon={health.reachable ? <CheckCircle2 size={16} color="#16a34a" /> : <XCircle size={16} color="#dc2626" />}
          sub={health.errorMessage ?? undefined}
        />
        <HealthCard label="Ping" value={health.pingMs != null ? `${health.pingMs} ms` : "—"} />
        <HealthCard label="DB size" value={health.totalSizePretty} sub={health.totalSizeBytes > 0 ? `${health.totalSizeBytes.toLocaleString()} bytes` : undefined} />
        <HealthCard label="Active connections" value={String(health.activeConnections)} />
      </div>

      {/* Panel 2 — Top tables */}
      <div style={{ marginBottom: 24 }}>
        {sectionHeader("tables", "Top 10 tables by size", `${tables.length} shown`)}
        {!collapsed.has("tables") && (
          <div style={{ borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fff", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 80px 110px 110px 1fr", gap: 12, padding: "10px 14px", borderBottom: "1px solid #f0f0f0", fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.3 }}>
              <span>Table</span>
              <span style={{ textAlign: "right" }}>Rows</span>
              <span style={{ textAlign: "right" }}>Total</span>
              <span style={{ textAlign: "right" }}>Indexes</span>
              <span>Last vacuum</span>
            </div>
            {tables.map((t) => (
              <div key={`${t.schema}.${t.name}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 80px 110px 110px 1fr", gap: 12, padding: "10px 14px", borderBottom: "1px solid #f5f5f5", fontSize: 13, alignItems: "center" }}>
                <span style={{ color: "#111", fontFamily: "ui-monospace,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.schema === "public" ? t.name : `${t.schema}.${t.name}`}</span>
                <span style={{ textAlign: "right", color: "#333" }}>{t.rows.toLocaleString()}</span>
                <span style={{ textAlign: "right", color: "#333" }}>{t.totalSizePretty}</span>
                <span style={{ textAlign: "right", color: "#555" }}>{t.indexSizePretty}</span>
                <span style={{ color: "#888", fontSize: 12 }}>{formatTs(t.lastVacuum ?? t.lastAutovacuum)}</span>
              </div>
            ))}
            {tables.length === 0 && <p style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>No user tables found.</p>}
          </div>
        )}
      </div>

      {/* Panel 3 — Migrations */}
      <div style={{ marginBottom: 24 }}>
        {sectionHeader("migrations", "Migrations", `${migrations.length} files`)}
        {!collapsed.has("migrations") && (
          <div style={{ borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fff", overflow: "hidden" }}>
            {migrations.map((m) => (
              <div key={m.filename} style={{ display: "flex", padding: "10px 14px", borderBottom: "1px solid #f5f5f5", fontSize: 13, fontFamily: "ui-monospace,monospace", color: "#333" }}>
                {m.filename}
              </div>
            ))}
            <p style={{ padding: "10px 14px", fontSize: 11, color: "#888" }}>
              Files in <code>packages/db/drizzle/</code>. Apply new ones via <code>psql $DATABASE_URL -f &lt;file&gt;</code> before deploying code that depends on them.
            </p>
          </div>
        )}
      </div>

      {/* Panel 4 — Activity */}
      <div style={{ marginBottom: 24 }}>
        {sectionHeader("activity", "Top queries (by total time)", activity.enabled ? `${activity.rows.length} rows` : "disabled")}
        {!collapsed.has("activity") && (
          <div style={{ borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fff", overflow: "hidden" }}>
            {!activity.enabled ? (
              <p style={{ padding: 16, fontSize: 13, color: "#888" }}>
                {activity.reason}. Enable with <code style={{ fontFamily: "ui-monospace,monospace" }}>CREATE EXTENSION pg_stat_statements;</code> in the Supabase SQL editor.
              </p>
            ) : activity.rows.length === 0 ? (
              <p style={{ padding: 16, fontSize: 13, color: "#888" }}>No recorded queries yet.</p>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 100px 100px 70px", gap: 12, padding: "10px 14px", borderBottom: "1px solid #f0f0f0", fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.3 }}>
                  <span>Query</span>
                  <span style={{ textAlign: "right" }}>Calls</span>
                  <span style={{ textAlign: "right" }}>Total</span>
                  <span style={{ textAlign: "right" }}>Mean</span>
                  <span style={{ textAlign: "right" }}>Rows</span>
                </div>
                {activity.rows.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 70px 100px 100px 70px", gap: 12, padding: "10px 14px", borderBottom: "1px solid #f5f5f5", fontSize: 12, alignItems: "center" }}>
                    <code style={{ fontFamily: "ui-monospace,monospace", color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.query}</code>
                    <span style={{ textAlign: "right", color: "#333" }}>{r.calls.toLocaleString()}</span>
                    <span style={{ textAlign: "right", color: "#333" }}>{formatMs(r.totalTimeMs)}</span>
                    <span style={{ textAlign: "right", color: "#555" }}>{r.meanTimeMs.toFixed(2)} ms</span>
                    <span style={{ textAlign: "right", color: "#888" }}>{r.rows.toLocaleString()}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HealthCard({ label, value, valueColor, sub, icon }: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fff", padding: 16 }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</p>
      <p style={{ marginTop: 6, fontSize: 20, fontWeight: 600, color: valueColor ?? "#222", display: "flex", alignItems: "center", gap: 6 }}>
        {icon}
        {value}
      </p>
      {sub && <p style={{ marginTop: 4, fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>}
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60000).toFixed(1)} m`;
}

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const ageMs = Date.now() - d.getTime();
  const ageH = ageMs / 3600000;
  if (ageH < 1) return "< 1h ago";
  if (ageH < 24) return `${Math.round(ageH)}h ago`;
  return `${Math.round(ageH / 24)}d ago`;
}
