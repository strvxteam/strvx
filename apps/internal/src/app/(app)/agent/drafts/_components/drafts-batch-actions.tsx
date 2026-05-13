"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendAllHighConfidenceDrafts } from "../_actions";

export function DraftsBatchActions({ highConfidenceIds }: { highConfidenceIds: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSendAll() {
    if (highConfidenceIds.length === 0) {
      toast.error("No high-confidence drafts.");
      return;
    }
    if (
      !confirm(
        `Send ${highConfidenceIds.length} high-confidence drafts? This cannot be undone.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await sendAllHighConfidenceDrafts(highConfidenceIds);
        toast.success(`Sending ${result.sentCount} drafts.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Batch send failed");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleSendAll}
      disabled={pending || highConfidenceIds.length === 0}
      className="px-4 py-2 rounded-md text-[13px] font-medium"
      style={{
        background: highConfidenceIds.length === 0 ? "#f0f0f0" : "#1a73e8",
        color: highConfidenceIds.length === 0 ? "#888" : "#ffffff",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending
        ? "Sending…"
        : `Send all high-confidence (${highConfidenceIds.length})`}
    </button>
  );
}
