"use client";

import { useState } from "react";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardBudgetSlim,
  CardReceiptSlim,
  CardAlertSlim,
} from "../../finances-client";
import { CardsOverview } from "./cards-overview";
import { CardTransactions } from "./card-transactions";
import { CardBudgets } from "./card-budgets";
import { CardReports } from "./card-reports";

type SubView = "overview" | "transactions" | "budgets" | "reports";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CreditCardsTabProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardBudgets: CardBudgetSlim[];
  cardReceipts: CardReceiptSlim[];
  cardAlerts: CardAlertSlim[];
  bankTransactions: BankTransaction[];
  mercuryConnected: boolean;
}

export function CreditCardsTab({
  mercuryCards,
  cardEnrichment,
  cardBudgets,
  cardReceipts,
  cardAlerts,
  bankTransactions,
  mercuryConnected,
}: CreditCardsTabProps) {
  const [subView, setSubView] = useState<SubView>("overview");

  // Check for payment_due alerts
  const paymentDueAlerts = cardAlerts.filter(
    (a) => a.alertType === "payment_due" && a.enabled
  );

  if (!mercuryConnected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d0d0d0] py-16 text-center">
        <p className="text-[15px] font-medium text-[#333]">
          Mercury not connected
        </p>
        <p className="mt-1 text-[13px] text-[#888]">
          Set the MERCURY_API_KEY environment variable to enable credit card tracking.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Payment due banner */}
      {paymentDueAlerts.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          <span className="font-medium">Payment Reminder:</span>{" "}
          {paymentDueAlerts.length} card(s) have upcoming payment due dates.
        </div>
      )}

      {/* Sub-view pill toggle */}
      <div className="mb-5 flex items-center gap-1 rounded-lg border border-[#e0e0e0] bg-white p-1 w-fit">
        {(["overview", "transactions", "budgets", "reports"] as const).map(
          (sv) => (
            <button
              key={sv}
              onClick={() => setSubView(sv)}
              className={`rounded-md px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                subView === sv
                  ? "bg-[#111] text-white"
                  : "text-[#555] hover:bg-[#f5f5f5]"
              }`}
            >
              {sv}
            </button>
          )
        )}
      </div>

      {subView === "overview" && (
        <CardsOverview
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardAlerts={cardAlerts}
          bankTransactions={bankTransactions}
        />
      )}
      {subView === "transactions" && (
        <CardTransactions
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardReceipts={cardReceipts}
          cardAlerts={cardAlerts}
          bankTransactions={bankTransactions}
        />
      )}
      {subView === "budgets" && (
        <CardBudgets
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardBudgets={cardBudgets}
          cardAlerts={cardAlerts}
          bankTransactions={bankTransactions}
        />
      )}
      {subView === "reports" && (
        <CardReports
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardBudgets={cardBudgets}
          cardReceipts={cardReceipts}
          bankTransactions={bankTransactions}
        />
      )}
    </div>
  );
}
