"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  INVOICE_STATUS_COLORS,
  RECONCILIATION_LABELS,
  type InvoiceStatus,
  type ReconciliationStatus,
} from "@/lib/mock-finance";
import { deleteInvoiceAction } from "@/app/actions";

interface InvoiceRow {
  id: string;
  number: string;
  client: string;
  amount: number;
  status: InvoiceStatus;
  date: string;
  dueDate: string;
  paidDate: string | null;
  stripePaymentUrl: string | null;
  reconciliationStatus: ReconciliationStatus;
}

interface InvoicesClientProps {
  invoices: InvoiceRow[];
  clients: string[];
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
  reconciledAmount: number;
}

export function InvoicesClient({
  invoices,
  clients,
  outstanding,
  overdue,
  paidThisMonth,
  reconciledAmount,
}: InvoicesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (clientFilter !== "all" && inv.client !== clientFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !inv.number.toLowerCase().includes(q) &&
          !inv.client.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [invoices, clientFilter, search]);

  const handleDelete = (id: string, number: string) => {
    if (!confirm(`Delete invoice ${number}? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteInvoiceAction(id);
        toast.success(`Invoice ${number} deleted`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Invoices</h1>
        <Link
          href="/invoices/new"
          className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333]"
        >
          + New Invoice
        </Link>
      </div>

      {/* Search + Client filter */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="Search invoices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[#e0e0e0] bg-white px-3 py-1.5 text-[13px] text-[#222] placeholder-[#bbb] outline-none focus:border-[#999] w-64"
        />
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="rounded-lg border border-[#e0e0e0] bg-white px-3 py-1.5 text-[13px] text-[#222] outline-none focus:border-[#999]"
        >
          <option value="all">All Clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
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
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Reconciled
          </p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            ${reconciledAmount.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Table */}
      <div
        style={{ minHeight: "calc(100vh - 300px)" }}
        className="flex flex-col overflow-hidden rounded-lg border border-[#e0e0e0] bg-white"
      >
        <div className="flex-1 overflow-y-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "26%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b-2 border-[#e0e0e0]">
                <th className="border-r border-[#f0f0f0] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Invoice #
                </th>
                <th className="border-r border-[#f0f0f0] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Client
                </th>
                <th className="border-r border-[#f0f0f0] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Amount
                </th>
                <th className="border-r border-[#f0f0f0] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Status
                </th>
                <th className="border-r border-[#f0f0f0] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Due Date
                </th>
                <th className="border-r border-[#f0f0f0] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Bank
                </th>
                <th className="border-r border-[#f0f0f0] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Payment
                </th>
                <th className="px-2 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-16 text-center text-[13px] text-[#bbb]"
                  >
                    {invoices.length === 0
                      ? 'No invoices yet — click "+ New Invoice" to create one'
                      : "No invoices match your filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const recLabel = inv.reconciliationStatus
                    ? RECONCILIATION_LABELS[inv.reconciliationStatus]
                    : null;
                  return (
                    <tr
                      key={inv.id}
                      className="group border-b border-[#e8e8e8] transition-colors hover:bg-[#fafafa]"
                    >
                      <td className="border-r border-[#f0f0f0] px-4 py-3">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="text-[13px] font-medium text-[#1a73e8] hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </td>
                      <td className="border-r border-[#f0f0f0] px-4 py-3 text-[13px] text-[#555] truncate">
                        {inv.client}
                      </td>
                      <td className="border-r border-[#f0f0f0] px-4 py-3 text-right text-[13px] font-medium text-[#222]">
                        ${inv.amount.toLocaleString()}
                      </td>
                      <td className="border-r border-[#f0f0f0] px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${INVOICE_STATUS_COLORS[inv.status]}`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="border-r border-[#f0f0f0] px-4 py-3 text-[13px] text-[#555]">
                        {inv.dueDate}
                      </td>
                      <td className="border-r border-[#f0f0f0] px-4 py-3 text-[12px]">
                        {recLabel ? (
                          <span className={`font-medium ${recLabel.color}`}>
                            {recLabel.text}
                          </span>
                        ) : (
                          <span className="text-[#bbb]">—</span>
                        )}
                      </td>
                      <td className="border-r border-[#f0f0f0] px-4 py-3 text-[13px]">
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
                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(inv.id, inv.number)}
                          disabled={isPending}
                          className="rounded p-1.5 text-[#bbb] opacity-0 transition-colors hover:bg-[#fde8e8] hover:text-[#c0392b] group-hover:opacity-100 disabled:opacity-40"
                          title="Delete invoice"
                          aria-label={`Delete invoice ${inv.number}`}
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
