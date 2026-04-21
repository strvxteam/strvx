import FinancesPage from "./finances-client";
import type { Invoice } from "@/lib/mock-finance";
import { getInvoices, getMRR, getMonthlyRevenue, getPipelineEngagements, getProjectProfitability, getCreditCards, getAllCardBudgets, getAllCardReceipts, getAllCardAlerts } from "@/lib/queries";
import { getMercuryAccounts, getAllMercuryTransactions, isMercuryConfigured, getAllMercuryCards, type MercuryCard } from "@/lib/mercury";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const metadata = { title: "Finances" };

export default async function FinancesServerPage() {
  const [realInvoices, mrr, monthlyRevenueRows, engagements, profitabilityRaw] = await Promise.all([
    getInvoices(),
    getMRR(),
    getMonthlyRevenue(),
    getPipelineEngagements(),
    getProjectProfitability(),
  ]);

  // Fetch Mercury bank data if configured
  let bankAccounts: { id: string; name: string; kind: string; currentBalance: number; availableBalance: number }[] = [];
  let bankTransactions: { id: string; amount: number; counterpartyName: string; note: string | null; createdAt: string; status: string; kind: string }[] = [];
  let mercuryCards: MercuryCard[] = [];
  const mercuryConnected = isMercuryConfigured();

  // Mercury is now the single source of truth for Finances P&L.
  let mercuryRevenue = 0;
  let mercuryExpenses = 0;
  let mercuryOutstanding = 0; // sum of pending Mercury transactions (money in motion)
  let mercuryMRR = 0;         // deposits in the last 30 days (rolling)
  const mercuryMonthlyRevenueMap = new Map<string, number>(); // yyyy-mm -> amount
  const mercuryClientRevenueMap = new Map<string, number>();  // counterparty -> amount
  const mercuryVendorExpenseMap = new Map<string, number>();  // counterparty -> amount
  if (mercuryConnected) {
    try {
      const [accounts, transactions, cards] = await Promise.all([
        getMercuryAccounts(),
        getAllMercuryTransactions({ limit: 200 }),
        getAllMercuryCards(),
      ]);
      mercuryCards = cards;
      bankAccounts = accounts.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        currentBalance: a.currentBalance,
        availableBalance: a.availableBalance,
      }));
      bankTransactions = transactions.slice(0, 50).map((t) => ({
        id: t.id,
        amount: t.amount,
        counterpartyName: t.counterpartyName,
        note: t.note,
        createdAt: t.createdAt,
        status: t.status,
        kind: t.kind,
      }));

      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      for (const t of transactions) {
        if (t.status === "failed" || t.status === "cancelled") continue;
        // Track pending/sent separately for any downstream views, but still
        // count them toward income/expenses so the P&L matches real cash flow.
        if (t.status === "pending" || t.status === "sent") {
          mercuryOutstanding += Math.abs(t.amount);
        }
        if (t.amount > 0) {
          mercuryRevenue += t.amount;
          // MRR approximation: revenue settled within the last 30 days
          const ts = new Date(t.createdAt).getTime();
          if (!Number.isNaN(ts) && ts >= thirtyDaysAgo) {
            mercuryMRR += t.amount;
          }
          // Monthly revenue bucket
          const d = new Date(t.createdAt);
          if (!Number.isNaN(d.getTime())) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            mercuryMonthlyRevenueMap.set(key, (mercuryMonthlyRevenueMap.get(key) ?? 0) + t.amount);
          }
          // By counterparty (client)
          const client = t.counterpartyName || "Unknown";
          mercuryClientRevenueMap.set(client, (mercuryClientRevenueMap.get(client) ?? 0) + t.amount);
        } else {
          const abs = Math.abs(t.amount);
          mercuryExpenses += abs;
          // By counterparty (vendor)
          const vendor = t.counterpartyName || "Unknown";
          mercuryVendorExpenseMap.set(vendor, (mercuryVendorExpenseMap.get(vendor) ?? 0) + abs);
        }
      }
    } catch (err) {
      console.error("[Finances] Mercury fetch failed:", err);
    }
  }

  // Serialize maps → sorted arrays for the client
  const mercuryMonthlyRevenue = Array.from(mercuryMonthlyRevenueMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, revenue]) => {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      return { month: label, revenue };
    });

  const mercuryClientRevenue = Array.from(mercuryClientRevenueMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const mercuryVendorExpenses = Array.from(mercuryVendorExpenseMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Fetch local card enrichment data
  const [localCards, allBudgets, allReceipts, allAlerts] = await Promise.all([
    getCreditCards(),
    getAllCardBudgets(),
    getAllCardReceipts(),
    getAllCardAlerts(),
  ]);

  const cardEnrichment = localCards.map((c) => ({
    id: c.id,
    mercuryCardId: c.mercuryCardId,
    cardNickname: c.cardNickname,
    assignedEmployee: c.assignedEmployee,
    creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
    rewardRate: c.rewardRate ? Number(c.rewardRate) : null,
  }));

  const budgets = allBudgets.map((b) => ({
    id: b.id,
    creditCardId: b.creditCardId,
    category: b.category,
    monthlyLimit: Number(b.monthlyLimit),
  }));

  const receipts = allReceipts.map((r) => ({
    id: r.id,
    mercuryTransactionId: r.mercuryTransactionId,
    creditCardId: r.creditCardId,
    fileUrl: r.fileUrl,
  }));

  const alerts = allAlerts.map((a) => ({
    id: a.id,
    creditCardId: a.creditCardId,
    alertType: a.alertType as "limit_threshold" | "unusual_spend" | "payment_due",
    thresholdValue: Number(a.thresholdValue),
    enabled: a.enabled,
  }));

  const mercuryCardsList = (mercuryConnected ? mercuryCards : []).map((c) => ({
    cardId: c.cardId,
    nameOnCard: c.nameOnCard,
    lastFourDigits: c.lastFourDigits,
    network: c.network,
    status: c.status,
    physicalCardStatus: c.physicalCardStatus,
    createdAt: c.createdAt,
  }));

  const invoices: Invoice[] = realInvoices.map((inv) => ({
    id: inv.id,
    number: inv.invoiceNumber,
    client: inv.clientName,
    amount: Number(inv.amount),
    status: inv.status as Invoice["status"],
    date: inv.issuedDate || "",
    dueDate: inv.dueDate || "",
    paidDate: inv.paidDate || null,
    lineItems: Array.isArray(inv.lineItems)
      ? (inv.lineItems as Invoice["lineItems"])
      : [],
  }));

  const pipelineEngagements = engagements.map((e) => ({
    name: e.name,
    companyName: e.companyName,
    dealValue: e.dealValue,
    probability: e.probability,
    stage: e.stage,
  }));

  const monthlyRevenue = (monthlyRevenueRows as unknown as { month: string; revenue: string }[]).map((r) => ({
    month: new Date(r.month).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    revenue: Number(r.revenue),
  }));

  const profitability = profitabilityRaw.map((p) => ({
    projectName: p.project_name,
    client: p.client ?? "",
    totalHours: Number(p.total_hours),
    billableHours: Number(p.billable_hours),
    revenue: Number(p.revenue),
  }));

  return (
    <FinancesPage
      invoices={invoices}
      monthlyRevenue={monthlyRevenue}
      mrr={mrr}
      pipelineEngagements={pipelineEngagements}
      mercuryConnected={mercuryConnected}
      bankAccounts={bankAccounts}
      bankTransactions={bankTransactions}
      profitability={profitability}
      mercuryCards={mercuryCardsList}
      cardEnrichment={cardEnrichment}
      cardBudgets={budgets}
      cardReceipts={receipts}
      cardAlerts={alerts}
      mercuryRevenue={mercuryRevenue}
      mercuryExpenses={mercuryExpenses}
      mercuryOutstanding={mercuryOutstanding}
      mercuryMRR={mercuryMRR}
      mercuryMonthlyRevenue={mercuryMonthlyRevenue}
      mercuryClientRevenue={mercuryClientRevenue}
      mercuryVendorExpenses={mercuryVendorExpenses}
    />
  );
}
