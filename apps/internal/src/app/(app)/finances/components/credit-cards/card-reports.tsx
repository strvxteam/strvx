"use client";

import { useMemo, useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardBudgetSlim,
  CardReceiptSlim,
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

interface CardReportsProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardBudgets: CardBudgetSlim[];
  cardReceipts: CardReceiptSlim[];
  bankTransactions: BankTransaction[];
}

const CHART_COLORS = [
  "#111111",
  "#555555",
  "#888888",
  "#aaaaaa",
  "#cccccc",
  "#e0e0e0",
];

export function CardReports({
  mercuryCards,
  cardEnrichment,
  cardBudgets,
  cardReceipts,
  bankTransactions,
}: CardReportsProps) {
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");

  const cardTransactions = useMemo(
    () =>
      bankTransactions.filter(
        (t) => t.kind.toLowerCase().includes("card") && t.amount < 0
      ),
    [bankTransactions]
  );

  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    for (const txn of cardTransactions) {
      const d = new Date(txn.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[key] = (months[key] ?? 0) + Math.abs(txn.amount);
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, amount]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        amount: Math.round(amount * 100) / 100,
      }));
  }, [cardTransactions]);

  const topCounterparties = useMemo(() => {
    const map = new Map<string, number>();
    for (const txn of cardTransactions) {
      const name = txn.counterpartyName;
      map.set(name, (map.get(name) ?? 0) + Math.abs(txn.amount));
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, amount]) => ({ name, value: Math.round(amount * 100) / 100 }));
  }, [cardTransactions]);

  const rewardsData = useMemo(() => {
    return cardEnrichment
      .filter((e) => e.rewardRate && e.rewardRate > 0)
      .map((e) => {
        const mc = mercuryCards.find((c) => c.cardId === e.mercuryCardId);
        const cardShare =
          cardTransactions.length > 0
            ? cardTransactions.reduce((s, t) => s + Math.abs(t.amount), 0) /
              cardEnrichment.length
            : 0;
        const earned = cardShare * ((e.rewardRate ?? 0) / 100);
        return {
          name: e.cardNickname ?? mc?.nameOnCard ?? `•••• ${mc?.lastFourDigits}`,
          rate: e.rewardRate ?? 0,
          estimated: Math.round(earned * 100) / 100,
        };
      });
  }, [cardEnrichment, mercuryCards, cardTransactions]);

  const totalRewards = rewardsData.reduce((s, r) => s + r.estimated, 0);

  const employeeSpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of cardEnrichment) {
      if (!e.assignedEmployee) continue;
      const share =
        cardTransactions.reduce((s, t) => s + Math.abs(t.amount), 0) /
        cardEnrichment.filter((x) => x.assignedEmployee).length;
      map.set(
        e.assignedEmployee,
        (map.get(e.assignedEmployee) ?? 0) + share
      );
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount * 100) / 100,
      }));
  }, [cardEnrichment, cardTransactions]);

  function handleExport() {
    let txns = cardTransactions;
    if (exportStart) {
      txns = txns.filter((t) => t.createdAt.split("T")[0] >= exportStart);
    }
    if (exportEnd) {
      txns = txns.filter((t) => t.createdAt.split("T")[0] <= exportEnd);
    }

    const header = "Date,Counterparty,Amount,Status,Kind\n";
    const rows = txns
      .map(
        (t) =>
          `${t.createdAt.split("T")[0]},"${t.counterpartyName}",${t.amount},${t.status},${t.kind}`
      )
      .join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-transactions-${exportStart || "all"}-to-${exportEnd || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6">
      {/* Monthly Spending Chart */}
      <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
        <h3 className="mb-3 text-[13px] font-semibold text-[#333]">
          Monthly Card Spending
        </h3>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#888" }}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#888" }}
                axisLine={false}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
              />
              <Tooltip
                formatter={(value) => [
                  `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                  "Spend",
                ]}
              />
              <Bar dataKey="amount" fill="#111" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-[13px] text-[#999]">
            No transaction data yet.
          </p>
        )}
      </div>

      {/* Top Spending + Rewards side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-[#333]">
            Top Spending By Vendor
          </h3>
          {topCounterparties.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={topCounterparties}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name = "", percent = 0 }) =>
                    `${name.slice(0, 12)}${name.length > 12 ? "..." : ""} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {topCounterparties.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-[13px] text-[#999]">
              No data yet.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#333]">
            <TrendingUp size={14} />
            Rewards Tracker
          </h3>
          {rewardsData.length > 0 ? (
            <div>
              <div className="mb-3 grid gap-2">
                {rewardsData.map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span className="text-[#555]">{r.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[#aaa]">{r.rate}%</span>
                      <span className="font-medium text-[#333]">
                        ${r.estimated.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#f0f0f0] pt-2 text-right text-[13px] font-semibold text-[#111]">
                Total: ${totalRewards.toFixed(2)}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] text-[#999]">
              Configure reward rates on your cards to track cashback.
            </p>
          )}
        </div>
      </div>

      {/* Per-employee spending */}
      {employeeSpend.length > 0 && (
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-[#333]">
            Spending By Employee
          </h3>
          <div className="grid gap-2">
            {employeeSpend.map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between rounded-lg bg-[#fafafa] px-3 py-2 text-[12px]"
              >
                <span className="font-medium text-[#333]">{e.name}</span>
                <span className="text-[#555]">
                  ${e.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export */}
      <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
        <h3 className="mb-3 text-[13px] font-semibold text-[#333]">
          Export Transactions
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">From</span>
            <input
              type="date"
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1.5 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">To</span>
            <input
              type="date"
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1.5 text-[12px]"
            />
          </label>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg bg-[#111] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#333]"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
