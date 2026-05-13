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
      className="px-2 py-1 rounded text-[12px]"
      style={{
        color: isDismiss ? "#888" : "#1a73e8",
        background: pending ? "#f5f5f5" : "transparent",
        opacity: pending ? 0.6 : 1,
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
      className="px-2 py-1 rounded text-[12px]"
      style={{
        color: "#888",
        background: pending ? "#f5f5f5" : "transparent",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "Cancelling…" : "Cancel"}
    </button>
  );
}
