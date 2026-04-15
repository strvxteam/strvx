"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPartnerInvoice, updatePartnerInvoice } from "@/app/actions";
import type { getAllPartnerInvoices, getPartnerInvoiceSummary, getPartnerOptions } from "@/lib/partner-queries";
import type { getPipelineEngagements } from "@/lib/queries";

type Invoice = Awaited<ReturnType<typeof getAllPartnerInvoices>>[number];
type Summary = Awaited<ReturnType<typeof getPartnerInvoiceSummary>>;
type PartnerOption = Awaited<ReturnType<typeof getPartnerOptions>>[number];
type Engagement = Awaited<ReturnType<typeof getPipelineEngagements>>[number];

type Direction = "all" | "payable" | "receivable";
type Status = "all" | "draft" | "sent" | "paid" | "overdue" | "cancelled";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-[#f1f5f9] text-[#64748b]",
  cancelled: "bg-[#f1f5f9] text-[#64748b]",
  sent: "bg-[#e8f0fe] text-[#1a73e8]",
  paid: "bg-[#e8f5e9] text-[#27ae60]",
  overdue: "bg-[#fde8e8] text-[#e74c3c]",
};

function formatUSD(amount: number | string) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(val: Date | string | null | undefined) {
  if (!val) return null;
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(dueAt: Date | string | null | undefined, status: string) {
  if (status === "paid" || status === "cancelled") return false;
  if (!dueAt) return false;
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return d < new Date();
}

// ── Summary Card ─────────────────────────────────────────

function SummaryCard({
  label,
  amount,
  bg,
  color,
}: {
  label: string;
  amount: number | string;
  bg: string;
  color: string;
}) {
  return (
    <div
      className="rounded-[6px] border border-[#e0e0e0] p-4"
      style={{ backgroundColor: bg }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold" style={{ color }}>
        {formatUSD(amount)}
      </p>
    </div>
  );
}

// ── Inline Detail Panel ──────────────────────────────────

function InvoiceDetailPanel({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState<InvoiceStatus>(
    (invoice.status as InvoiceStatus) ?? "draft"
  );

  async function handleStatusChange(newStatus: string) {
    setUpdating(true);
    try {
      await updatePartnerInvoice(invoice.id, { status: newStatus });
      setStatus(newStatus as InvoiceStatus);
      toast.success("Status updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdating(false);
    }
  }

  async function handleMarkPaid() {
    setUpdating(true);
    try {
      await updatePartnerInvoice(invoice.id, {
        status: "paid",
        paidAt: new Date().toISOString(),
      });
      setStatus("paid");
      toast.success("Invoice marked as paid");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as paid");
    } finally {
      setUpdating(false);
    }
  }

  const btnBase =
    "rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40";

  return (
    <div className="border-t border-[#e8f0fe] bg-[#f8fbff] px-4 py-4">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 space-y-3">
          {/* Full description */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Description
            </p>
            <p className="mt-1 text-[13px] text-[#333]">
              {invoice.description || <span className="text-[#bbb]">—</span>}
            </p>
          </div>

          {/* Dates row */}
          <div className="flex gap-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Issued
              </p>
              <p className="mt-0.5 text-[13px] text-[#555]">
                {formatDate(invoice.issuedAt) ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Due
              </p>
              <p className="mt-0.5 text-[13px] text-[#555]">
                {formatDate(invoice.dueAt) ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Paid
              </p>
              <p className="mt-0.5 text-[13px] text-[#555]">
                {formatDate(invoice.paidAt) ?? "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={status}
            disabled={updating}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-[6px] border border-[#e0e0e0] bg-white px-2 py-1.5 text-[13px] text-[#333] disabled:opacity-40"
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {status !== "paid" && (
            <button
              onClick={handleMarkPaid}
              disabled={updating}
              className={`${btnBase} bg-[#27ae60] text-white hover:bg-[#219a52]`}
            >
              {updating ? "Updating..." : "Mark as Paid"}
            </button>
          )}

          <button
            onClick={onClose}
            className={`${btnBase} border border-[#e0e0e0] text-[#555] hover:bg-[#f5f5f5]`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Invoice Modal ────────────────────────────────────

function NewInvoiceModal({
  partnerOptions,
  engagements,
  onClose,
}: {
  partnerOptions: PartnerOption[];
  engagements: Engagement[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    partnerId: "",
    direction: "payable" as "payable" | "receivable",
    amount: "",
    description: "",
    engagementId: "",
    issuedAt: "",
    dueAt: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partnerId) {
      toast.error("Please select a partner");
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }

    setSubmitting(true);
    try {
      await createPartnerInvoice({
        partnerId: form.partnerId,
        direction: form.direction,
        amount,
        description: form.description.trim(),
        engagementId: form.engagementId || undefined,
        issuedAt: form.issuedAt || undefined,
        dueAt: form.dueAt || undefined,
      });
      toast.success("Invoice created");
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-[6px] border border-[#e0e0e0] bg-white px-3 py-1.5 text-[14px] text-[#333] placeholder-[#bbb] focus:border-[#1a73e8] focus:outline-none";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-[#888] mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-[6px] border border-[#e0e0e0] bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#111]">New Partner Invoice</h2>
          <button
            onClick={onClose}
            className="text-[#aaa] transition-colors hover:text-[#555]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Partner */}
          <div>
            <label className={labelCls}>Partner</label>
            <select
              value={form.partnerId}
              onChange={(e) => set("partnerId", e.target.value)}
              className={inputCls}
              required
            >
              <option value="">Select partner...</option>
              {partnerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.company ? ` — ${p.company}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Direction */}
          <div>
            <label className={labelCls}>Direction</label>
            <div className="flex gap-4">
              {(["payable", "receivable"] as const).map((dir) => (
                <label
                  key={dir}
                  className="flex cursor-pointer items-center gap-2 text-[13px] text-[#333]"
                >
                  <input
                    type="radio"
                    name="direction"
                    value={dir}
                    checked={form.direction === dir}
                    onChange={() => set("direction", dir)}
                    className="accent-[#1a73e8]"
                  />
                  <span className="capitalize">{dir}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className={labelCls}>Amount (USD)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              className={inputCls}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <input
              type="text"
              placeholder="e.g. Referral commission for Acme deal"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className={inputCls}
              required
            />
          </div>

          {/* Engagement (optional) */}
          <div>
            <label className={labelCls}>Engagement (optional)</label>
            <select
              value={form.engagementId}
              onChange={(e) => set("engagementId", e.target.value)}
              className={inputCls}
            >
              <option value="">None</option>
              {engagements.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.companyName} — {eng.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Issued Date</label>
              <input
                type="date"
                value={form.issuedAt}
                onChange={(e) => set("issuedAt", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input
                type="date"
                value={form.dueAt}
                onChange={(e) => set("dueAt", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[6px] border border-[#e0e0e0] px-4 py-1.5 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-[6px] bg-[#111] px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-40"
            >
              {submitting ? "Creating..." : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Table Component ─────────────────────────────────

export function PartnerInvoicesTable({
  initialInvoices,
  summary,
  partnerOptions,
  engagements,
}: {
  initialInvoices: Invoice[];
  summary: Summary;
  partnerOptions: PartnerOption[];
  engagements: Engagement[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Filters
  const [directionFilter, setDirectionFilter] = useState<Direction>("all");
  const [statusFilter, setStatusFilter] = useState<Status>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return initialInvoices.filter((inv) => {
      if (directionFilter !== "all" && inv.direction !== directionFilter) return false;
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (partnerFilter !== "all" && inv.partnerId !== partnerFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!(inv.description ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [initialInvoices, directionFilter, statusFilter, partnerFilter, search]);

  const selectCls =
    "rounded-[6px] border border-[#e0e0e0] bg-white px-2.5 py-1.5 text-[13px] text-[#333] focus:border-[#1a73e8] focus:outline-none";

  return (
    <div className="flex flex-1 flex-col">
      {/* Summary bar */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <SummaryCard
          label="Outstanding Payable"
          amount={summary?.totalPayable ?? 0}
          bg="#fef3e2"
          color="#f39c12"
        />
        <SummaryCard
          label="Outstanding Receivable"
          amount={summary?.totalReceivable ?? 0}
          bg="#e8f0fe"
          color="#1a73e8"
        />
        <SummaryCard
          label="Paid This Month"
          amount={summary?.paidThisMonth ?? 0}
          bg="#e8f5e9"
          color="#27ae60"
        />
      </div>

      {/* Filters + New button */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as Direction)}
          className={selectCls}
        >
          <option value="all">All Directions</option>
          <option value="payable">Payable</option>
          <option value="receivable">Receivable</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status)}
          className={selectCls}
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
          className={selectCls}
        >
          <option value="all">All Partners</option>
          {partnerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search by description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-[6px] border border-[#e0e0e0] bg-white px-3 py-1.5 text-[13px] text-[#333] placeholder-[#bbb] focus:border-[#1a73e8] focus:outline-none"
        />

        <div className="ml-auto">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-[6px] bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333]"
          >
            + New Invoice
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 rounded-[6px] border border-[#e0e0e0] bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e0e0e0]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Partner
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Direction
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Amount
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Description
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Status
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Engagement
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Issued
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Due
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-[13px] text-[#aaa]"
                >
                  No invoices found.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const expanded = expandedId === inv.id;
                const overdue = isOverdue(inv.dueAt, inv.status ?? "draft");
                const desc = inv.description ?? "";
                const truncated =
                  desc.length > 50 ? desc.slice(0, 50) + "..." : desc;

                return (
                  <>
                    <tr
                      key={inv.id}
                      onClick={() =>
                        setExpandedId(expanded ? null : inv.id)
                      }
                      className={`cursor-pointer border-b border-[#e0e0e0] transition-colors hover:bg-[#fafafa] ${expanded ? "bg-[#f8fbff]" : ""}`}
                    >
                      <td className="px-4 py-3 text-[13px] font-medium text-[#222]">
                        {inv.partnerName}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${
                            inv.direction === "payable"
                              ? "bg-[#fef3e2] text-[#f39c12]"
                              : "bg-[#e8f0fe] text-[#1a73e8]"
                          }`}
                        >
                          {inv.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium text-[#222]">
                        {formatUSD(inv.amount)}
                      </td>
                      <td
                        className="max-w-[200px] px-4 py-3 text-[13px] text-[#555]"
                        title={desc}
                      >
                        {truncated || <span className="text-[#bbb]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${
                            STATUS_COLORS[inv.status ?? "draft"] ??
                            STATUS_COLORS.draft
                          }`}
                        >
                          {inv.status ?? "draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#555]">
                        {inv.engagementName ?? (
                          <span className="text-[#bbb]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#555]">
                        {formatDate(inv.issuedAt) ?? (
                          <span className="text-[#bbb]">—</span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-[13px] ${
                          overdue ? "font-medium text-[#e74c3c]" : "text-[#555]"
                        }`}
                      >
                        {formatDate(inv.dueAt) ?? (
                          <span className="text-[#bbb]">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${inv.id}-detail`}>
                        <td colSpan={8} className="p-0">
                          <InvoiceDetailPanel
                            invoice={inv}
                            onClose={() => setExpandedId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* New Invoice Modal */}
      {showModal && (
        <NewInvoiceModal
          partnerOptions={partnerOptions}
          engagements={engagements}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
