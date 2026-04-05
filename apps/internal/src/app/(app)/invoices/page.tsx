import type { Metadata } from "next";
import Link from "next/link";
import { INVOICE_STATUS_COLORS, type Invoice } from "@/lib/mock-finance";

export const metadata: Metadata = { title: "Invoices" };
import { getInvoices } from "@/lib/queries";

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const real = await getInvoices();
  const invoiceData: (Invoice & { stripePaymentUrl: string | null })[] = real.map((inv) => ({
    id: inv.id,
    number: inv.invoiceNumber,
    client: inv.clientName,
    amount: Number(inv.amount),
    status: inv.status as Invoice["status"],
    date: inv.issuedDate || "",
    dueDate: inv.dueDate || "",
    paidDate: inv.paidDate || null,
    lineItems: Array.isArray(inv.lineItems) ? (inv.lineItems as Invoice["lineItems"]) : [],
    stripePaymentUrl: inv.stripePaymentUrl || null,
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
      return (
        paid.getMonth() === now.getMonth() &&
        paid.getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Invoices</h1>
        <Link
          href="/invoices/new"
          className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333]"
        >
          + New Invoice
        </Link>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Outstanding
          </p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            ${outstanding.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Overdue
          </p>
          <p className="mt-1 text-xl font-semibold text-[#c0392b]">
            ${overdue.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Paid This Month
          </p>
          <p className="mt-1 text-xl font-semibold text-[#27ae60]">
            ${paidThisMonth.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#e0e0e0] bg-white overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-[#e0e0e0]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Invoice #
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Client
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Amount
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Status
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Date
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Due Date
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Payment
              </th>
            </tr>
          </thead>
          <tbody>
            {invoiceData.map((inv) => (
              <tr
                key={inv.id}
                className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="text-[13px] font-medium text-[#1a73e8] hover:underline"
                  >
                    {inv.number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#555]">
                  {inv.client}
                </td>
                <td className="px-4 py-3 text-[13px] font-medium text-[#222]">
                  ${inv.amount.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${INVOICE_STATUS_COLORS[inv.status]}`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#555]">
                  {inv.date}
                </td>
                <td className="px-4 py-3 text-[13px] text-[#555]">
                  {inv.dueDate}
                </td>
                <td className="px-4 py-3 text-[13px]">
                  {inv.stripePaymentUrl ? (
                    <a
                      href={inv.stripePaymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#1a73e8] hover:underline"
                    >
                      Pay →
                    </a>
                  ) : (
                    <span className="text-[#bbb]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
