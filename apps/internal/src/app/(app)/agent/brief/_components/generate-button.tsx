"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { triggerBriefNow } from "../_actions";

/**
 * Fires the on-demand brief generate task. The Trigger.dev task takes ~10–30s
 * to produce a row, so we just kick it off and show a hint to refresh.
 */
export function GenerateButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "fired"; runId: string } | { state: "error"; message: string }
  >({ state: "idle" });

  const onClick = () => {
    setStatus({ state: "idle" });
    startTransition(async () => {
      try {
        const { runId } = await triggerBriefNow();
        setStatus({ state: "fired", runId });
        // Poll-ish: refresh after a short delay so the new row shows up.
        setTimeout(() => router.refresh(), 15_000);
      } catch (err) {
        setStatus({
          state: "error",
          message: err instanceof Error ? err.message : "Failed to start brief",
        });
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending || status.state === "fired"}
        className="rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
        style={{
          background: pending || status.state === "fired" ? "#e0e0e0" : "#111",
          color: pending || status.state === "fired" ? "#888" : "#fff",
          cursor:
            pending || status.state === "fired" ? "not-allowed" : "pointer",
        }}
      >
        {pending
          ? "Starting…"
          : status.state === "fired"
            ? "Generating — refresh in ~15s"
            : "Generate today's brief"}
      </button>
      {status.state === "fired" && (
        <p className="mt-2 text-[12px]" style={{ color: "#666" }}>
          Run id: {status.runId}
        </p>
      )}
      {status.state === "error" && (
        <p className="mt-2 text-[12px]" style={{ color: "#e74c3c" }}>
          {status.message}
        </p>
      )}
    </div>
  );
}
