"use client";

import { useState } from "react";
import Link from "next/link";
import {
  INVOICE_STATUS_COLORS,
  RECONCILIATION_LABELS,
  type Invoice,
} from "@/lib/mock-finance";
import { InvoiceDocumentView } from "./invoice-document-view";
import { InvoiceActions } from "./invoice-actions";

interface InvoiceDetailClientProps {
  invoice: Invoice & {
    clientEmail?: string;
    notes?: string;
    stripeInvoiceId?: string | null;
    stripePaymentUrl?: string | null;
  };
  reconciliation: {
    status: string;
    stripePayoutId?: string | null;
    stripeAmount?: string | null;
    mercuryAmount?: string | null;
    matchedAt?: string | null;
  } | null;
  recurring: {
    type: string;
    frequency: string;
    nextRunDate: string;
  } | null;
}

const TIMELINE_STEPS = ["Created", "Sent", "Paid", "Reconciled"] as const;

function getCompletedSteps(
  invoice: InvoiceDetailClientProps["invoice"],
  reconciliation: InvoiceDetailClientProps["reconciliation"],
): Set<string> {
  const completed = new Set<string>();
  completed.add("Created");
  if (invoice.status !== "draft") completed.add("Sent");
  if (invoice.status === "paid") completed.add("Paid");
  if (
    reconciliation &&
    (reconciliation.status === "matched" || reconciliation.status === "manual")
  )
    completed.add("Reconciled");
  return completed;
}

export function InvoiceDetailClient({
  invoice,
  reconciliation,
  recurring,
}: InvoiceDetailClientProps) {
  const [view, setView] = useState<"dashboard" | "document">("dashboard");

  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const tax = Math.round(subtotal * 0.0875 * 100) / 100;
  const total = subtotal + tax;

  const completedSteps = getCompletedSteps(invoice, reconciliation);

  const recLabel = reconciliation?.status
    ? RECONCILIATION_LABELS[reconciliation.status]
    : null;

  return (
    <div>
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="text-[13px] text-[#888] hover:text-[#555]"
          >
            &larr; Invoices
          </Link>
          <span className="text-[#e0e0e0]">/</span>
          <h1 className="text-lg font-semibold text-[#222]">
            {invoice.number}
          </h1>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${INVOICE_STATUS_COLORS[invoice.status]}`}
          >
            {invoice.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setView(view === "dashboard" ? "document" : "dashboard")
            }
            className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            {view === "dashboard" ? "View Invoice" : "Dashboard"}
          </button>
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            Download PDF
          </a>
          <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
        </div>
      </div>

      {view === "document" ? (
        <InvoiceDocumentView
          invoice={invoice}
          reconciliation={
            reconciliation
              ? {
                  status: reconciliation.status,
                  stripeAmount: reconciliation.stripeAmount ?? undefined,
                  mercuryAmount: reconciliation.mercuryAmount ?? undefined,
                  matchedAt: reconciliation.matchedAt ?? undefined,
                }
              : null
          }
        />
      ) : (
        /* Dashboard view */
        <div className="flex gap-6">
          {/* Left column */}
          <div className="flex-[1.3] space-y-4">
            {/* Client info card */}
            <div className="rounded-lg border border-[#e0e0e0] bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Client
              </p>
              <p className="mt-1 text-[14px] font-medium text-[#222]">
                {invoice.client}
              </p>
              {invoice.clientEmail && (
                <p className="mt-0.5 text-[12px] text-[#888]">
                  {invoice.clientEmail}
                </p>
              )}
              <div className="mt-3 flex gap-6">
                <div>
                  <p className="text-[11px] text-[#888]">Issue Date</p>
                  <p className="text-[13px] text-[#222]">{invoice.date}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#888]">Due Date</p>
                  <p className="text-[13px] text-[#222]">{invoice.dueDate}</p>
                </div>
                {invoice.paidDate && (
                  <div>
                    <p className="text-[11px] text-[#888]">Paid Date</p>
                    <p className="text-[13px] text-[#27ae60]">
                      {invoice.paidDate}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Line items card */}
            <div className="rounded-lg border border-[#e0e0e0] bg-white p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Line Items
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e0e0e0]">
                    <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Description
                    </th>
                    <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Qty
                    </th>
                    <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Rate
                    </th>
                    <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((li) => (
                    <tr
                      key={li.id}
                      className="border-b border-[#f0f0f0]"
                    >
                      <td className="px-2 py-2.5 text-[13px] text-[#222]">
                        {li.description}
                      </td>
                      <td className="px-2 py-2.5 text-right text-[13px] text-[#555]">
                        {li.quantity}
                      </td>
                      <td className="px-2 py-2.5 text-right text-[13px] text-[#555]">
                        ${li.rate.toFixed(2)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-[13px] font-medium text-[#222]">
                        ${li.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Totals row */}
              <div className="mt-2 flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between border-b border-[#f0f0f0] py-2">
                    <span className="text-[13px] text-[#888]">Subtotal</span>
                    <span className="text-[13px] text-[#222]">
                      ${subtotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[#f0f0f0] py-2">
                    <span className="text-[13px] text-[#888]">Tax (8.75%)</span>
                    <span className="text-[13px] text-[#222]">
                      ${tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-[14px] font-semibold text-[#222]">
                      Total
                    </span>
                    <span className="text-[14px] font-semibold text-[#222]">
                      ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes card */}
            {invoice.notes && (
              <div className="rounded-lg border border-[#e0e0e0] bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Notes
                </p>
                <p className="mt-2 text-[13px] text-[#555]">
                  {invoice.notes}
                </p>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex-[0.7] space-y-4">
            {/* Payment timeline */}
            <div className="rounded-lg border border-[#e0e0e0] bg-white p-5">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Payment Timeline
              </p>
              <div className="space-y-3">
                {TIMELINE_STEPS.map((step, i) => {
                  const done = completedSteps.has(step);
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                          done
                            ? "bg-[#27ae60] text-white"
                            : "border border-[#e0e0e0] bg-[#f8f8f8] text-[#bbb]"
                        }`}
                      >
                        {done ? "\u2713" : i + 1}
                      </div>
                      <span
                        className={`text-[13px] ${
                          done
                            ? "font-medium text-[#222]"
                            : "text-[#bbb]"
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stripe details card */}
            <div className="rounded-lg border border-[#e0e0e0] bg-white p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Stripe
              </p>
              {invoice.stripeInvoiceId ? (
                <div className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-[#888]">Invoice ID</span>
                    <span className="font-mono text-[12px] text-[#555]">
                      {invoice.stripeInvoiceId}
                    </span>
                  </div>
                  {invoice.stripePaymentUrl && (
                    <div className="flex justify-between">
                      <span className="text-[#888]">Payment Link</span>
                      <a
                        href={invoice.stripePaymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] font-medium text-[#1a73e8] hover:underline"
                      >
                        Open &rarr;
                      </a>
                    </div>
                  )}
                  {reconciliation && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-[#888]">Reconciliation</span>
                        {recLabel && (
                          <span
                            className={`text-[12px] font-medium ${recLabel.color}`}
                          >
                            {recLabel.text}
                          </span>
                        )}
                      </div>
                      {reconciliation.stripeAmount && (
                        <div className="flex justify-between">
                          <span className="text-[#888]">Stripe Amount</span>
                          <span className="text-[#222]">
                            ${Number(reconciliation.stripeAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      {reconciliation.mercuryAmount && (
                        <div className="flex justify-between">
                          <span className="text-[#888]">Mercury Amount</span>
                          <span className="text-[#222]">
                            ${Number(reconciliation.mercuryAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-[#bbb]">
                  No Stripe invoice linked
                </p>
              )}
            </div>

            {/* Recurring info card */}
            {recurring && (
              <div className="rounded-lg border border-[#e0e0e0] bg-white p-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Recurring Schedule
                </p>
                <div className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-[#888]">Type</span>
                    <span className="capitalize text-[#222]">
                      {recurring.type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#888]">Frequency</span>
                    <span className="capitalize text-[#222]">
                      {recurring.frequency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#888]">Next Run</span>
                    <span className="text-[#222]">
                      {recurring.nextRunDate}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
