import FinancesPage from "./finances-client";
import type { Invoice, Expense } from "@/lib/mock-finance";
import { getInvoices, getExpenses, getMRR, getMonthlyRevenue, getPipelineEngagements } from "@/lib/queries";
import { getMercuryAccounts, getAllMercuryTransactions, isMercuryConfigured } from "@/lib/mercury";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Finances" };

export default async function FinancesServerPage() {
  const [realInvoices, realExpenses, mrr, monthlyRevenueRows, engagements] = await Promise.all([
    getInvoices(),
    getExpenses(),
    getMRR(),
    getMonthlyRevenue(),
    getPipelineEngagements(),
  ]);

  // Fetch Mercury bank data if configured
  let bankAccounts: { id: string; name: string; kind: string; currentBalance: number; availableBalance: number }[] = [];
  let bankTransactions: { id: string; amount: number; counterpartyName: string; note: string | null; createdAt: string; status: string; kind: string }[] = [];
  const mercuryConnected = isMercuryConfigured();

  if (mercuryConnected) {
    try {
      const [accounts, transactions] = await Promise.all([
        getMercuryAccounts(),
        getAllMercuryTransactions({ limit: 50 }),
      ]);
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
    } catch (err) {
      console.error("[Finances] Mercury fetch failed:", err);
    }
  }

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

  const expenses: Expense[] = realExpenses.map((exp) => ({
    id: exp.id,
    date: exp.date,
    description: exp.description,
    category: exp.category as Expense["category"],
    amount: Number(exp.amount),
    project: null,
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

  return (
    <FinancesPage
      invoices={invoices}
      expenses={expenses}
      monthlyRevenue={monthlyRevenue}
      mrr={mrr}
      pipelineEngagements={pipelineEngagements}
      mercuryConnected={mercuryConnected}
      bankAccounts={bankAccounts}
      bankTransactions={bankTransactions}
    />
  );
}
