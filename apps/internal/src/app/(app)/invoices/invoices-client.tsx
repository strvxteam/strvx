"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  INVOICE_STATUS_COLORS,
  RECONCILIATION_LABELS,
  type InvoiceStatus,
  type ReconciliationStatus,
} from "@/lib/mock-finance";

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

const STATUS_TABS = ["all", "draft", "sent", "overdue", "paid"] as const;

export function InvoicesClient({
  invoices,
  clients,
  outstanding,
  overdue,
  paidThisMonth,
  reconciledAmount,
}: InvoicesClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
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
  }, [invoices, statusFilter, clientFilter, search]);

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

      {/* Status tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-[#e0e0e0] bg-white p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`rounded-md px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
              statusFilter === tab
                ? "bg-[#111] text-white"
                : "text-[#555] hover:bg-[#f5f5f5]"
            }`}
          >
            {tab}
          </button>
        ))}
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
        style={{ minHeight: "calc(100vh - 380px)" }}
        className="flex flex-col rounded-lg border border-[#e0e0e0] bg-white"
      >
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
                Due Date
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Bank
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Payment
              </th>
            </tr>
          </thead>
        </table>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[#bbb] py-12">
              {invoices.length === 0
                ? 'No invoices yet \u2014 click "+ New Invoice" to create one'
                : "No invoices match your filters"}
            </div>
          ) : (
            <table className="w-full min-w-[640px]">
              <tbody>
                {filtered.map((inv) => {
                  const recLabel = inv.reconciliationStatus
                    ? RECONCILIATION_LABELS[inv.reconciliationStatus]
                    : null;

                  return (
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
                        {inv.dueDate}
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        {recLabel ? (
                          <span className={`font-medium ${recLabel.color}`}>
                            {recLabel.text}
                          </span>
                        ) : (
                          <span className="text-[#bbb]">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        {inv.stripePaymentUrl ? (
                          <a
                            href={inv.stripePaymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-[#1a73e8] hover:underline"
                          >
                            Pay &rarr;
                          </a>
                        ) : (
                          <span className="text-[#bbb]">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
