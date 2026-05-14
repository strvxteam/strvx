"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { dismissFlag, resolveFlag, dismissWatcher } from "../_actions";

type FlagButtonProps = {
  flagId: string;
  variant: "dismiss" | "resolve";
};

export function FlagActionButton({ flagId, variant }: FlagButtonProps) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      try {
        const result =
          variant === "dismiss"
            ? await dismissFlag(flagId)
            : await resolveFlag(flagId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(variant === "dismiss" ? "Dismissed" : "Resolved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  };

  const isDismiss = variant === "dismiss";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded text-[12px]"
      style={{
        color: isDismiss ? "#555" : "#1a73e8",
        background: pending ? "#f5f5f5" : "#ffffff",
        border: `1px solid ${isDismiss ? "#e0e0e0" : "#cfdcfb"}`,
        padding: "3px 10px",
        fontWeight: 500,
        opacity: pending ? 0.6 : 1,
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending
        ? isDismiss
          ? "Dismissing…"
          : "Resolving…"
        : isDismiss
        ? "Dismiss"
        : "Resolve"}
    </button>
  );
}

export function WatcherCancelButton({ watcherId }: { watcherId: string }) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      try {
        const result = await dismissWatcher(watcherId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Watcher cancelled");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Cancel failed");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded text-[12px]"
      style={{
        color: "#555",
        background: pending ? "#f5f5f5" : "#ffffff",
        border: "1px solid #e0e0e0",
        padding: "3px 10px",
        fontWeight: 500,
        opacity: pending ? 0.6 : 1,
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "Cancelling…" : "Cancel"}
    </button>
  );
}
