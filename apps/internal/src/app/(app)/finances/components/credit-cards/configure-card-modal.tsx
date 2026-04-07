"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { upsertCardConfig } from "@/app/actions";
import { toast } from "sonner";
import type { MercuryCardSlim, CardEnrichment } from "../../finances-client";

interface ConfigureCardModalProps {
  card: MercuryCardSlim;
  enrichment: CardEnrichment | null;
  onClose: () => void;
}

export function ConfigureCardModal({
  card,
  enrichment,
  onClose,
}: ConfigureCardModalProps) {
  const [nickname, setNickname] = useState(enrichment?.cardNickname ?? "");
  const [employee, setEmployee] = useState(enrichment?.assignedEmployee ?? "");
  const [limit, setLimit] = useState(enrichment?.creditLimit?.toString() ?? "");
  const [rewardRate, setRewardRate] = useState(
    enrichment?.rewardRate?.toString() ?? "1.5"
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await upsertCardConfig({
        mercuryCardId: card.cardId,
        cardNickname: nickname || undefined,
        assignedEmployee: employee || undefined,
        creditLimit: limit ? Number(limit) : undefined,
        rewardRate: rewardRate ? Number(rewardRate) : undefined,
      });
      toast.success("Card configured");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">
            Configure Card •••• {card.lastFourDigits}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[#888] hover:bg-[#f0f0f0]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#555]">Nickname</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Marketing Card"
              className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#555]">
              Assigned Employee
            </span>
            <input
              type="text"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              placeholder="e.g. John Smith"
              className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#555]">
              Credit Limit ($)
            </span>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 10000"
              min="0"
              step="100"
              className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#555]">
              Reward Rate (%)
            </span>
            <input
              type="number"
              value={rewardRate}
              onChange={(e) => setRewardRate(e.target.value)}
              placeholder="e.g. 1.5"
              min="0"
              max="100"
              step="0.1"
              className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#e0e0e0] px-4 py-1.5 text-[13px] font-medium text-[#555] hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#111] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
