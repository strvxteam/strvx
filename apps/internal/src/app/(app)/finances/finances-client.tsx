"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  X,
  Pencil,
  Trash2,
  PiggyBank,
  Wallet,
  Landmark,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import {
  EXPENSE_CATEGORY_COLORS,
  type Expense,
  type ExpenseCategory,
  type Invoice,
  type MonthlyRevenue,
} from "@/lib/mock-finance";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  createExpense as createExpenseAction,
  updateExpense as updateExpenseAction,
  deleteExpense as deleteExpenseAction,
} from "@/app/actions";
import { toast } from "sonner";


const CATEGORIES: ExpenseCategory[] = [
  "Software",
  "Hosting",
  "Marketing",
  "Office",
  "Travel",
  "Contractors",
  "Misc",
];

let nextExpId = 100;

interface PipelineEngagementSlim {
  name: string;
  companyName: string;
  dealValue: number | string | null;
  probability: number | string | null;
  stage: string;
}

interface BankAccount {
  id: string;
  name: string;
  kind: string;
  currentBalance: number;
  availableBalance: number;
}

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface ProjectProfitability {
  projectName: string;
  client: string;
  totalHours: number;
  billableHours: number;
  revenue: number;
}

export interface MercuryCardSlim {
  cardId: string;
  nameOnCard: string;
  lastFourDigits: string;
  network: "visa" | "mastercard";
  status: "active" | "frozen" | "cancelled" | "inactive" | "expired" | "suspended";
  physicalCardStatus: "inactive" | "active" | "paused" | null;
  createdAt: string;
}

export interface CardEnrichment {
  id: string;
  mercuryCardId: string;
  cardNickname: string | null;
  assignedEmployee: string | null;
  creditLimit: number | null;
  rewardRate: number | null;
}

export interface CardBudgetSlim {
  id: string;
  creditCardId: string;
  category: string;
  monthlyLimit: number;
}

export interface CardReceiptSlim {
  id: string;
  mercuryTransactionId: string;
  creditCardId: string;
  fileUrl: string;
}

export interface CardAlertSlim {
  id: string;
  creditCardId: string;
  alertType: "limit_threshold" | "unusual_spend" | "payment_due";
  thresholdValue: number;
  enabled: boolean;
}

export interface FinancesPageProps {
  invoices?: Invoice[];
  expenses?: Expense[];
  monthlyRevenue?: MonthlyRevenue[];
  mrr?: number;
  pipelineEngagements?: PipelineEngagementSlim[];
  mercuryConnected?: boolean;
  bankAccounts?: BankAccount[];
  bankTransactions?: BankTransaction[];
  profitability?: ProjectProfitability[];
  mercuryCards?: MercuryCardSlim[];
  cardEnrichment?: CardEnrichment[];
  cardBudgets?: CardBudgetSlim[];
  cardReceipts?: CardReceiptSlim[];
  cardAlerts?: CardAlertSlim[];
  mercuryRevenue?: number;
  mercuryExpenses?: number;
  mercuryOutstanding?: number;
  mercuryMRR?: number;
  mercuryMonthlyRevenue?: { month: string; revenue: number }[];
  mercuryClientRevenue?: [string, number][];
  mercuryVendorExpenses?: [string, number][];
}

export default function FinancesPage({
  invoices: invoicesProp,
  expenses: expensesProp,
  monthlyRevenue: monthlyRevenueProp,
  mrr: mrrProp,
  pipelineEngagements: pipelineEngagementsProp,
  mercuryConnected = false,
  bankAccounts = [],
  bankTransactions = [],
  profitability = [],
  mercuryCards = [],
  cardEnrichment = [],
  cardBudgets = [],
  cardReceipts = [],
  cardAlerts = [],
  mercuryRevenue = 0,
  mercuryExpenses = 0,
  mercuryOutstanding = 0,
  mercuryMRR = 0,
  mercuryMonthlyRevenue = [],
  mercuryClientRevenue = [],
  mercuryVendorExpenses = [],
}: FinancesPageProps = {}) {
  const invoiceData = invoicesProp ?? [];
  const monthlyRevenueData = monthlyRevenueProp ?? [];
  const initialExpenses = expensesProp ?? [];

  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Mercury is the single source of truth for Finances.
  // Keep `paidInvoices`/`invoiceRevenue` around for any downstream views that
  // still reference them, but the dashboard numbers all come from Mercury.
  const paidInvoices = invoiceData.filter((inv) => inv.status === "paid");
  const invoiceRevenue = paidInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const currentMonth = mercuryMonthlyRevenue[mercuryMonthlyRevenue.length - 1] ?? { month: "", revenue: 0 };
  const prevMonth = mercuryMonthlyRevenue[mercuryMonthlyRevenue.length - 2];
  const revenueGrowth = prevMonth
    ? ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
    : 0;
  const ytdRevenue = mercuryMonthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
  const mrr = mercuryMRR;
  const maxMonthlyRevenue = mercuryMonthlyRevenue.length > 0
    ? Math.max(...mercuryMonthlyRevenue.map((m) => m.revenue))
    : 1;

  // Mercury-only P&L
  const localExpensesTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalRevenue = mercuryRevenue;
  const totalExpenses = mercuryExpenses;
  const profit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  // Top vendors (Mercury withdrawals by counterparty) — replaces the old
  // expense-by-category breakdown which was keyed off the manual expenses table.
  const categoryTotals = mercuryVendorExpenses;
  const clientRevenue = mercuryClientRevenue;

  // Pipeline forecast — fall back to stage-based probability when not set on the engagement.
  const STAGE_DEFAULT_PROBABILITY: Record<string, number> = {
    discovery: 10,
    building_mvp: 20,
    proposal: 30,
    build: 70,
    deliver: 85,
    maintain: 100,
  };
  const pipelineDeals = (pipelineEngagementsProp ?? [])
    .filter(
      (eng) => eng.dealValue && !["closed_won", "closed_lost"].includes(eng.stage)
    )
    .map((eng) => {
      const probability = eng.probability != null
        ? Number(eng.probability)
        : (STAGE_DEFAULT_PROBABILITY[eng.stage] ?? 20);
      const value = Number(eng.dealValue);
      return {
        name: eng.name,
        client: eng.companyName,
        value,
        probability,
        weighted: Math.round(value * (probability / 100)),
      };
    });

  const totalWeighted = pipelineDeals.reduce((sum, d) => sum + d.weighted, 0);

  // Outstanding = pending/in-flight Mercury transactions
  const totalOutstanding = mercuryOutstanding;
  const overdueAmount = 0;

  // CRUD for expenses
  const handleSaveExpense = (expense: Expense) => {
    if (editingExpense) {
      // Optimistic update for edit
      const previousExpenses = expenses;
      setExpenses((prev) =>
        prev.map((e) => (e.id === expense.id ? expense : e))
      );
      setShowExpenseModal(false);
      setEditingExpense(null);

      updateExpenseAction(expense.id, {
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
      })
        .then(() => {
          toast.success("Expense updated");
        })
        .catch((err) => {
          console.error(err);
          setExpenses(previousExpenses);
          toast.error("Failed to update expense");
        });
    } else {
      // Optimistic insert with temporary ID
      const tempId = expense.id;
      setExpenses((prev) => [expense, ...prev]);
      setShowExpenseModal(false);
      setEditingExpense(null);

      createExpenseAction({
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
      })
        .then((dbExpense) => {
          // Replace temp ID with real DB ID
          setExpenses((prev) =>
            prev.map((e) =>
              e.id === tempId
                ? { ...e, id: dbExpense.id }
                : e
            )
          );
          toast.success("Expense created");
        })
        .catch((err) => {
          console.error(err);
          setExpenses((prev) => prev.filter((e) => e.id !== tempId));
          toast.error("Failed to create expense");
        });
    }
  };

  const handleDeleteExpense = (id: string) => {
    const previousExpenses = expenses;
    setExpenses((prev) => prev.filter((e) => e.id !== id));

    deleteExpenseAction(id)
      .then(() => {
        toast.success("Expense deleted");
      })
      .catch((err) => {
        console.error(err);
        setExpenses(previousExpenses);
        toast.error("Failed to delete expense");
      });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex shrink-0 items-center justify-between">
        <h1 className="text-xl font-semibold">Finances</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditingExpense(null);
              setShowExpenseModal(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333]"
          >
            <Plus size={14} />
            Add Expense
          </button>
        </div>
      </div>

      {/* P&L Summary — always visible */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard
          icon={TrendingUp}
          label="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          accent="text-[#27ae60]"
          borderColor="border-l-[#27ae60]"
        />
        <MetricCard
          icon={TrendingDown}
          label="Total Expenses"
          value={`$${totalExpenses.toLocaleString()}`}
          accent="text-[#c0392b]"
          borderColor="border-l-[#c0392b]"
        />
        <MetricCard
          icon={PiggyBank}
          label="Net Profit"
          value={`$${profit.toLocaleString()}`}
          accent={profit >= 0 ? "text-[#27ae60]" : "text-[#c0392b]"}
          borderColor={
            profit >= 0 ? "border-l-[#27ae60]" : "border-l-[#c0392b]"
          }
          sub={`${profitMargin.toFixed(1)}% margin`}
        />
        <MetricCard
          icon={Wallet}
          label="Outstanding"
          value={`$${totalOutstanding.toLocaleString()}`}
          accent="text-[#e67e22]"
          borderColor="border-l-[#e67e22]"
          sub={overdueAmount > 0 ? `$${overdueAmount.toLocaleString()} overdue` : undefined}
          subColor="text-[#c0392b]"
        />
        <MetricCard
          icon={DollarSign}
          label="MRR"
          value={`$${mrr.toLocaleString()}`}
          accent="text-[#1a73e8]"
          borderColor="border-l-[#1a73e8]"
        />
      </div>

      {/* Mercury Bank Accounts */}
      {mercuryConnected && bankAccounts.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <Landmark size={14} className="text-[#1a73e8]" />
            <h2 className="text-sm font-semibold text-[#333]">Mercury Bank</h2>
          </div>
          <div className={`grid gap-4 ${bankAccounts.length === 1 ? "grid-cols-1 max-w-sm" : `grid-cols-${Math.min(bankAccounts.length, 3)}`}`}>
            {bankAccounts.map((acct) => (
              <div key={acct.id} className="rounded-lg border border-[#e0e0e0] border-l-[3px] border-l-[#1a73e8] bg-white p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">{acct.name}</span>
                  <span className="rounded-full bg-[#f0f0f0] px-2 py-0.5 text-[10px] font-medium capitalize text-[#555]">{acct.kind}</span>
                </div>
                <p className="text-xl font-semibold text-[#222]">${acct.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                {acct.availableBalance !== acct.currentBalance && (
                  <p className="mt-0.5 text-[11px] text-[#888]">${acct.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} available</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity + Expenses — two lists side by side, fill remaining viewport */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-6">
        {/* Activity — Mercury transaction feed */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#333]">Activity</h2>
            <span className="text-[11px] text-[#888]">
              {bankTransactions.length > 0 ? `${bankTransactions.length} transactions` : "bank feed"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!mercuryConnected ? (
              <div className="flex h-full items-center justify-center px-6 py-10 text-center text-[12px] text-[#aaa]">
                Mercury not connected. Configure MERCURY_API_TOKEN to see activity.
              </div>
            ) : bankTransactions.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 py-10 text-center text-[12px] text-[#aaa]">
                No bank activity yet.
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-[#f0f0f0]">
                {bankTransactions.map((txn) => (
                  <div key={txn.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        txn.amount >= 0 ? "bg-[#e6f9e6]" : "bg-[#fde8e8]"
                      }`}
                    >
                      {txn.amount >= 0 ? (
                        <ArrowDown size={12} className="text-[#27ae60]" />
                      ) : (
                        <ArrowUp size={12} className="text-[#c0392b]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[#222]">
                        {txn.counterpartyName || "Unknown"}
                      </p>
                      {txn.note && (
                        <p className="truncate text-[11px] text-[#888]">{txn.note}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-[13px] font-medium ${
                          txn.amount >= 0 ? "text-[#27ae60]" : "text-[#222]"
                        }`}
                      >
                        {txn.amount >= 0 ? "+" : ""}${Math.abs(txn.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[10px] text-[#aaa]">
                        {new Date(txn.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Expenses — manual expense ledger */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#333]">Expenses</h2>
            <span className="text-[11px] text-[#888]">
              {expenses.length > 0
                ? `${expenses.length} · $${localExpensesTotal.toLocaleString()}`
                : "no entries"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {expenses.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 py-10 text-center text-[12px] text-[#aaa]">
                No expenses logged. Click &quot;+ Add Expense&quot; to start.
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-[#f0f0f0]">
                {[...expenses]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((exp) => {
                    const colorClasses =
                      EXPENSE_CATEGORY_COLORS[exp.category] ?? "bg-[#f5f5f5] text-[#555]";
                    return (
                      <div
                        key={exp.id}
                        className="group flex items-center gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-[#222]">
                            {exp.description || "(no description)"}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#888]">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colorClasses}`}
                            >
                              {exp.category}
                            </span>
                            <span>{exp.date}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-medium text-[#c0392b]">
                            −${exp.amount.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => {
                              setEditingExpense(exp);
                              setShowExpenseModal(true);
                            }}
                            className="rounded p-1 text-[#888] hover:bg-[#f0f0f0] hover:text-[#111]"
                            aria-label="Edit expense"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="rounded p-1 text-[#ccc] hover:bg-[#fde8e8] hover:text-[#c0392b]"
                            aria-label="Delete expense"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expense Modal */}
      {showExpenseModal && (
        <ExpenseModal
          expense={editingExpense}
          onSave={handleSaveExpense}
          onClose={() => {
            setShowExpenseModal(false);
            setEditingExpense(null);
          }}
        />
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
  borderColor,
  sub,
  subColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: string;
  borderColor: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-[#e0e0e0] border-l-[3px] ${borderColor} bg-white p-4`}
    >
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
        <Icon size={14} />
        {label}
      </div>
      <p className={`text-xl font-semibold ${accent}`}>{value}</p>
      {sub && (
        <p className={`mt-0.5 text-[11px] ${subColor ?? "text-[#888]"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

function ExpenseModal({
  expense,
  onSave,
  onClose,
}: {
  expense: Expense | null;
  onSave: (expense: Expense) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? "Software"
  );
  const [project, setProject] = useState(expense?.project ?? "");
  const [date, setDate] = useState(
    expense?.date ?? new Date().toISOString().split("T")[0]
  );

  const handleSubmit = () => {
    if (!description.trim() || !amount) return;
    onSave({
      id: expense?.id ?? `exp-${nextExpId++}`,
      description: description.trim(),
      amount: parseFloat(amount),
      category,
      project: project.trim() || null,
      date,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-[#e0e0e0] bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#222]">
            {expense ? "Edit Expense" : "Add Expense"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#888] hover:bg-[#f0f0f0]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#555]">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              className="w-full rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#555]">
                Amount
              </label>
              <div className="flex items-center rounded-lg border border-[#e0e0e0] px-3">
                <span className="text-[13px] text-[#aaa]">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full py-2 pl-1 text-[13px] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#555]">
                Category
              </label>
              <CustomSelect
                value={category}
                onChange={(val) => setCategory(val as ExpenseCategory)}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#555]">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#555]">
              Project (optional)
            </label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Which project is this for?"
              className="w-full rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[13px] font-medium text-[#555] hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim() || !amount}
            className="rounded-lg bg-[#111] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-40"
          >
            {expense ? "Save Changes" : "Add Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}
