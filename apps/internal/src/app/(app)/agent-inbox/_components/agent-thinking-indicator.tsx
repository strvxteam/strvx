"use client";

import { useCosRunStatus } from "@/lib/use-cos-run-status";

const KEYFRAMES = `
@keyframes agent-thinking-pulse {
  0% { opacity: 0.35; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0.35; transform: scale(0.9); }
}
`;

export function AgentThinkingIndicator({ threadId }: { threadId: string }) {
  const { running, kind } = useCosRunStatus(threadId);
  if (!running) return null;

  const label =
    kind === "draft"
      ? "Drafting…"
      : kind === "classify"
        ? "Classifying…"
        : kind === "plan"
          ? "Planning…"
          : kind === "scheduling"
            ? "Scheduling…"
            : kind === "brief" || kind === "prep_brief"
              ? "Generating brief…"
              : "Agent thinking…";

  return (
    <>
      <style>{KEYFRAMES}</style>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 99,
          background: "#e8f0fe",
          color: "#1a56db",
          fontWeight: 600,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#1a56db",
            animation: "agent-thinking-pulse 1.2s ease-in-out infinite",
          }}
        />
        {label}
      </span>
    </>
  );
}
