"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, AlertTriangle } from "lucide-react";
import {
  createCardBudget,
  updateCardBudget,
  deleteCardBudget,
} from "@/app/actions";
import { toast } from "sonner";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardBudgetSlim,
  CardAlertSlim,
} from "../../finances-client";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CardBudgetsProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardBudgets: CardBudgetSlim[];
  cardAlerts: CardAlertSlim[];
  bankTransactions: BankTransaction[];
}

const BUDGET_CATEGORIES = [
  "Software",
  "Hosting",
  "Marketing",
  "Office",
  "Travel",
  "Contractors",
  "Subscriptions",
  "Equipment",
  "Meals",
  "Misc",
];

export function CardBudgets({
  mercuryCards,
  cardEnrichment,
  cardBudgets,
  cardAlerts,
  bankTransactions,
}: CardBudgetsProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<CardBudgetSlim | null>(
    null
  );
  const [selectedCardId, setSelectedCardId] = useState<string>(
    cardEnrichment[0]?.id ?? ""
  );
  const [category, setCategory] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [saving, setSaving] = useState(false);

  const currentMonthSpend = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return bankTransactions.filter(
      (t) =>
        t.kind.toLowerCase().includes("card") &&
        t.amount < 0 &&
        new Date(t.createdAt) >= monthStart
    );
  }, [bankTransactions]);

  const totalSpendThisMonth = currentMonthSpend.reduce(
    (s, t) => s + Math.abs(t.amount),
    0
  );

  const budgetsForCard = cardBudgets.filter(
    (b) => b.creditCardId === selectedCardId
  );

  async function handleSave() {
    if (!selectedCardId || !category || !monthlyLimit) {
      toast.error("Fill in all fields");
      return;
    }
    setSaving(true);
    try {
      if (editingBudget) {
        await updateCardBudget(editingBudget.id, {
          category,
          monthlyLimit: Number(monthlyLimit),
        });
        toast.success("Budget updated");
      } else {
        await createCardBudget({
          creditCardId: selectedCardId,
          category,
          monthlyLimit: Number(monthlyLimit),
        });
        toast.success("Budget created");
      }
      closeModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(budgetId: string) {
    try {
      await deleteCardBudget(budgetId);
      toast.success("Budget deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  function openEdit(budget: CardBudgetSlim) {
    setEditingBudget(budget);
    setSelectedCardId(budget.creditCardId);
    setCategory(budget.category);
    setMonthlyLimit(budget.monthlyLimit.toString());
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingBudget(null);
    setCategory("");
    setMonthlyLimit("");
  }

  const spendPerBudget =
    budgetsForCard.length > 0
      ? totalSpendThisMonth / budgetsForCard.length
      : 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <select
          value={selectedCardId}
          onChange={(e) => setSelectedCardId(e.target.value)}
          className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[13px] outline-none"
        >
          {cardEnrichment.length === 0 ? (
            <option value="">No configured cards</option>
          ) : (
            cardEnrichment.map((e) => {
              const mc = mercuryCards.find((c) => c.cardId === e.mercuryCardId);
              return (
                <option key={e.id} value={e.id}>
                  {e.cardNickname ?? mc?.nameOnCard ?? `•••• ${mc?.lastFourDigits ?? "?"}`}
                </option>
              );
            })
          )}
        </select>
        <button
          onClick={() => setShowModal(true)}
          disabled={!selectedCardId}
          className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-50"
        >
          <Plus size={14} />
          Add Budget
        </button>
      </div>

      {budgetsForCard.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d0d0d0] py-16 text-center">
          <p className="text-[13px] text-[#888]">
            No budgets set for this card.
          </p>
          <p className="mt-1 text-[12px] text-[#bbb]">
            Add category budgets to track spending limits.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {budgetsForCard.map((budget) => {
            const spent = spendPerBudget;
            const pct =
              budget.monthlyLimit > 0
                ? (spent / budget.monthlyLimit) * 100
                : 0;
            const overBudget = pct >= 100;
            const nearBudget = pct >= 80;

            return (
              <div
                key={budget.id}
                className="rounded-xl border border-[#e0e0e0] bg-white p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#333]">
                      {budget.category}
                    </span>
                    {(overBudget || nearBudget) && (
                      <AlertTriangle
                        size={13}
                        className={
                          overBudget ? "text-red-500" : "text-amber-500"
                        }
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(budget)}
                      className="rounded-md p-1 text-[#ccc] hover:bg-[#f5f5f5] hover:text-[#888]"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(budget.id)}
                      className="rounded-md p-1 text-[#ccc] hover:bg-[#f5f5f5] hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-[#888]">
                  <span>
                    ~${spent.toFixed(2)} / ${budget.monthlyLimit.toLocaleString()}
                  </span>
                  <span
                    className={`font-medium ${
                      overBudget
                        ? "text-red-600"
                        : nearBudget
                          ? "text-amber-600"
                          : "text-[#555]"
                    }`}
                  >
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0f0]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      overBudget
                        ? "bg-red-400"
                        : nearBudget
                          ? "bg-amber-400"
                          : "bg-[#111]"
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Budget Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">
                {editingBudget ? "Edit Budget" : "Add Budget"}
              </h3>
              <button
                onClick={closeModal}
                className="rounded-md p-1 text-[#888] hover:bg-[#f0f0f0]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[#555]">
                  Category
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
                >
                  <option value="">Select category</option>
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[#555]">
                  Monthly Limit ($)
                </span>
                <input
                  type="number"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  placeholder="e.g. 5000"
                  min="0"
                  step="100"
                  className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-lg border border-[#e0e0e0] px-4 py-1.5 text-[13px] font-medium text-[#555] hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[#111] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-50"
              >
                {saving ? "Saving..." : editingBudget ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
