"use client";

import { useState, useMemo } from "react";
import { CreditCard, DollarSign, TrendingUp, Percent } from "lucide-react";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardAlertSlim,
} from "../../finances-client";
import { CardComponent } from "./card-component";
import { ConfigureCardModal } from "./configure-card-modal";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CardsOverviewProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardAlerts: CardAlertSlim[];
  bankTransactions: BankTransaction[];
}

export function CardsOverview({
  mercuryCards,
  cardEnrichment,
  cardAlerts,
  bankTransactions,
}: CardsOverviewProps) {
  const [configuringCard, setConfiguringCard] = useState<MercuryCardSlim | null>(
    null
  );

  const cardSpendMap = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const map = new Map<string, number>();

    for (const txn of bankTransactions) {
      if (new Date(txn.createdAt) < monthStart) continue;
      if (txn.amount >= 0) continue;
      if (txn.kind.toLowerCase().includes("card")) {
        const key = "__all__";
        map.set(key, (map.get(key) ?? 0) + Math.abs(txn.amount));
      }
    }
    return map;
  }, [bankTransactions]);

  const totalCardSpend = cardSpendMap.get("__all__") ?? 0;
  const activeCards = mercuryCards.filter((c) => c.status === "active");
  const perCardSpend =
    activeCards.length > 0 ? totalCardSpend / activeCards.length : 0;

  const totalLimit = cardEnrichment.reduce(
    (sum, e) => sum + (e.creditLimit ?? 0),
    0
  );
  const overallUtilization =
    totalLimit > 0 ? (totalCardSpend / totalLimit) * 100 : 0;
  const avgRewardRate =
    cardEnrichment.length > 0
      ? cardEnrichment.reduce((sum, e) => sum + (e.rewardRate ?? 0), 0) /
        cardEnrichment.filter((e) => e.rewardRate && e.rewardRate > 0).length || 0
      : 0;
  const estimatedRewards = totalCardSpend * (avgRewardRate / 100);

  function getEnrichment(cardId: string): CardEnrichment | null {
    return cardEnrichment.find((e) => e.mercuryCardId === cardId) ?? null;
  }

  function getAlerts(cardId: string): CardAlertSlim[] {
    const enrichment = getEnrichment(cardId);
    if (!enrichment) return [];
    return cardAlerts.filter((a) => a.creditCardId === enrichment.id);
  }

  const stats = [
    {
      label: "Total Credit Limit",
      value: `$${totalLimit.toLocaleString()}`,
      icon: CreditCard,
    },
    {
      label: "Current Month Spend",
      value: `$${totalCardSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
    },
    {
      label: "Utilization",
      value: totalLimit > 0 ? `${overallUtilization.toFixed(1)}%` : "—",
      icon: Percent,
    },
    {
      label: "Est. Rewards (MTD)",
      value: `$${estimatedRewards.toFixed(2)}`,
      icon: TrendingUp,
    },
  ];

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[#e0e0e0] bg-white p-4"
          >
            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase text-[#999]">
              <s.icon size={13} strokeWidth={1.5} />
              {s.label}
            </div>
            <div className="text-[18px] font-semibold text-[#111]">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {mercuryCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d0d0d0] py-16 text-center">
          <CreditCard size={28} strokeWidth={1.5} className="mb-2 text-[#ccc]" />
          <p className="text-[13px] text-[#888]">
            No cards found in Mercury.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mercuryCards.map((card) => (
            <CardComponent
              key={card.cardId}
              card={card}
              enrichment={getEnrichment(card.cardId)}
              alerts={getAlerts(card.cardId)}
              currentSpend={card.status === "active" ? perCardSpend : 0}
              onConfigure={() => setConfiguringCard(card)}
            />
          ))}
        </div>
      )}

      {configuringCard && (
        <ConfigureCardModal
          card={configuringCard}
          enrichment={getEnrichment(configuringCard.cardId)}
          onClose={() => setConfiguringCard(null)}
        />
      )}
    </div>
  );
}
