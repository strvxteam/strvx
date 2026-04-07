"use client";

import { Settings, AlertTriangle } from "lucide-react";
import type { MercuryCardSlim, CardEnrichment, CardAlertSlim } from "../../finances-client";

interface CardComponentProps {
  card: MercuryCardSlim;
  enrichment: CardEnrichment | null;
  alerts: CardAlertSlim[];
  currentSpend: number;
  onConfigure: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-green-50", text: "text-green-700" },
  frozen: { bg: "bg-blue-50", text: "text-blue-700" },
  cancelled: { bg: "bg-red-50", text: "text-red-700" },
  inactive: { bg: "bg-gray-50", text: "text-gray-500" },
  expired: { bg: "bg-orange-50", text: "text-orange-700" },
  suspended: { bg: "bg-red-50", text: "text-red-700" },
};

export function CardComponent({
  card,
  enrichment,
  alerts,
  currentSpend,
  onConfigure,
}: CardComponentProps) {
  const limit = enrichment?.creditLimit ?? 0;
  const utilization = limit > 0 ? (currentSpend / limit) * 100 : 0;
  const rewardRate = enrichment?.rewardRate ?? 0;

  const thresholdAlert = alerts.find(
    (a) => a.alertType === "limit_threshold" && a.enabled
  );
  const isOverThreshold =
    thresholdAlert && limit > 0 && utilization >= thresholdAlert.thresholdValue;

  const statusStyle = STATUS_COLORS[card.status] ?? STATUS_COLORS.inactive;

  return (
    <div className="relative rounded-xl border border-[#e0e0e0] bg-white p-4 transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#111]">
              •••• {card.lastFourDigits}
            </span>
            <span className="text-[11px] font-medium uppercase text-[#999]">
              {card.network}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[#888]">
            {enrichment?.cardNickname ?? card.nameOnCard}
          </p>
          {enrichment?.assignedEmployee && (
            <p className="text-[11px] text-[#aaa]">
              {enrichment.assignedEmployee}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}
          >
            {card.status}
          </span>
          <button
            onClick={onConfigure}
            className="rounded-md p-1 text-[#999] hover:bg-[#f0f0f0] hover:text-[#555]"
            title="Configure card"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {limit > 0 ? (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-[#888]">
              ${currentSpend.toLocaleString()} / ${limit.toLocaleString()}
            </span>
            <span
              className={`font-medium ${
                isOverThreshold ? "text-amber-600" : "text-[#555]"
              }`}
            >
              {utilization.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0f0]">
            <div
              className={`h-full rounded-full transition-all ${
                isOverThreshold
                  ? "bg-amber-400"
                  : utilization > 90
                    ? "bg-red-400"
                    : "bg-[#111]"
              }`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          {isOverThreshold && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600">
              <AlertTriangle size={12} />
              Approaching limit ({thresholdAlert.thresholdValue}% threshold)
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={onConfigure}
          className="mb-3 w-full rounded-lg border border-dashed border-[#d0d0d0] py-2 text-[12px] text-[#888] hover:border-[#999] hover:text-[#555]"
        >
          Set credit limit to track utilization
        </button>
      )}

      {rewardRate > 0 && (
        <div className="text-[11px] text-[#aaa]">
          {rewardRate}% cashback
        </div>
      )}
    </div>
  );
}
