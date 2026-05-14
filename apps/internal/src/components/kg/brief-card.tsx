"use client";

import { useState, useTransition } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { generateBriefAction } from "@/lib/kg/brief-action";
import { Markdown } from "@/components/kg/markdown";

interface Props {
  entityId: string;
  compact?: boolean;
}

export function BriefCard({ entityId, compact = false }: Props) {
  const [brief, setBrief] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await generateBriefAction(entityId);
      if (res.ok) setBrief(res.brief);
      else setError(res.error);
    });
  }

  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        background: "#fff",
        padding: compact ? 16 : 20,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: brief || error ? 12 : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={14} color="#1a73e8" />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              color: "#888",
            }}
          >
            Pre-meeting brief
          </span>
          <span style={{ fontSize: 11, color: "#888" }}>· GPT-4o</span>
        </div>
        <button
          onClick={run}
          disabled={isPending}
          style={{
            padding: "6px 12px",
            background: isPending ? "#ccc" : "#111",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            cursor: isPending ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {isPending ? (
            <>
              <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> Working…
            </>
          ) : brief ? (
            "Regenerate"
          ) : (
            "Generate"
          )}
        </button>
      </div>
      {error ? (
        <div
          style={{
            fontSize: 13,
            color: "#7f1d1d",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "10px 12px",
          }}
        >
          {error}
        </div>
      ) : brief ? (
        <Markdown text={brief} variant="brief" />
      ) : null}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
