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
import { CreditCardsTab } from "./components/credit-cards/credit-cards-tab";

type TabView = "overview" | "credit-cards";

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
}: FinancesPageProps = {}) {
  const invoiceData = invoicesProp ?? [];
  const monthlyRevenueData = monthlyRevenueProp ?? [];
  const initialExpenses = expensesProp ?? [];

  const [tab, setTab] = useState<TabView>("overview");
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Revenue calculations
  const paidInvoices = invoiceData.filter((inv) => inv.status === "paid");
  const invoiceRevenue = paidInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const currentMonth = monthlyRevenueData[monthlyRevenueData.length - 1] ?? { month: "", revenue: 0 };
  const prevMonth = monthlyRevenueData[monthlyRevenueData.length - 2];
  const revenueGrowth = prevMonth
    ? ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
    : 0;
  const ytdRevenue = monthlyRevenueData.reduce((sum, m) => sum + m.revenue, 0);
  const mrr = mrrProp ?? 0;
  const maxMonthlyRevenue = monthlyRevenueData.length > 0
    ? Math.max(...monthlyRevenueData.map((m) => m.revenue))
    : 1;

  // Expense calculations
  const localExpensesTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  // When Mercury is connected, the top P&L reflects real bank activity (revenue = deposits,
  // expenses = withdrawals). Invoicing + manual expenses are separate views (see Revenue
  // and Expenses tabs). This matches the user's mental model — the card should reflect
  // what's actually moving through the account.
  const totalRevenue = mercuryConnected ? mercuryRevenue : invoiceRevenue;
  const totalExpenses = mercuryConnected ? mercuryExpenses : localExpensesTotal;
  const profit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  // Expense by category
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of expenses) {
      map[exp.category] = (map[exp.category] ?? 0) + exp.amount;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  // Revenue by client
  const clientRevenue = (() => {
    const map: Record<string, number> = {};
    for (const inv of paidInvoices) {
      map[inv.client] = (map[inv.client] ?? 0) + inv.amount;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  })();

  // Pipeline forecast
  const pipelineDeals = (pipelineEngagementsProp ?? [])
    .filter(
      (eng) =>
        eng.dealValue &&
        eng.probability &&
        !["closed_won", "closed_lost"].includes(eng.stage)
    )
    .map((eng) => ({
      name: eng.name,
      client: eng.companyName,
      value: Number(eng.dealValue),
      probability: Number(eng.probability),
      weighted: Math.round(
        Number(eng.dealValue) * (Number(eng.probability) / 100)
      ),
    }));

  const totalWeighted = pipelineDeals.reduce((sum, d) => sum + d.weighted, 0);

  // Outstanding invoices
  const outstanding = invoiceData.filter(
    (inv) => inv.status === "sent" || inv.status === "overdue"
  );
  const totalOutstanding = outstanding.reduce(
    (sum, inv) => sum + inv.amount,
    0
  );
  const overdueAmount = invoiceData
    .filter((inv) => inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.amount, 0);

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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Finances</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[#e0e0e0] bg-white">
            {(["overview", "credit-cards"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-[13px] font-medium capitalize transition-colors first:rounded-l-lg last:rounded-r-lg ${
                  tab === t
                    ? "bg-[#f0f0f0] text-[#111]"
                    : "text-[#555] hover:bg-[#fafafa]"
                }`}
              >
                {t === "credit-cards" ? "Credit Cards" : t}
              </button>
            ))}
          </div>
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

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-6">
          {/* Revenue by month */}
          <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[#333]">
              Revenue by Month
            </h2>
            <div className="flex items-end gap-3" style={{ height: 180 }}>
              {monthlyRevenueData.map((m, i) => {
                const heightPct = (m.revenue / maxMonthlyRevenue) * 100;
                return (
                  <div
                    key={m.month}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-[11px] font-medium text-[#222]">
                      ${(m.revenue / 1000).toFixed(1)}k
                    </span>
                    <div
                      className="w-full rounded-t bg-[#1a73e8] transition-all"
                      style={{
                        height: `${heightPct}%`,
                        opacity: 0.6 + (i / monthlyRevenueData.length) * 0.4,
                      }}
                    />
                    <span className="text-[10px] text-[#888]">
                      {m.month.split(" ")[0].slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Expense breakdown */}
          <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[#333]">
              Expenses by Category
            </h2>
            <div className="flex flex-col gap-2.5">
              {categoryTotals.map(([cat, amount]) => {
                const pct = localExpensesTotal > 0 ? (amount / localExpensesTotal) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-[#555]">{cat}</span>
                      <span className="font-medium text-[#222]">
                        ${amount.toLocaleString()} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f0f0f0]">
                      <div
                        className="h-full rounded-full bg-[#1a73e8] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Revenue by client */}
          <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[#333]">
              Revenue by Client
            </h2>
            <div className="flex flex-col gap-2">
              {clientRevenue.map(([client, revenue]) => {
                const pct =
                  invoiceRevenue > 0 ? (revenue / invoiceRevenue) * 100 : 0;
                return (
                  <div key={client} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="truncate font-medium text-[#222]">
                          {client}
                        </span>
                        <span className="shrink-0 text-[#555]">
                          ${revenue.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                        <div
                          className="h-full rounded-full bg-[#27ae60]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-10 text-right text-[11px] text-[#888]">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pipeline forecast */}
          <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[#333]">
              Pipeline Forecast
            </h2>
            <div className="flex flex-col gap-2">
              {pipelineDeals.map((deal) => (
                <div
                  key={deal.name}
                  className="flex items-center justify-between rounded-md border border-[#f0f0f0] px-3 py-2"
                >
                  <div>
                    <p className="text-[12px] font-medium text-[#222]">
                      {deal.name}
                    </p>
                    <p className="text-[11px] text-[#888]">{deal.client}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-medium text-[#222]">
                      ${deal.weighted.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[#888]">
                      {deal.probability}% of ${deal.value.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between rounded-md bg-[#f5f5f5] px-3 py-2">
                <span className="text-[12px] font-semibold text-[#333]">
                  Total Weighted
                </span>
                <span className="text-[14px] font-bold text-[#1a73e8]">
                  ${totalWeighted.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Recent Bank Transactions */}
          {mercuryConnected && bankTransactions.length > 0 && (
            <div className="col-span-2 rounded-lg border border-[#e0e0e0] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#333]">Recent Bank Transactions</h2>
              <div className="flex flex-col divide-y divide-[#f0f0f0]">
                {bankTransactions.slice(0, 15).map((txn) => (
                  <div key={txn.id} className="flex items-center gap-3 py-2">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${txn.amount >= 0 ? "bg-[#e6f9e6]" : "bg-[#fde8e8]"}`}>
                      {txn.amount >= 0 ? <ArrowDown size={12} className="text-[#27ae60]" /> : <ArrowUp size={12} className="text-[#c0392b]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[#222]">{txn.counterpartyName || "Unknown"}</p>
                      {txn.note && <p className="truncate text-[11px] text-[#888]">{txn.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-[13px] font-medium ${txn.amount >= 0 ? "text-[#27ae60]" : "text-[#222]"}`}>
                        {txn.amount >= 0 ? "+" : ""}${Math.abs(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-[#aaa]">
                        {new Date(txn.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Profitability by Project */}
          {profitability.length > 0 && (
            <div className="col-span-2 rounded-lg border border-[#e0e0e0] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#333]">Profitability by Project</h2>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e0e0e0]">
                    <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Project</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">Revenue</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">Hours</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">$/hr</th>
                  </tr>
                </thead>
                <tbody>
                  {profitability.map((p) => {
                    const effectiveRate = p.billableHours > 0 ? p.revenue / p.billableHours : 0;
                    return (
                      <tr key={p.projectName} className="border-b border-[#f0f0f0] hover:bg-[#fafafa]">
                        <td className="py-2">
                          <p className="text-[13px] font-medium text-[#222]">{p.projectName}</p>
                          {p.client && <p className="text-[11px] text-[#888]">{p.client}</p>}
                        </td>
                        <td className="py-2 text-right text-[13px] font-medium text-[#27ae60]">
                          ${p.revenue.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-[13px] text-[#555]">
                          {p.billableHours.toFixed(1)}h
                          {p.totalHours !== p.billableHours && (
                            <span className="text-[11px] text-[#aaa]"> / {p.totalHours.toFixed(1)}h</span>
                          )}
                        </td>
                        <td className={`py-2 text-right text-[13px] font-medium ${effectiveRate >= 150 ? "text-[#27ae60]" : effectiveRate >= 75 ? "text-[#e67e22]" : "text-[#c0392b]"}`}>
                          {effectiveRate > 0 ? `$${Math.round(effectiveRate)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === "credit-cards" && (
        <CreditCardsTab
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardBudgets={cardBudgets}
          cardReceipts={cardReceipts}
          cardAlerts={cardAlerts}
          bankTransactions={bankTransactions}
          mercuryConnected={mercuryConnected}
        />
      )}

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
