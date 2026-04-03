"use client";

import { useTransition } from "react";
import { changeStage } from "@/app/actions";
import { useRouter } from "next/navigation";
import {
  KANBAN_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
} from "@/lib/pipeline-constants";

const ALL_STAGES = [
  ...KANBAN_STAGES,
  "closed_won",
  "closed_lost",
] as const;

export function StageSelect({
  engagementId,
  currentStage,
}: {
  engagementId: string;
  currentStage: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStage = e.target.value as (typeof ALL_STAGES)[number];
    if (newStage === currentStage) return;

    startTransition(async () => {
      await changeStage(engagementId, newStage);
      router.refresh();
    });
  }

  return (
    <select
      value={currentStage}
      onChange={handleChange}
      disabled={isPending}
      className={`appearance-none rounded-lg px-3 py-1.5 pr-7 text-[12px] font-medium outline-none transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_6px_center] bg-no-repeat ${
        STAGE_COLORS[currentStage] || ""
      } ${isPending ? "opacity-50" : ""}`}
    >
      {ALL_STAGES.map((stage) => (
        <option key={stage} value={stage}>
          {STAGE_LABELS[stage] ?? stage}
        </option>
      ))}
    </select>
  );
}
