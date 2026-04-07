"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  Flag,
  RefreshCw,
  Filter,
} from "lucide-react";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardReceiptSlim,
  CardAlertSlim,
} from "../../finances-client";
import { ReceiptUpload } from "./receipt-upload";
import {
  detectRecurringCharges,
} from "@/lib/recurring-detection";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CardTransactionsProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardReceipts: CardReceiptSlim[];
  cardAlerts: CardAlertSlim[];
  bankTransactions: BankTransaction[];
}

export function CardTransactions({
  mercuryCards,
  cardEnrichment,
  cardReceipts,
  cardAlerts,
  bankTransactions,
}: CardTransactionsProps) {
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [showRecurring, setShowRecurring] = useState(true);
  const [filterCard, setFilterCard] = useState<string>("all");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const cardTransactions = useMemo(
    () =>
      bankTransactions.filter((t) =>
        t.kind.toLowerCase().includes("card")
      ),
    [bankTransactions]
  );

  const filteredTransactions = useMemo(() => {
    let result = cardTransactions;

    if (filterDateStart) {
      result = result.filter(
        (t) => t.createdAt.split("T")[0] >= filterDateStart
      );
    }
    if (filterDateEnd) {
      result = result.filter(
        (t) => t.createdAt.split("T")[0] <= filterDateEnd
      );
    }
    if (filterAmountMin) {
      result = result.filter(
        (t) => Math.abs(t.amount) >= Number(filterAmountMin)
      );
    }
    if (filterAmountMax) {
      result = result.filter(
        (t) => Math.abs(t.amount) <= Number(filterAmountMax)
      );
    }

    return result;
  }, [cardTransactions, filterDateStart, filterDateEnd, filterAmountMin, filterAmountMax]);

  const recurringCharges = useMemo(
    () => detectRecurringCharges(cardTransactions),
    [cardTransactions]
  );
  const totalMonthlyRecurring = recurringCharges.reduce(
    (sum, r) => sum + r.totalMonthlyEstimate,
    0
  );

  const avgTxnAmount = useMemo(() => {
    if (cardTransactions.length === 0) return 0;
    return (
      cardTransactions.reduce((s, t) => s + Math.abs(t.amount), 0) /
      cardTransactions.length
    );
  }, [cardTransactions]);

  function getReceipt(txnId: string): CardReceiptSlim | null {
    return cardReceipts.find((r) => r.mercuryTransactionId === txnId) ?? null;
  }

  function getCreditCardId(): string {
    return cardEnrichment[0]?.id ?? "";
  }

  function isUnusualSpend(amount: number): boolean {
    return avgTxnAmount > 0 && Math.abs(amount) > avgTxnAmount * 2;
  }

  return (
    <div>
      {/* Recurring charges section */}
      {recurringCharges.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#e0e0e0] bg-white">
          <button
            onClick={() => setShowRecurring(!showRecurring)}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-[#888]" />
              <span className="text-[13px] font-medium">
                Recurring Charges
              </span>
              <span className="rounded-full bg-[#f0f0f0] px-2 py-0.5 text-[11px] text-[#555]">
                {recurringCharges.length} detected
              </span>
              <span className="text-[12px] text-[#888]">
                ~${totalMonthlyRecurring.toFixed(2)}/mo
              </span>
            </div>
            {showRecurring ? (
              <ChevronUp size={14} className="text-[#888]" />
            ) : (
              <ChevronDown size={14} className="text-[#888]" />
            )}
          </button>
          {showRecurring && (
            <div className="border-t border-[#e0e0e0] px-4 py-2">
              <div className="grid gap-1">
                {recurringCharges.map((rc) => (
                  <div
                    key={rc.counterpartyName}
                    className="flex items-center justify-between py-1.5 text-[12px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#333]">
                        {rc.counterpartyName}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                          rc.confidence === "high"
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {rc.confidence}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[#888]">
                      <span>${rc.averageAmount.toFixed(2)}</span>
                      <span className="capitalize">{rc.frequency}</span>
                      <span>Next: {rc.nextExpectedDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
            showFilters
              ? "border-[#111] bg-[#111] text-white"
              : "border-[#e0e0e0] text-[#555] hover:bg-[#f5f5f5]"
          }`}
        >
          <Filter size={12} />
          Filters
        </button>
        <span className="text-[12px] text-[#999]">
          {filteredTransactions.length} transactions
        </span>
      </div>

      {showFilters && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[#e0e0e0] bg-[#fafafa] p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">From</span>
            <input
              type="date"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">To</span>
            <input
              type="date"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">Min $</span>
            <input
              type="number"
              value={filterAmountMin}
              onChange={(e) => setFilterAmountMin(e.target.value)}
              placeholder="0"
              className="w-24 rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">Max $</span>
            <input
              type="number"
              value={filterAmountMax}
              onChange={(e) => setFilterAmountMax(e.target.value)}
              placeholder="∞"
              className="w-24 rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px]"
            />
          </label>
          <button
            onClick={() => {
              setFilterDateStart("");
              setFilterDateEnd("");
              setFilterAmountMin("");
              setFilterAmountMax("");
            }}
            className="text-[11px] text-[#999] hover:text-[#555]"
          >
            Clear
          </button>
        </div>
      )}

      {/* Transaction table */}
      <div className="overflow-x-auto rounded-xl border border-[#e0e0e0] bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#e0e0e0] text-left text-[11px] font-medium uppercase text-[#999]">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Counterparty</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Receipt</th>
              <th className="px-4 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[13px] text-[#999]"
                >
                  No card transactions found.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((txn) => {
                const receipt = getReceipt(txn.id);
                const unusual = isUnusualSpend(txn.amount);
                const isExpanded = expandedTxn === txn.id;

                return (
                  <tr key={txn.id} className="group">
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5 text-[#555]">
                      {new Date(txn.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-[#333]">
                          {txn.counterpartyName}
                        </span>
                        {unusual && (
                          <span title="Unusual spend (>2x average)">
                            <Flag size={12} className="text-amber-500" />
                          </span>
                        )}
                      </div>
                      {isExpanded && txn.note && (
                        <p className="mt-1 text-[11px] text-[#999]">
                          {txn.note}
                        </p>
                      )}
                      {isExpanded && (
                        <div className="mt-2">
                          <ReceiptUpload
                            mercuryTransactionId={txn.id}
                            creditCardId={getCreditCardId()}
                            existingReceipt={receipt}
                          />
                        </div>
                      )}
                    </td>
                    <td
                      className={`border-b border-[#f0f0f0] px-4 py-2.5 text-right font-medium ${
                        txn.amount < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {txn.amount < 0 ? "-" : "+"}$
                      {Math.abs(txn.amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          txn.status === "sent"
                            ? "bg-green-50 text-green-700"
                            : txn.status === "pending"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {txn.status}
                      </span>
                    </td>
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5">
                      {receipt && !isExpanded && (
                        <span className="text-[11px] text-green-600">
                          ✓
                        </span>
                      )}
                    </td>
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5">
                      <button
                        onClick={() =>
                          setExpandedTxn(isExpanded ? null : txn.id)
                        }
                        className="rounded-md p-1 text-[#ccc] hover:bg-[#f5f5f5] hover:text-[#888]"
                      >
                        {isExpanded ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
