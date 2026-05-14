import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { labelCounts, loadGraph } from "@/lib/kg/queries";
import { GraphCanvas } from "./graph-canvas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Graph — KG" };

interface GraphPageProps {
  searchParams: Promise<{ labels?: string; limit?: string }>;
}

const DEFAULT_LABELS = ["Person", "Organization", "Engagement", "Note", "Decision", "Task"];
const AVAILABLE_LABELS = ["Person", "Organization", "Engagement", "Note", "Decision", "Task", "Interaction"];

export default async function GraphPage({ searchParams }: GraphPageProps) {
  const { labels: rawLabels, limit: rawLimit } = await searchParams;
  const selected = (rawLabels ?? DEFAULT_LABELS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter((l) => AVAILABLE_LABELS.includes(l));
  const labels = selected.length > 0 ? selected : DEFAULT_LABELS;
  const limit = Math.max(20, Math.min(500, parseInt(rawLimit ?? "150", 10) || 150));

  let payload: Awaited<ReturnType<typeof loadGraph>> = { nodes: [], edges: [] };
  let loadError: string | null = null;
  let counts: Array<{ label: string; count: number }> = [];

  try {
    [payload, counts] = await Promise.all([
      loadGraph({ labels, limit }),
      labelCounts(),
    ]);
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 96px)" }}>
      <Link
        href="/kg"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "#555",
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} /> Knowledge Graph
      </Link>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Graph</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {payload.nodes.length} nodes · {payload.edges.length} edges
          </p>
        </div>
        <LabelFilters selected={labels} counts={counts} limit={limit} />
      </div>

      {loadError ? (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            padding: "12px 14px",
            fontSize: 13,
            color: "#7f1d1d",
          }}
        >
          {loadError}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 10,
            border: "1px solid #e0e0e0",
            background: "#fafafa",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <GraphCanvas nodes={payload.nodes} edges={payload.edges} />
          <Legend />
        </div>
      )}
    </div>
  );
}

function LabelFilters({
  selected,
  counts,
  limit,
}: {
  selected: string[];
  counts: Array<{ label: string; count: number }>;
  limit: number;
}) {
  const countMap = new Map(counts.map((c) => [c.label, c.count]));
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {AVAILABLE_LABELS.map((label) => {
        const isOn = selected.includes(label);
        const nextLabels = isOn ? selected.filter((l) => l !== label) : [...selected, label];
        const href = `/kg/graph?labels=${encodeURIComponent(nextLabels.join(","))}&limit=${limit}`;
        const count = countMap.get(label);
        return (
          <Link
            key={label}
            href={href}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: isOn ? "1px solid #111" : "1px solid #e0e0e0",
              background: isOn ? "#111" : "#fff",
              color: isOn ? "#fff" : "#555",
              fontSize: 12,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {label}
            {count !== undefined ? (
              <span style={{ fontSize: 11, opacity: 0.7 }}>{count}</span>
            ) : null}
          </Link>
        );
      })}
      <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>limit {limit}</span>
    </div>
  );
}

function Legend() {
  const palette: Record<string, string> = {
    Person: "#1a73e8",
    Organization: "#0e7490",
    Note: "#7c3aed",
    Engagement: "#15803d",
    Decision: "#b45309",
    Task: "#ea580c",
    Interaction: "#0891b2",
  };
  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        background: "rgba(255,255,255,0.95)",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: "8px 12px",
        display: "flex",
        gap: 12,
        fontSize: 11,
        color: "#555",
        flexWrap: "wrap",
        maxWidth: 480,
      }}
    >
      {Object.entries(palette).map(([label, color]) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 999,
              background: color,
            }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
