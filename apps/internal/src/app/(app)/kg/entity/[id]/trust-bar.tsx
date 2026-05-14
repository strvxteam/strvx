import { ShieldCheck, AlertTriangle, Clock, GitBranch } from "lucide-react";

interface Props {
  trustScore?: number;
  confidence?: number;
  lastValidatedAt?: string;
  extractionMethod?: string;
  createdBy?: string;
  validationCount?: number;
}

export function TrustBar({
  trustScore,
  confidence,
  lastValidatedAt,
  extractionMethod,
  createdBy,
  validationCount,
}: Props) {
  // Only render if we have something signal-worthy.
  if (
    trustScore === undefined &&
    confidence === undefined &&
    lastValidatedAt === undefined &&
    extractionMethod === undefined
  ) {
    return null;
  }

  const trust = trustScore ?? confidence ?? null;
  const trustChip = trust !== null ? trustLevel(trust) : null;
  const freshness = lastValidatedAt ? formatRelative(lastValidatedAt) : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginTop: 12,
        marginBottom: 16,
        padding: "8px 12px",
        background: "#f8fafc",
        border: "1px solid #eee",
        borderRadius: 8,
        fontSize: 12,
        color: "#555",
      }}
    >
      {trustChip ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 999,
            background: trustChip.bg,
            color: trustChip.fg,
            fontWeight: 600,
          }}
        >
          {trustChip.icon}
          {trustChip.label} · {(trust as number).toFixed(2)}
        </span>
      ) : null}
      {freshness ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Clock size={11} /> validated {freshness}
        </span>
      ) : null}
      {extractionMethod ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <GitBranch size={11} /> via {extractionMethod}
          {createdBy ? ` (${createdBy})` : ""}
        </span>
      ) : null}
      {validationCount !== undefined && validationCount > 0 ? (
        <span>· seen {validationCount}× across sources</span>
      ) : null}
    </div>
  );
}

function trustLevel(score: number): {
  fg: string;
  bg: string;
  label: string;
  icon: React.ReactNode;
} {
  if (score >= 0.7) {
    return {
      fg: "#15803d",
      bg: "#dcfce7",
      label: "High trust",
      icon: <ShieldCheck size={11} />,
    };
  }
  if (score >= 0.4) {
    return {
      fg: "#b45309",
      bg: "#fef3c7",
      label: "Medium trust",
      icon: <AlertTriangle size={11} />,
    };
  }
  return {
    fg: "#b91c1c",
    bg: "#fee2e2",
    label: "Low trust",
    icon: <AlertTriangle size={11} />,
  };
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const day = 86400_000;
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / 3600_000)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / (7 * day))}w ago`;
  return `${Math.floor(diffMs / (30 * day))}mo ago`;
}
