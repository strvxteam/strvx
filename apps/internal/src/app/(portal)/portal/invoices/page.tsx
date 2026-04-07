export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPortalCompany } from "../portal-auth";
import { PortalNav } from "../portal-nav";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-[#f0f0f0] text-[#666]" },
  sent: { label: "Awaiting Payment", color: "bg-[#e8f0fe] text-[#1a73e8]" },
  paid: { label: "Paid", color: "bg-[#e6f9e6] text-[#27ae60]" },
  overdue: { label: "Overdue", color: "bg-[#fde8e8] text-[#c0392b]" },
  cancelled: { label: "Cancelled", color: "bg-[#f0f0f0] text-[#999]" },
};

export default async function PortalInvoicesPage() {
  const company = await getPortalCompany();
  if (!company) redirect("/portal/login");

  const companyInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amount: invoices.amount,
      taxRate: invoices.taxRate,
      status: invoices.status,
      issuedDate: invoices.issuedDate,
      dueDate: invoices.dueDate,
      paidDate: invoices.paidDate,
      stripePaymentUrl: invoices.stripePaymentUrl,
      notes: invoices.notes,
    })
    .from(invoices)
    .where(eq(invoices.clientName, company.name));

  const outstanding = companyInvoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const paid = companyInvoices.filter((i) => i.status === "paid");
  const other = companyInvoices.filter((i) => i.status !== "sent" && i.status !== "overdue" && i.status !== "paid");

  const totalOutstanding = outstanding.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPaid = paid.reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-[#111]">Invoices</h1>
      <p className="mb-6 text-[13px] text-[#888]">{companyInvoices.length} invoice{companyInvoices.length !== 1 ? "s" : ""} for {company.name}</p>

      <PortalNav />

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Outstanding</p>
          <p className={`text-2xl font-bold ${totalOutstanding > 0 ? "text-[#e67e22]" : "text-[#222]"}`}>
            ${totalOutstanding.toLocaleString()}
          </p>
          <p className="mt-1 text-[12px] text-[#888]">{outstanding.length} invoice{outstanding.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Total Paid</p>
          <p className="text-2xl font-bold text-[#27ae60]">${totalPaid.toLocaleString()}</p>
          <p className="mt-1 text-[12px] text-[#888]">{paid.length} invoice{paid.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Total Invoiced</p>
          <p className="text-2xl font-bold text-[#222]">${(totalOutstanding + totalPaid).toLocaleString()}</p>
          <p className="mt-1 text-[12px] text-[#888]">{companyInvoices.length} total</p>
        </div>
      </div>

      {companyInvoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e0e0e0] bg-white py-16 text-center">
          <p className="text-[15px] font-medium text-[#aaa]">No invoices yet</p>
          <p className="mt-1 text-[13px] text-[#ccc]">Invoices will appear here once issued.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#e0e0e0] bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e0e0e0]">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Invoice</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">Amount</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Issued</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Due</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Status</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]"></th>
              </tr>
            </thead>
            <tbody>
              {[...outstanding, ...other, ...paid].map((inv) => {
                const status = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft;
                const tax = Number(inv.amount) * (Number(inv.taxRate ?? 0) / 100);
                const total = Number(inv.amount) + tax;
                return (
                  <tr key={inv.id} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                    <td className="px-5 py-4 text-[14px] font-medium text-[#222]">{inv.invoiceNumber}</td>
                    <td className="px-5 py-4 text-right text-[14px] font-semibold text-[#222]">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-4 text-[13px] text-[#555]">{inv.issuedDate ?? "—"}</td>
                    <td className="px-5 py-4 text-[13px] text-[#555]">{inv.dueDate ?? "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {inv.stripePaymentUrl && (inv.status === "sent" || inv.status === "overdue") && (
                        <a href={inv.stripePaymentUrl} target="_blank" rel="noopener noreferrer"
                          className="rounded-lg bg-[#111] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#333]">
                          Pay Now
                        </a>
                      )}
                      {inv.status === "paid" && inv.paidDate && (
                        <span className="text-[12px] text-[#27ae60]">Paid {inv.paidDate}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
