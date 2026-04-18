"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Send } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { saveInvoiceDraft, sendInvoiceAction } from "@/app/actions";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  email: string | null;
  companyId: string;
}

interface Company {
  id: string;
  name: string;
  stripeCustomerId: string | null;
  contacts: Contact[];
}

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
}

interface Engagement {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
}

interface InvoiceBuilderClientProps {
  companies: Company[];
  invoiceNumber: string;
  engagements: Engagement[];
  existingInvoice?: {
    id: string;
    clientCompanyId: string;
    clientEmail: string;
    issuedDate: string;
    dueDate: string;
    notes: string;
    lineItems: LineItem[];
  };
}

// ── Helpers ──────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const emptyLineItem = (): LineItem => ({
  description: "",
  quantity: 1,
  rate: 0,
});

// ── Component ────────────────────────────────────────────

export function InvoiceBuilderClient({
  companies,
  invoiceNumber,
  existingInvoice,
}: InvoiceBuilderClientProps) {
  const router = useRouter();
  const isEdit = Boolean(existingInvoice);

  // Form state
  const [companyId, setCompanyId] = useState(existingInvoice?.clientCompanyId ?? "");
  const [clientEmail, setClientEmail] = useState(existingInvoice?.clientEmail ?? "");
  const [issuedDate, setIssuedDate] = useState(existingInvoice?.issuedDate ?? todayString());
  const [dueDate, setDueDate] = useState(existingInvoice?.dueDate ?? addDays(todayString(), 30));
  const [lineItems, setLineItems] = useState<LineItem[]>(
    existingInvoice?.lineItems.length ? existingInvoice.lineItems : [emptyLineItem()]
  );
  const [notes, setNotes] = useState(existingInvoice?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Derived
  const selectedCompany = companies.find((c) => c.id === companyId);
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.rate, 0);
  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));

  // ── Handlers ─────────────────────────────────────────

  const handleCompanyChange = useCallback(
    (id: string) => {
      setCompanyId(id);
      const company = companies.find((c) => c.id === id);
      if (company?.contacts.length) {
        const firstContactEmail = company.contacts[0].email;
        if (firstContactEmail) {
          setClientEmail(firstContactEmail);
        }
      }
    },
    [companies]
  );

  const handleLineItemChange = useCallback(
    (index: number, field: keyof LineItem, value: string | number) => {
      setLineItems((prev) =>
        prev.map((li, i) => (i === index ? { ...li, [field]: value } : li))
      );
    },
    []
  );

  const handleAddLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }, []);

  const handleRemoveLineItem = useCallback((index: number) => {
    setLineItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const validateForm = useCallback((): string | null => {
    if (!companyId) return "Please select a client";
    if (!clientEmail.trim()) return "Please enter a client email";
    if (!issuedDate) return "Please set an issue date";
    if (!dueDate) return "Please set a due date";
    const validItems = lineItems.filter((li) => li.description.trim());
    if (validItems.length === 0) return "Please add at least one line item with a description";
    const hasInvalidRate = validItems.some((li) => li.rate <= 0);
    if (hasInvalidRate) return "All line items must have a rate greater than 0";
    return null;
  }, [companyId, clientEmail, issuedDate, dueDate, lineItems]);

  const handleSaveDraft = useCallback(async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);
    try {
      const validItems = lineItems.filter((li) => li.description.trim());
      const invoice = await saveInvoiceDraft({
        invoiceNumber,
        clientCompanyId: companyId,
        clientEmail: clientEmail.trim(),
        issuedDate,
        dueDate,
        notes: notes.trim() || undefined,
        lineItems: validItems.map((li) => ({
          description: li.description.trim(),
          quantity: li.quantity,
          rate: li.rate,
        })),
      });
      toast.success("Invoice draft saved");
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }, [validateForm, lineItems, invoiceNumber, companyId, clientEmail, issuedDate, dueDate, notes, router]);

  const handleSendInvoice = useCallback(async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    setSending(true);
    try {
      const validItems = lineItems.filter((li) => li.description.trim());
      const invoice = await saveInvoiceDraft({
        invoiceNumber,
        clientCompanyId: companyId,
        clientEmail: clientEmail.trim(),
        issuedDate,
        dueDate,
        notes: notes.trim() || undefined,
        lineItems: validItems.map((li) => ({
          description: li.description.trim(),
          quantity: li.quantity,
          rate: li.rate,
        })),
      });

      await sendInvoiceAction(invoice.id);
      toast.success("Invoice sent successfully");
      router.push("/invoices");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setSending(false);
    }
  }, [validateForm, lineItems, invoiceNumber, companyId, clientEmail, issuedDate, dueDate, notes, router]);

  // ── Shared styles ────────────────────────────────────

  const inputClass =
    "w-full rounded-[6px] border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-[14px] text-[#222] outline-none transition-colors focus:border-[#1a73e8] focus:bg-white";
  const labelClass =
    "mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#888]";

  // Fixed column widths so form + preview match + stay stable
  const columnStyle: React.CSSProperties = {
    width: 640,
    flexShrink: 0,
    flexGrow: 0,
  };

  // ── Render ───────────────────────────────────────────

  return (
    <div className="mx-auto" style={{ maxWidth: 1320 }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#222]">
            {isEdit ? "Edit Invoice" : "New Invoice"}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#888]">{invoiceNumber}</p>
        </div>
      </div>

      {/* Two fixed-size columns */}
      <div className="flex gap-6">
        {/* Left — Form */}
        <div style={columnStyle}>
          <div className="rounded-[6px] border border-[#e0e0e0] bg-white p-6">
            {/* Client + Email */}
            <div className="mb-5 grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Client</label>
                <CustomSelect
                  value={companyId}
                  onChange={handleCompanyChange}
                  options={companyOptions}
                  placeholder="Select client..."
                />
              </div>
              <div>
                <label className={labelClass}>Client Email</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Dates */}
            <div className="mb-5 grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Issue Date</label>
                <input
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mb-5">
              <label className={labelClass}>Line Items</label>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e0e0e0]">
                    <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Description
                    </th>
                    <th className="w-20 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Qty
                    </th>
                    <th className="w-28 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Rate
                    </th>
                    <th className="w-28 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Amount
                    </th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, index) => {
                    const amount = li.quantity * li.rate;
                    return (
                      <tr
                        key={index}
                        className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]"
                      >
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={li.description}
                            onChange={(e) =>
                              handleLineItemChange(index, "description", e.target.value)
                            }
                            placeholder="Service description..."
                            className="w-full border-0 bg-transparent text-[13px] text-[#222] outline-none placeholder:text-[#ccc]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={1}
                            value={li.quantity}
                            onChange={(e) =>
                              handleLineItemChange(
                                index,
                                "quantity",
                                Math.max(1, parseInt(e.target.value, 10) || 1)
                              )
                            }
                            className="w-full border-0 bg-transparent text-right text-[13px] text-[#222] outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={li.rate || ""}
                            onChange={(e) =>
                              handleLineItemChange(
                                index,
                                "rate",
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            placeholder="0.00"
                            className="w-full border-0 bg-transparent text-right text-[13px] text-[#222] outline-none placeholder:text-[#ccc]"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right text-[13px] font-medium text-[#222]">
                          {formatCurrency(amount)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(index)}
                            disabled={lineItems.length <= 1}
                            className="rounded p-1 text-[#ccc] transition-colors hover:bg-[#fde8e8] hover:text-[#c0392b] disabled:opacity-0"
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <button
                type="button"
                onClick={handleAddLineItem}
                className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[#1a73e8] transition-colors hover:text-[#1557b0]"
              >
                <Plus size={14} strokeWidth={2} />
                Add Line Item
              </button>
            </div>

            {/* Subtotal */}
            <div className="mb-5 flex justify-end">
              <div className="w-64">
                <div className="flex justify-between border-b border-[#f0f0f0] py-2">
                  <span className="text-[13px] text-[#888]">Subtotal</span>
                  <span className="text-[13px] text-[#222]">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between border-b border-[#f0f0f0] py-2">
                  <span className="text-[13px] text-[#888]">Tax</span>
                  <span className="text-[13px] text-[#999]">At checkout</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[14px] font-semibold text-[#222]">Total</span>
                  <span className="text-[14px] font-semibold text-[#222]">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, project details, or any additional notes..."
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* Right — Live Preview (same fixed width) */}
        <div style={columnStyle}>
          <div className="sticky top-6">
            <p className={`${labelClass} mb-2`}>Live Preview</p>
            <LivePreview
              invoiceNumber={invoiceNumber}
              companyName={selectedCompany?.name ?? ""}
              clientEmail={clientEmail}
              issuedDate={issuedDate}
              dueDate={dueDate}
              lineItems={lineItems.filter((li) => li.description.trim())}
              subtotal={subtotal}
              notes={notes}
            />
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="mt-6 flex items-center justify-end gap-2 rounded-[6px] border border-[#e0e0e0] bg-white px-6 py-4">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving || sending}
          className="flex items-center gap-1.5 rounded-[6px] border border-[#e0e0e0] bg-white px-4 py-2 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5] disabled:opacity-40"
        >
          <Save size={14} strokeWidth={2} />
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button
          type="button"
          onClick={handleSendInvoice}
          disabled={saving || sending}
          className="flex items-center gap-1.5 rounded-[6px] bg-[#111] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-40"
        >
          <Send size={14} strokeWidth={2} />
          {sending ? "Sending..." : "Send Invoice"}
        </button>
      </div>
    </div>
  );
}

// ── Live Preview Panel ──────────────────────────────────

function LivePreview({
  invoiceNumber,
  companyName,
  clientEmail,
  issuedDate,
  dueDate,
  lineItems,
  subtotal,
  notes,
}: {
  invoiceNumber: string;
  companyName: string;
  clientEmail: string;
  issuedDate: string;
  dueDate: string;
  lineItems: LineItem[];
  subtotal: number;
  notes: string;
}) {
  return (
    <div className="rounded-[6px] border border-[#e0e0e0] bg-white p-6">
      {/* Branding header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#222]">strvx</h1>
          <p className="text-[12px] text-[#888]">hello@strvx.com</p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <h2 className="text-lg font-semibold text-[#222]">{invoiceNumber}</h2>
            <span className="rounded bg-[#fff3e0] px-2 py-0.5 text-[11px] font-medium capitalize text-[#e65100]">
              Draft
            </span>
          </div>
        </div>
      </div>

      {/* Bill-to + Dates */}
      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Bill To
          </p>
          <p className="mt-1 text-[13px] font-medium text-[#222]">
            {companyName || "—"}
          </p>
          {clientEmail && (
            <p className="text-[12px] text-[#888]">{clientEmail}</p>
          )}
        </div>
        <div className="text-right">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Issue Date
              </p>
              <p className="mt-1 text-[13px] text-[#222]">
                {formatDateDisplay(issuedDate)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Due Date
              </p>
              <p className="mt-1 text-[13px] text-[#222]">
                {formatDateDisplay(dueDate)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <table className="mb-4 w-full">
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
          {lineItems.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-2 py-6 text-center text-[13px] text-[#ccc]"
              >
                No line items
              </td>
            </tr>
          ) : (
            lineItems.map((li, index) => {
              const amount = li.quantity * li.rate;
              return (
                <tr
                  key={index}
                  className="border-b border-[#f0f0f0]"
                >
                  <td className="px-2 py-2.5 text-[13px] text-[#222]">
                    {li.description}
                  </td>
                  <td className="px-2 py-2.5 text-right text-[13px] text-[#555]">
                    {li.quantity}
                  </td>
                  <td className="px-2 py-2.5 text-right text-[13px] text-[#555]">
                    {formatCurrency(li.rate)}
                  </td>
                  <td className="px-2 py-2.5 text-right text-[13px] font-medium text-[#222]">
                    {formatCurrency(amount)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-56">
          <div className="flex justify-between border-b border-[#f0f0f0] py-2">
            <span className="text-[13px] text-[#888]">Subtotal</span>
            <span className="text-[13px] text-[#222]">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between border-b border-[#f0f0f0] py-2">
            <span className="text-[13px] text-[#888]">Tax</span>
            <span className="text-[13px] text-[#999]">At checkout</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[14px] font-semibold text-[#222]">Total</span>
            <span className="text-[14px] font-semibold text-[#222]">
              {formatCurrency(subtotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {notes.trim() && (
        <div className="mt-6 rounded border border-[#f0f0f0] bg-[#fafafa] px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Notes
          </p>
          <p className="whitespace-pre-wrap text-[13px] text-[#555]">{notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 border-t border-[#f0f0f0] pt-4 text-center">
        <p className="text-[11px] text-[#bbb]">
          strvx · hello@strvx.com · Thank you for your business
        </p>
      </div>
    </div>
  );
}
