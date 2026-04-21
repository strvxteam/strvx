"use client";

import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Landmark,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type {
  Invoice,
  MonthlyRevenue,
} from "@/lib/mock-finance";

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
  mercuryConnected = false,
  bankAccounts = [],
  bankTransactions = [],
  mercuryRevenue = 0,
  mercuryExpenses = 0,
}: FinancesPageProps = {}) {
  const totalRevenue = mercuryRevenue;
  const totalExpenses = mercuryExpenses;
  const profit = totalRevenue - totalExpenses;

  const inflows = bankTransactions.filter((t) => t.amount >= 0);
  const outflows = bankTransactions.filter((t) => t.amount < 0);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex shrink-0 items-center justify-between">
        <h1 className="text-xl font-semibold">Finances</h1>
      </div>

      {/* P&L Summary */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <MetricCard
          icon={TrendingUp}
          label="Income"
          value={`$${totalRevenue.toLocaleString()}`}
          accent="text-[#27ae60]"
          borderColor="border-l-[#27ae60]"
        />
        <MetricCard
          icon={TrendingDown}
          label="Expenses"
          value={`$${totalExpenses.toLocaleString()}`}
          accent="text-[#c0392b]"
          borderColor="border-l-[#c0392b]"
        />
        <MetricCard
          icon={PiggyBank}
          label="Net"
          value={`$${profit.toLocaleString()}`}
          accent={profit >= 0 ? "text-[#27ae60]" : "text-[#c0392b]"}
          borderColor={
            profit >= 0 ? "border-l-[#27ae60]" : "border-l-[#c0392b]"
          }
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

      {/* Money In + Money Out — both auto from Mercury */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-6">
        <TransactionPanel
          title="Money In"
          transactions={inflows}
          mercuryConnected={mercuryConnected}
          direction="in"
        />
        <TransactionPanel
          title="Money Out"
          transactions={outflows}
          mercuryConnected={mercuryConnected}
          direction="out"
        />
      </div>
    </div>
  );
}

function TransactionPanel({
  title,
  transactions,
  mercuryConnected,
  direction,
}: {
  title: string;
  transactions: BankTransaction[];
  mercuryConnected: boolean;
  direction: "in" | "out";
}) {
  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const amountColor = direction === "in" ? "text-[#27ae60]" : "text-[#c0392b]";
  const iconBg = direction === "in" ? "bg-[#e6f9e6]" : "bg-[#fde8e8]";
  const Icon = direction === "in" ? ArrowDown : ArrowUp;
  const iconColor = direction === "in" ? "text-[#27ae60]" : "text-[#c0392b]";

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#333]">{title}</h2>
        <span className="text-[11px] text-[#888]">
          {transactions.length > 0
            ? `${transactions.length} · $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "no entries"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!mercuryConnected ? (
          <div className="flex h-full items-center justify-center px-6 py-10 text-center text-[12px] text-[#aaa]">
            Mercury not connected. Configure MERCURY_API_TOKEN to see activity.
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 py-10 text-center text-[12px] text-[#aaa]">
            {direction === "in" ? "No incoming transactions yet." : "No outgoing transactions yet."}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#f0f0f0]">
            {transactions.map((txn) => (
              <div key={txn.id} className="flex items-center gap-3 px-4 py-2.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconBg}`}
                >
                  <Icon size={12} className={iconColor} />
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
                  <p className={`text-[13px] font-medium ${amountColor}`}>
                    {direction === "in" ? "+" : "−"}${Math.abs(txn.amount).toLocaleString(undefined, {
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
