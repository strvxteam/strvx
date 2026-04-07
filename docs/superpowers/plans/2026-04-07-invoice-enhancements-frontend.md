# Invoice Enhancements — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the invoice list, builder, and detail pages with filtering, live preview, dual-mode detail view, reconciliation status, and recurring schedule management UI.

**Architecture:** Server components for data fetching, client components for interactivity. Follows existing STRVX patterns — Tailwind CSS, Lucide icons, sonner toasts, server actions for mutations.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Lucide React, sonner, server actions.

**Design Spec:** `docs/superpowers/specs/2026-04-07-invoice-enhancements-design.md`
**Design System:** `apps/internal/DESIGN.md`

**Dependency:** This plan depends on the backend plan being completed first (schema changes, queries, server actions must exist). If working in parallel, coordinate on shared types.

---

## File Structure

### New files
- `apps/internal/src/app/(app)/invoices/invoices-client.tsx` — client component for invoice list with filters/search
- `apps/internal/src/app/(app)/invoices/[id]/invoice-detail-client.tsx` — client component for dual-mode detail view
- `apps/internal/src/app/(app)/invoices/[id]/invoice-document-view.tsx` — document-centered invoice view (also used for PDF preview)

### Modified files
- `apps/internal/src/app/(app)/invoices/page.tsx` — refactor to use new client component
- `apps/internal/src/app/(app)/invoices/new/invoice-builder-client.tsx` — redesign with side-by-side layout and type selector
- `apps/internal/src/app/(app)/invoices/new/page.tsx` — pass recurring schedule data
- `apps/internal/src/app/(app)/invoices/[id]/page.tsx` — refactor to use dual-mode client component
- `apps/internal/src/app/(app)/invoices/[id]/invoice-actions.tsx` — add PDF download button, update layout
- `apps/internal/src/lib/mock-finance.ts` — add `cancelled` to InvoiceStatus, add reconciliation status type

---

### Task 1: Update Types and Constants

**Files:**
- Modify: `apps/internal/src/lib/mock-finance.ts`

- [ ] **Step 1: Update the InvoiceStatus type to include cancelled**

Replace the existing `InvoiceStatus` type:

```typescript
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
```

- [ ] **Step 2: Add cancelled to INVOICE_STATUS_COLORS**

Replace the existing `INVOICE_STATUS_COLORS`:

```typescript
export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-[#f0f0f0] text-[#555]",
  sent: "bg-[#e8f0fe] text-[#1a73e8]",
  paid: "bg-[#e8f5e9] text-[#27ae60]",
  overdue: "bg-[#fde8e8] text-[#c0392b]",
  cancelled: "bg-[#f0f0f0] text-[#888]",
};
```

- [ ] **Step 3: Add reconciliation status type**

Add after the existing exports:

```typescript
export type ReconciliationStatus = "matched" | "unmatched" | "partial" | "manual" | null;

export const RECONCILIATION_LABELS: Record<string, { text: string; color: string }> = {
  matched: { text: "✓ matched", color: "text-[#27ae60]" },
  unmatched: { text: "⏳ pending", color: "text-[#f39c12]" },
  partial: { text: "~ partial", color: "text-[#1a73e8]" },
  manual: { text: "✓ manual", color: "text-[#27ae60]" },
};
```

- [ ] **Step 4: Commit**

```bash
git add apps/internal/src/lib/mock-finance.ts
git commit -m "feat: add cancelled status and reconciliation types"
```

---

### Task 2: Invoice List Page — Client Component with Filters

**Files:**
- Create: `apps/internal/src/app/(app)/invoices/invoices-client.tsx`

- [ ] **Step 1: Create the client component**

```tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { INVOICE_STATUS_COLORS, RECONCILIATION_LABELS, type InvoiceStatus, type ReconciliationStatus } from "@/lib/mock-finance";

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

const STATUS_TABS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Overdue", value: "overdue" },
  { label: "Paid", value: "paid" },
];

export function InvoicesClient({
  invoices,
  clients,
  outstanding,
  overdue,
  paidThisMonth,
  reconciledAmount,
}: {
  invoices: InvoiceRow[];
  clients: string[];
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
  reconciledAmount: number;
}) {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (clientFilter !== "all" && inv.client !== clientFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!inv.number.toLowerCase().includes(q) && !inv.client.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, clientFilter, search]);

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
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Outstanding</p>
          <p className="mt-1 text-xl font-semibold text-[#222]">${outstanding.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Overdue</p>
          <p className="mt-1 text-xl font-semibold text-[#c0392b]">${overdue.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Paid This Month</p>
          <p className="mt-1 text-xl font-semibold text-[#27ae60]">${paidThisMonth.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Reconciled</p>
          <p className="mt-1 text-xl font-semibold text-[#1a73e8]">${reconciledAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex gap-0.5 rounded-lg bg-[#f0f0f0] p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-white text-[#222] shadow-sm"
                  : "text-[#888] hover:text-[#555]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <input
          type="text"
          placeholder="Search invoices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] text-[#222] placeholder-[#aaa] outline-none focus:border-[#1a73e8] w-[180px]"
        />
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] text-[#555] outline-none focus:border-[#1a73e8]"
        >
          <option value="all">All Clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ minHeight: "calc(100vh - 340px)" }} className="flex flex-col rounded-lg border border-[#e0e0e0] bg-white">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-[#e0e0e0]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Invoice #</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Client</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Amount</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Status</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Due Date</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Bank</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Payment</th>
            </tr>
          </thead>
        </table>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[#bbb] py-12">
              {invoices.length === 0
                ? 'No invoices yet — click "+ New Invoice" to create one'
                : "No invoices match your filters"}
            </div>
          ) : (
            <table className="w-full min-w-[720px]">
              <tbody>
                {filtered.map((inv) => {
                  const recLabel = inv.reconciliationStatus
                    ? RECONCILIATION_LABELS[inv.reconciliationStatus]
                    : null;

                  return (
                    <tr key={inv.id} className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="text-[13px] font-medium text-[#1a73e8] hover:underline">
                          {inv.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#555]">{inv.client}</td>
                      <td className="px-4 py-3 text-[13px] font-medium text-[#222]">${inv.amount.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${INVOICE_STATUS_COLORS[inv.status]}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#555]">{inv.dueDate}</td>
                      <td className="px-4 py-3 text-[13px]">
                        {recLabel ? (
                          <span className={`text-[11px] ${recLabel.color}`}>{recLabel.text}</span>
                        ) : (
                          <span className="text-[#bbb]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        {inv.stripePaymentUrl ? (
                          <a href={inv.stripePaymentUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1a73e8] hover:underline">
                            Pay →
                          </a>
                        ) : (
                          <span className="text-[#bbb]">—</span>
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/invoices/invoices-client.tsx
git commit -m "feat: add invoice list client component with status filters, search, and reconciliation column"
```

---

### Task 3: Invoice List Page — Server Component Refactor

**Files:**
- Modify: `apps/internal/src/app/(app)/invoices/page.tsx`

- [ ] **Step 1: Refactor the page to use the new client component**

Replace the entire file:

```tsx
import type { Metadata } from "next";
import { type Invoice } from "@/lib/mock-finance";
import { getInvoices } from "@/lib/queries";
import { InvoicesClient } from "./invoices-client";
import { db } from "@/lib/db";
import { invoiceReconciliations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const real = await getInvoices();

  // Fetch reconciliation status for all invoices
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
    reconciliationStatus: recMap.get(inv.id) as import("@/lib/mock-finance").ReconciliationStatus ?? null,
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/invoices/page.tsx
git commit -m "refactor: invoice list page to use client component with filters and reconciliation"
```

---

### Task 4: Invoice Detail — Document View Component

**Files:**
- Create: `apps/internal/src/app/(app)/invoices/[id]/invoice-document-view.tsx`

- [ ] **Step 1: Create the document-centered view component**

```tsx
import type { Invoice } from "@/lib/mock-finance";

export function InvoiceDocumentView({
  invoice,
  reconciliation,
}: {
  invoice: Invoice & { clientEmail?: string; notes?: string };
  reconciliation?: { status: string; stripeAmount?: string; mercuryAmount?: string; matchedAt?: string } | null;
}) {
  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const tax = Math.round(subtotal * 0.0875 * 100) / 100;
  const total = subtotal + tax;
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      {/* Centered invoice document */}
      <div className="mx-auto max-w-2xl rounded-lg border border-[#e0e0e0] bg-white p-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#222]">strvx</h1>
            <p className="text-[12px] text-[#888]">Digital Agency</p>
            <p className="text-[12px] text-[#888]">San Diego, CA</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888]">Invoice</p>
            <p className="text-[15px] font-semibold text-[#222]">{invoice.number}</p>
          </div>
        </div>

        {/* Bill to + Dates */}
        <div className="mb-6 flex justify-between border-b border-[#e0e0e0] pb-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888]">Bill To</p>
            <p className="mt-1 text-[14px] font-medium text-[#222]">{invoice.client}</p>
            {invoice.clientEmail && <p className="text-[12px] text-[#888]">{invoice.clientEmail}</p>}
          </div>
          <div className="text-right text-[13px]">
            <p><span className="text-[#888]">Issued:</span> {invoice.date}</p>
            <p className="mt-0.5"><span className="text-[#888]">Due:</span> {invoice.dueDate}</p>
          </div>
        </div>

        {/* Line items */}
        <table className="mb-4 w-full">
          <thead>
            <tr className="border-b-2 border-[#e0e0e0]">
              <th className="py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#888]">Description</th>
              <th className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[#888]">Qty</th>
              <th className="py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-[#888]">Rate</th>
              <th className="py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-[#888]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-[#f0f0f0]">
                <td className="py-2.5 text-[13px] text-[#222]">{li.description}</td>
                <td className="py-2.5 text-center text-[13px] text-[#555]">{li.quantity}</td>
                <td className="py-2.5 text-right text-[13px] text-[#555]">${fmt(li.rate)}</td>
                <td className="py-2.5 text-right text-[13px] font-medium text-[#222]">${fmt(li.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-56">
            <div className="flex justify-between py-1 text-[13px]">
              <span className="text-[#888]">Subtotal</span>
              <span>${fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between py-1 text-[13px]">
              <span className="text-[#888]">Tax (8.75%)</span>
              <span>${fmt(tax)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t-2 border-[#222] pt-2 text-[15px] font-semibold">
              <span>Total</span>
              <span>${fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Paid banner */}
        {invoice.paidDate && (
          <div className="mt-6 rounded border border-[#e8f5e9] bg-[#e8f5e9] px-4 py-3">
            <p className="text-[13px] font-medium text-[#27ae60]">Paid on {invoice.paidDate}</p>
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-6 rounded bg-[#f9f9f9] px-4 py-3 text-[12px] text-[#555]">{invoice.notes}</div>
        )}

        {/* Footer */}
        <div className="mt-8 border-t border-[#f0f0f0] pt-4 text-center text-[11px] text-[#aaa]">
          strvx &middot; San Diego, CA &middot; strvxteam@gmail.com
        </div>
      </div>

      {/* Reconciliation bar */}
      {reconciliation && (
        <div className="mx-auto mt-3 max-w-2xl rounded-lg border border-[#e0e0e0] bg-white px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888] mb-1.5">Payment & Reconciliation</p>
          <div className="flex gap-5 text-[12px]">
            <span>
              <span className="text-[#888]">Stripe:</span>{" "}
              {invoice.paidDate ? <span className="text-[#27ae60]">Paid {invoice.paidDate}</span> : <span className="text-[#888]">—</span>}
            </span>
            {reconciliation.stripeAmount && (
              <span><span className="text-[#888]">Payout:</span> ${Number(reconciliation.stripeAmount).toLocaleString()}</span>
            )}
            <span>
              <span className="text-[#888]">Mercury:</span>{" "}
              {reconciliation.status === "matched" || reconciliation.status === "manual" ? (
                <span className="text-[#27ae60]">✓ Matched</span>
              ) : (
                <span className="text-[#f39c12]">⏳ Pending</span>
              )}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/invoices/\[id\]/invoice-document-view.tsx
git commit -m "feat: add document-centered invoice view component"
```

---

### Task 5: Invoice Detail — Dual-Mode Client Component

**Files:**
- Create: `apps/internal/src/app/(app)/invoices/[id]/invoice-detail-client.tsx`

- [ ] **Step 1: Create the dual-mode detail client component**

```tsx
"use client";

import { useState } from "react";
import { INVOICE_STATUS_COLORS, type Invoice } from "@/lib/mock-finance";
import { InvoiceDocumentView } from "./invoice-document-view";
import { InvoiceActions } from "./invoice-actions";

interface ReconciliationData {
  status: string;
  stripePayoutId?: string | null;
  stripeAmount?: string | null;
  mercuryAmount?: string | null;
  matchedAt?: string | null;
}

interface RecurringData {
  type: string;
  frequency: string;
  nextRunDate: string;
}

export function InvoiceDetailClient({
  invoice,
  reconciliation,
  recurring,
}: {
  invoice: Invoice & {
    clientEmail?: string;
    notes?: string;
    stripeInvoiceId?: string | null;
    stripePaymentUrl?: string | null;
  };
  reconciliation: ReconciliationData | null;
  recurring: RecurringData | null;
}) {
  const [view, setView] = useState<"dashboard" | "document">("dashboard");

  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const tax = Math.round(subtotal * 0.0875 * 100) / 100;
  const total = subtotal + tax;
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const timelineSteps = [
    { label: "Created", date: invoice.date, done: true },
    { label: "Sent", date: invoice.status !== "draft" ? invoice.date : null, done: invoice.status !== "draft" },
    { label: "Paid", date: invoice.paidDate, done: invoice.status === "paid" },
    {
      label: "Reconciled",
      date: reconciliation?.matchedAt ? new Date(reconciliation.matchedAt).toLocaleDateString() : null,
      done: reconciliation?.status === "matched" || reconciliation?.status === "manual",
    },
  ];

  return (
    <div>
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/invoices" className="text-[12px] text-[#1a73e8] hover:underline">← Invoices</a>
          <h1 className="text-lg font-semibold text-[#222]">{invoice.number}</h1>
          <span className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${INVOICE_STATUS_COLORS[invoice.status]}`}>
            {invoice.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(view === "dashboard" ? "document" : "dashboard")}
            className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            {view === "dashboard" ? "View Invoice" : "Dashboard"}
          </button>
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            Download PDF
          </a>
          <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
        </div>
      </div>

      {view === "document" ? (
        <InvoiceDocumentView invoice={invoice} reconciliation={reconciliation} />
      ) : (
        /* Dashboard view */
        <div className="flex gap-5">
          {/* Left column */}
          <div className="flex-[1.3] space-y-4">
            {/* Client card */}
            <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
              <div className="flex justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888]">Client</p>
                  <p className="mt-1 text-[14px] font-medium text-[#222]">{invoice.client}</p>
                  {invoice.clientEmail && <p className="text-[12px] text-[#888]">{invoice.clientEmail}</p>}
                </div>
                <div className="text-right">
                  <p className="text-[12px]"><span className="text-[#888]">Issued:</span> {invoice.date}</p>
                  <p className="text-[12px]"><span className="text-[#888]">Due:</span> {invoice.dueDate}</p>
                  <p className="mt-2 text-lg font-semibold text-[#222]">${fmt(total)}</p>
                </div>
              </div>
            </div>

            {/* Line items card */}
            <div className="overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
              <div className="border-b border-[#e0e0e0] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[#888]">
                Line Items
              </div>
              <table className="w-full">
                <tbody>
                  {invoice.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-[#f0f0f0]">
                      <td className="px-4 py-2.5 text-[12px] text-[#222]">{li.description}</td>
                      <td className="px-4 py-2.5 text-center text-[12px] text-[#555]">{li.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-[12px] text-[#555]">${fmt(li.rate)}</td>
                      <td className="px-4 py-2.5 text-right text-[12px] font-medium text-[#222]">${fmt(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-[#e0e0e0] px-4 py-2.5 text-right text-[12px]">
                <span className="text-[#888]">Subtotal: ${fmt(subtotal)}</span>
                <span className="mx-2 text-[#888]">·</span>
                <span className="text-[#888]">Tax: ${fmt(tax)}</span>
                <span className="mx-2 text-[#888]">·</span>
                <span className="font-semibold">Total: ${fmt(total)}</span>
              </div>
            </div>

            {/* Notes card */}
            {invoice.notes && (
              <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888] mb-1">Notes</p>
                <p className="text-[12px] text-[#555]">{invoice.notes}</p>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex-[0.7] space-y-4">
            {/* Payment timeline */}
            <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888] mb-3">Payment Timeline</p>
              <div className="space-y-0">
                {timelineSteps.map((step, i) => (
                  <div key={step.label} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`h-2 w-2 rounded-full ${step.done ? "bg-[#27ae60]" : "bg-[#e0e0e0]"}`} />
                      {i < timelineSteps.length - 1 && (
                        <div className={`h-6 w-px ${step.done ? "bg-[#27ae60]" : "bg-[#e0e0e0]"}`} />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className={`text-[11px] font-medium ${step.done ? "text-[#222]" : "text-[#aaa]"}`}>{step.label}</p>
                      <p className={`text-[10px] ${step.done ? "text-[#888]" : "text-[#f39c12]"}`}>
                        {step.date ?? (step.done ? "" : "Pending")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stripe details */}
            {invoice.stripeInvoiceId && (
              <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888] mb-2">Stripe</p>
                <p className="text-[11px]"><span className="text-[#888]">Invoice:</span> {invoice.stripeInvoiceId.slice(0, 12)}...</p>
                {reconciliation?.stripeAmount && (
                  <p className="text-[11px]"><span className="text-[#888]">Payout:</span> ${Number(reconciliation.stripeAmount).toLocaleString()}</p>
                )}
              </div>
            )}

            {/* Recurring info */}
            {recurring && (
              <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888] mb-2">Recurring</p>
                <p className="text-[11px] text-[#555] capitalize">{recurring.type} — {recurring.frequency}</p>
                <p className="text-[11px] text-[#888] mt-0.5">Next: {recurring.nextRunDate}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/invoices/\[id\]/invoice-detail-client.tsx
git commit -m "feat: add dual-mode invoice detail component (dashboard + document view)"
```

---

### Task 6: Invoice Detail — Server Page Refactor

**Files:**
- Modify: `apps/internal/src/app/(app)/invoices/[id]/page.tsx`

- [ ] **Step 1: Refactor to use the dual-mode client component**

Replace the entire file:

```tsx
import { notFound } from "next/navigation";
import { type Invoice } from "@/lib/mock-finance";
import { getInvoice, getReconciliationForInvoice } from "@/lib/queries";
import { InvoiceDetailClient } from "./invoice-detail-client";
import { db } from "@/lib/db";
import { recurringInvoiceSchedules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const real = await getInvoice(id);

  if (!real) notFound();

  const invoice: Invoice & {
    clientEmail?: string;
    notes?: string;
    stripeInvoiceId?: string | null;
    stripePaymentUrl?: string | null;
  } = {
    id: real.id,
    number: real.invoiceNumber,
    client: real.clientName,
    amount: Number(real.amount),
    status: real.status as Invoice["status"],
    date: real.issuedDate || "",
    dueDate: real.dueDate || "",
    paidDate: real.paidDate || null,
    lineItems: Array.isArray(real.lineItems) ? (real.lineItems as Invoice["lineItems"]) : [],
    clientEmail: real.clientEmail || undefined,
    notes: real.notes || undefined,
    stripeInvoiceId: real.stripeInvoiceId,
    stripePaymentUrl: real.stripePaymentUrl,
  };

  // Fetch reconciliation data
  const reconciliation = await getReconciliationForInvoice(id);
  const recData = reconciliation
    ? {
        status: reconciliation.status,
        stripePayoutId: reconciliation.stripePayoutId,
        stripeAmount: reconciliation.stripeAmount,
        mercuryAmount: reconciliation.mercuryAmount,
        matchedAt: reconciliation.matchedAt?.toISOString() ?? null,
      }
    : null;

  // Fetch recurring schedule data if linked
  let recurringData = null;
  if (real.recurringScheduleId) {
    const [schedule] = await db
      .select({
        type: recurringInvoiceSchedules.type,
        frequency: recurringInvoiceSchedules.frequency,
        nextRunDate: recurringInvoiceSchedules.nextRunDate,
      })
      .from(recurringInvoiceSchedules)
      .where(eq(recurringInvoiceSchedules.id, real.recurringScheduleId));

    if (schedule) {
      recurringData = {
        type: schedule.type,
        frequency: schedule.frequency,
        nextRunDate: schedule.nextRunDate,
      };
    }
  }

  return (
    <InvoiceDetailClient
      invoice={invoice}
      reconciliation={recData}
      recurring={recurringData}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/invoices/\[id\]/page.tsx
git commit -m "refactor: invoice detail page to use dual-mode client component"
```

---

### Task 7: Update Invoice Actions Component

**Files:**
- Modify: `apps/internal/src/app/(app)/invoices/[id]/invoice-actions.tsx`

- [ ] **Step 1: Refactor to inline buttons (no wrapper div — parent handles layout)**

Replace the entire file:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { sendInvoiceAction, voidInvoiceAction, markInvoicePaidAction } from "@/app/actions";
import { toast } from "sonner";

export function InvoiceActions({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const btnBase = "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40";

  async function handleAction(action: () => Promise<void>, successMsg: string) {
    setLoading(true);
    try {
      await action();
      toast.success(successMsg);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  if (status === "draft") {
    return (
      <>
        <Link href={`/invoices/${invoiceId}/edit`} className={`${btnBase} border border-[#e0e0e0] text-[#555] hover:bg-[#f5f5f5]`}>
          Edit
        </Link>
        <button
          onClick={() => handleAction(() => sendInvoiceAction(invoiceId), "Invoice sent")}
          disabled={loading}
          className={`${btnBase} bg-[#1a73e8] text-white hover:bg-[#1557b0]`}
        >
          {loading ? "Sending..." : "Send Invoice"}
        </button>
      </>
    );
  }

  if (status === "sent" || status === "overdue") {
    return (
      <>
        <button
          onClick={() => handleAction(() => voidInvoiceAction(invoiceId), "Invoice voided")}
          disabled={loading}
          className={`${btnBase} border border-[#e0e0e0] text-[#c0392b] hover:bg-[#fde8e8]`}
        >
          Void
        </button>
        <button
          onClick={() => handleAction(() => markInvoicePaidAction(invoiceId), "Marked as paid")}
          disabled={loading}
          className={`${btnBase} bg-[#27ae60] text-white hover:bg-[#219a52]`}
        >
          {loading ? "Updating..." : "Mark Paid"}
        </button>
      </>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/invoices/\[id\]/invoice-actions.tsx
git commit -m "refactor: invoice actions to inline fragments for flexible layout"
```

---

### Task 8: Invoice Builder — Side-by-Side Redesign with Type Selector

**Files:**
- Modify: `apps/internal/src/app/(app)/invoices/new/invoice-builder-client.tsx`

This is the largest frontend task. The builder needs:
1. Invoice type toggle (one-time / retainer / commission / milestone)
2. Side-by-side layout (form left, live preview right)
3. Type-specific fields that appear based on selection
4. For recurring types: "Create Schedule" replaces "Send Invoice"

- [ ] **Step 1: Rewrite the invoice builder**

This is a complete rewrite of `invoice-builder-client.tsx`. The file is 741 lines currently. The new version should:

1. Add a `type` state: `"one-time" | "retainer" | "commission" | "milestone"`
2. Split the layout into a two-column flex container
3. Left column: form with type toggle at top, then type-specific fields
4. Right column: `InvoiceDocumentView` component rendering a live preview as the user fills in the form
5. When type is `retainer`:
   - Show frequency selector (weekly/biweekly/monthly/quarterly)
   - Show auto-send toggle
   - Line items become the "template" that repeats each cycle
6. When type is `commission`:
   - Show commission rate % input
   - Show revenue source URL input
   - Show frequency selector
   - Show auto-send toggle
   - Hide line items (generated automatically)
7. When type is `milestone`:
   - Show milestone schedule builder (rows of date + description + amount)
   - Each row is one milestone payment
   - No frequency selector (dates are explicit)
8. Bottom action bar:
   - One-time: "Save Draft" | "Preview PDF" | "Send Invoice"
   - Recurring types: "Save Draft" | "Create Schedule" (calls `createRecurringScheduleAction`)

Due to the size of this component (700+ lines), the implementing agent should read the existing `invoice-builder-client.tsx` first and preserve the core form logic while restructuring the layout. Key things to preserve:
- `handleCompanyChange`, `handleLineItemChange`, `handleAddLineItem`, `handleRemoveLineItem`
- `handleNetDays`, `validateForm`
- `handleSaveDraft` and `handleSendInvoice` flows
- Company dropdown using `CustomSelect`
- The `PreviewModal` can be removed since preview is now always visible

- [ ] **Step 2: Update the `new/page.tsx` server component to pass recurring schedule support data**

Add engagement data to the page props so the builder can create schedules linked to engagements.

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/app/\(app\)/invoices/new/
git commit -m "feat: redesign invoice builder with side-by-side layout and type selector"
```

---

### Task 9: Type Check and Verify

- [ ] **Step 1: Run TypeScript type checker**

Run: `cd ~/strvx && pnpm typecheck`
Expected: No type errors.

- [ ] **Step 2: Run dev server and manually verify**

Run: `cd ~/strvx && pnpm dev`
Check:
- `/invoices` — filters, search, reconciliation column render
- `/invoices/new` — side-by-side layout, type selector
- `/invoices/[id]` — dual-mode toggle (dashboard ↔ document)
- `/api/invoices/[id]/pdf` — PDF renders in browser

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve frontend issues from invoice UI redesign"
```
