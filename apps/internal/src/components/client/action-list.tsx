"use client";

import { useTransition } from "react";
import { toggleAction } from "@/app/actions";
import { useRouter } from "next/navigation";

type Action = {
  id: string;
  description: string;
  priority?: "urgent" | "high" | "normal" | "low";
  dueDate: string | null;
  completed: boolean;
  completedAt: Date | null;
  ownerName: string;
  ownerId: string;
};

const PRIORITY_BADGE: Record<string, { label: string; className: string } | null> = {
  urgent: { label: "Urgent", className: "bg-[#fde8e8] text-[#c0392b]" },
  high: { label: "High", className: "bg-[#fef3e2] text-[#e67e22]" },
  normal: null,
  low: { label: "Low", className: "bg-[#f0f0f0] text-[#888]" },
};

export function ActionList({ actions }: { actions: Action[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle(actionId: string) {
    startTransition(async () => {
      await toggleAction(actionId);
      router.refresh();
    });
  }

  if (actions.length === 0) {
    return <p className="text-[13px] text-[#aaa]">No actions yet.</p>;
  }

  const incomplete = actions.filter((a) => !a.completed);
  const completed = actions.filter((a) => a.completed);

  return (
    <div className="space-y-1">
      {incomplete.map((action) => {
        const isOverdue =
          action.dueDate && new Date(action.dueDate) < new Date();
        const badge = action.priority ? PRIORITY_BADGE[action.priority] : null;
        return (
          <div
            key={action.id}
            className="flex items-start gap-2 py-1 text-[13px]"
          >
            <button
              onClick={() => handleToggle(action.id)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[#ccc] transition-colors hover:border-[#888]"
              aria-label={`Complete: ${action.description}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span>{action.description}</span>
                {badge && (
                  <span
                    className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-[#aaa]">
                {action.ownerName}
              </div>
            </div>
            {action.dueDate && (
              <span
                className={`whitespace-nowrap text-[11px] ${
                  isOverdue
                    ? "font-semibold text-[#c0392b]"
                    : "text-[#e67e22]"
                }`}
              >
                {isOverdue ? "Overdue: " : "Due "}
                {new Date(action.dueDate + "T00:00:00").toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" }
                )}
              </span>
            )}
          </div>
        );
      })}

      {completed.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-[#aaa]">
            {completed.length} completed
          </summary>
          <div className="mt-1 space-y-1 opacity-50">
            {completed.map((action) => (
              <div
                key={action.id}
                className="flex items-start gap-2 py-1 text-[13px] line-through"
              >
                <button
                  onClick={() => handleToggle(action.id)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[#ccc] bg-[#27ae60]"
                  aria-label={`Undo: ${action.description}`}
                />
                <span>{action.description}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
