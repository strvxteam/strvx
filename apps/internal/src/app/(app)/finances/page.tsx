import FinancesPage from "./finances-client";
import type { Invoice, Expense } from "@/lib/mock-finance";
import { getInvoices, getExpenses, getMRR, getMonthlyRevenue, getPipelineEngagements } from "@/lib/queries";

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
    />
  );
}
