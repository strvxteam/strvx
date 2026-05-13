import Link from "next/link";
import type { HygieneFlagRow } from "../_queries";
import { FlagActionButton } from "./row-actions";

const KIND_LABEL: Record<HygieneFlagRow["kind"], string> = {
  domain_mismatch: "Domain mismatch",
  stale_engagement: "Stale engagement",
  duplicate_company: "Duplicate company",
  stage_advancement_suggested: "Stage advancement",
};

const KIND_COLOR: Record<HygieneFlagRow["kind"], { bg: string; fg: string }> = {
  domain_mismatch: { bg: "#fef3e2", fg: "#7c4a00" },
  stale_engagement: { bg: "#fde8e8", fg: "#7c1c14" },
  duplicate_company: { bg: "#e8f0fe", fg: "#1a73e8" },
  stage_advancement_suggested: { bg: "#e8f5e9", fg: "#1b5e20" },
};

/**
 * Generic row for hygiene flags (excluding stage-advancement, which has its
 * own component below to render the from→to transition + thread link).
 */
export function HygieneFlagRowView({ row }: { row: HygieneFlagRow }) {
  const color = KIND_COLOR[row.kind];
  return (
    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
      <td className="py-3 pr-3 max-w-md">
        <div className="font-medium truncate">
          {row.entityLabel ?? `(${row.entityKind} ${row.entityId.slice(0, 8)})`}
        </div>
        <div className="text-[12px] truncate" style={{ color: "#888" }}>
          {summarizeDetails(row.details)}
        </div>
      </td>
      <td className="py-3 pr-3">
        <span
          className="px-2 py-0.5 rounded text-[11px] uppercase"
          style={{ background: color.bg, color: color.fg }}
        >
          {KIND_LABEL[row.kind]}
        </span>
      </td>
      <td className="py-3 pr-3 text-[12px]" style={{ color: "#666" }}>
        {row.entityKind}
      </td>
      <td className="py-3 pr-3 text-[12px]" style={{ color: "#888" }}>
        {formatAge(row.createdAt)}
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <FlagActionButton flagId={row.id} variant="resolve" />
          <FlagActionButton flagId={row.id} variant="dismiss" />
        </div>
      </td>
    </tr>
  );
}

/**
 * Stage-advancement-specific row. Shows engagement name + from→to + the
 * triggering thread subject linked to /agent-inbox.
 */
export function StageAdvancementFlagRow({ row }: { row: HygieneFlagRow }) {
  const details = (row.details ?? {}) as {
    from_stage?: string;
    to_stage?: string;
    signals?: string[];
  };
  return (
    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
      <td className="py-3 pr-3 max-w-md">
        <div className="font-medium truncate">
          {row.entityLabel ?? "(engagement)"}
        </div>
        <div className="text-[12px] truncate" style={{ color: "#888" }}>
          {row.relatedThreadSubject ?? "(no thread subject)"}
        </div>
      </td>
      <td className="py-3 pr-3 text-[12px]" style={{ color: "#222" }}>
        <div className="flex items-center gap-1">
          <span
            className="px-1.5 py-0.5 rounded text-[11px]"
            style={{ background: "#f5f5f5", color: "#666" }}
          >
            {details.from_stage ?? "?"}
          </span>
          <span style={{ color: "#aaa" }}>→</span>
          <span
            className="px-1.5 py-0.5 rounded text-[11px]"
            style={{ background: "#e8f5e9", color: "#1b5e20" }}
          >
            {details.to_stage ?? "?"}
          </span>
        </div>
      </td>
      <td className="py-3 pr-3 text-[12px]" style={{ color: "#888" }}>
        {Array.isArray(details.signals) && details.signals.length > 0
          ? details.signals[0]
          : "—"}
      </td>
      <td className="py-3 pr-3 text-[12px]" style={{ color: "#888" }}>
        {formatAge(row.createdAt)}
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {row.relatedEntityId && (
            <Link
              href={`/agent-inbox?thread=${row.relatedEntityId}`}
              className="text-[12px]"
              style={{ color: "#1a73e8" }}
            >
              Open thread →
            </Link>
          )}
          <FlagActionButton flagId={row.id} variant="dismiss" />
        </div>
      </td>
    </tr>
  );
}

function summarizeDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const obj = details as Record<string, unknown>;
  const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return "";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${stringifyShort(v)}`)
    .join(" · ");
}

function stringifyShort(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  try {
    return JSON.stringify(v).slice(0, 40);
  } catch {
    return String(v);
  }
}

function formatAge(d: Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - date.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
