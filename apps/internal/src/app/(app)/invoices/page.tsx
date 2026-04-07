import type { Metadata } from "next";
import { type Invoice } from "@/lib/mock-finance";
import { getInvoices } from "@/lib/queries";
import { InvoicesClient } from "./invoices-client";
import { db } from "@/lib/db";
import { invoiceReconciliations } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const real = await getInvoices();
  const reconciliations = await db.select().from(invoiceReconciliations);
  const recMap = new Map(reconciliations.map((r) => [r.invoiceId, r.status]));

  const invoiceData = real.map((inv) => ({
    id: inv.id,
    number: inv.invoiceNumber,
    client: inv.clientName,
    amount: Number(inv.amount),
    status: inv.status as Invoice["status"],
    date: inv.issuedDate || "",
    dueDate: inv.dueDate || "",
    paidDate: inv.paidDate || null,
    stripePaymentUrl: inv.stripePaymentUrl || null,
    reconciliationStatus: (recMap.get(inv.id) ?? null) as import("@/lib/mock-finance").ReconciliationStatus,
  }));

  const outstanding = invoiceData
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.amount, 0);

  const overdue = invoiceData
    .filter((inv) => inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.amount, 0);

  const paidThisMonth = invoiceData
    .filter((inv) => {
      if (inv.status !== "paid" || !inv.paidDate) return false;
      const paid = new Date(inv.paidDate);
      const now = new Date();
      return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear();
    })
    .reduce((sum, inv) => sum + inv.amount, 0);

  const reconciledAmount = invoiceData
    .filter((inv) => inv.reconciliationStatus === "matched" || inv.reconciliationStatus === "manual")
    .reduce((sum, inv) => sum + inv.amount, 0);

  const clients = [...new Set(invoiceData.map((inv) => inv.client))].sort();

  return (
    <InvoicesClient
      invoices={invoiceData}
      clients={clients}
      outstanding={outstanding}
      overdue={overdue}
      paidThisMonth={paidThisMonth}
      reconciledAmount={reconciledAmount}
    />
  );
}
