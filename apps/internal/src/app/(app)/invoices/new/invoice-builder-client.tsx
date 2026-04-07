"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Send, CalendarPlus } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { saveInvoiceDraft, sendInvoiceAction, createRecurringScheduleAction } from "@/app/actions";
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

interface MilestoneRow {
  date: string;
  description: string;
  amount: number;
}

interface Engagement {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
}

type InvoiceType = "one-time" | "retainer" | "commission" | "milestone";
type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly";

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

const emptyMilestone = (): MilestoneRow => ({
  date: todayString(),
  description: "",
  amount: 0,
});

const INVOICE_TYPES: { value: InvoiceType; label: string }[] = [
  { value: "one-time", label: "One-time" },
  { value: "retainer", label: "Retainer" },
  { value: "commission", label: "Commission" },
  { value: "milestone", label: "Milestone" },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

// ── Component ────────────────────────────────────────────

export function InvoiceBuilderClient({
  companies,
  invoiceNumber,
  engagements,
  existingInvoice,
}: InvoiceBuilderClientProps) {
  const router = useRouter();
  const isEdit = Boolean(existingInvoice);

  // Invoice type — edit mode is always one-time
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("one-time");

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

  // Recurring-type fields
  const [engagementId, setEngagementId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [autoSend, setAutoSend] = useState(false);

  // Commission fields
  const [commissionRate, setCommissionRate] = useState<number>(10);
  const [revenueSourceUrl, setRevenueSourceUrl] = useState("");

  // Milestone fields
  const [milestones, setMilestones] = useState<MilestoneRow[]>([emptyMilestone()]);

  // Derived
  const selectedCompany = companies.find((c) => c.id === companyId);
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.rate, 0);
  const milestoneTotal = milestones.reduce((sum, m) => sum + m.amount, 0);

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));

  // Filter engagements by selected company
  const engagementOptions = engagements
    .filter((e) => !companyId || e.companyId === companyId)
    .map((e) => ({ value: e.id, label: e.name }));

  const isRecurringType = invoiceType !== "one-time";
  const hasLineItems = invoiceType === "one-time" || invoiceType === "retainer";

  // ── Handlers ─────────────────────────────────────────

  const handleCompanyChange = useCallback(
    (id: string) => {
      setCompanyId(id);
      setEngagementId("");
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

  const handleNetDays = useCallback(
    (days: number) => {
      setDueDate(addDays(issuedDate, days));
    },
    [issuedDate]
  );

  const handleMilestoneChange = useCallback(
    (index: number, field: keyof MilestoneRow, value: string | number) => {
      setMilestones((prev) =>
        prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
      );
    },
    []
  );

  const handleAddMilestone = useCallback(() => {
    setMilestones((prev) => [...prev, emptyMilestone()]);
  }, []);

  const handleRemoveMilestone = useCallback((index: number) => {
    setMilestones((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const validateForm = useCallback((): string | null => {
    if (!companyId) return "Please select a client";
    if (!clientEmail.trim()) return "Please enter a client email";

    if (invoiceType === "one-time") {
      if (!issuedDate) return "Please set an issue date";
      if (!dueDate) return "Please set a due date";
      const validItems = lineItems.filter((li) => li.description.trim());
      if (validItems.length === 0) return "Please add at least one line item with a description";
      const hasInvalidRate = validItems.some((li) => li.rate <= 0);
      if (hasInvalidRate) return "All line items must have a rate greater than 0";
    }

    if (isRecurringType) {
      if (!engagementId) return "Please select an engagement";
    }

    if (invoiceType === "retainer") {
      const validItems = lineItems.filter((li) => li.description.trim());
      if (validItems.length === 0) return "Please add at least one template line item";
      const hasInvalidRate = validItems.some((li) => li.rate <= 0);
      if (hasInvalidRate) return "All template line items must have a rate greater than 0";
    }

    if (invoiceType === "commission") {
      if (commissionRate <= 0 || commissionRate > 100) return "Commission rate must be between 0 and 100";
    }

    if (invoiceType === "milestone") {
      const validMilestones = milestones.filter((m) => m.description.trim());
      if (validMilestones.length === 0) return "Please add at least one milestone";
      const hasInvalidAmount = validMilestones.some((m) => m.amount <= 0);
      if (hasInvalidAmount) return "All milestones must have an amount greater than 0";
      const hasMissingDate = validMilestones.some((m) => !m.date);
      if (hasMissingDate) return "All milestones must have a date";
    }

    return null;
  }, [companyId, clientEmail, issuedDate, dueDate, lineItems, invoiceType, engagementId, commissionRate, milestones, isRecurringType]);

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

  const handleCreateSchedule = useCallback(async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    setSending(true);
    try {
      const scheduleData: Parameters<typeof createRecurringScheduleAction>[0] = {
        engagementId,
        type: invoiceType as "retainer" | "milestone" | "commission",
        frequency,
        nextRunDate: issuedDate || todayString(),
        autoSend,
        notes: notes.trim() || undefined,
      };

      if (invoiceType === "retainer") {
        const validItems = lineItems.filter((li) => li.description.trim());
        scheduleData.lineItemTemplate = validItems.map((li) => ({
          description: li.description.trim(),
          quantity: li.quantity,
          rate: li.rate,
        }));
      }

      if (invoiceType === "commission") {
        scheduleData.commissionRate = commissionRate;
        scheduleData.commissionSourceUrl = revenueSourceUrl.trim() || undefined;
      }

      if (invoiceType === "milestone") {
        const validMilestones = milestones.filter((m) => m.description.trim());
        scheduleData.milestoneSchedule = validMilestones.map((m) => ({
          date: m.date,
          description: m.description.trim(),
          amount: m.amount,
        }));
        // Use first milestone date as next run
        if (validMilestones.length > 0) {
          scheduleData.nextRunDate = validMilestones[0].date;
        }
        // Milestone doesn't use frequency, but the action requires it
        scheduleData.frequency = "monthly";
      }

      await createRecurringScheduleAction(scheduleData);
      toast.success("Recurring schedule created");
      router.push("/invoices");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create schedule");
    } finally {
      setSending(false);
    }
  }, [validateForm, engagementId, invoiceType, frequency, issuedDate, autoSend, notes, lineItems, commissionRate, revenueSourceUrl, milestones, router]);

  // ── Shared styles ────────────────────────────────────

  const inputClass =
    "w-full rounded-[6px] border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-[14px] text-[#222] outline-none transition-colors focus:border-[#1a73e8] focus:bg-white";
  const labelClass =
    "mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#888]";

  // ── Active invoice type for display
  const activeType = isEdit ? "one-time" : invoiceType;

  // ── Render ───────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#222]">
            {isEdit ? "Edit Invoice" : "New Invoice"}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#888]">{invoiceNumber}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left — Form */}
        <div className="flex-1 min-w-0">
          <div className="rounded-[6px] border border-[#e0e0e0] bg-white p-6">
            {/* Type Selector */}
            {!isEdit && (
              <div className="mb-6">
                <label className={labelClass}>Invoice Type</label>
                <div className="flex items-center gap-0.5 rounded-lg bg-[#f0f0f0] p-0.5 w-fit">
                  {INVOICE_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setInvoiceType(type.value)}
                      className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium transition-all ${
                        invoiceType === type.value
                          ? "bg-white text-[#222] shadow-sm"
                          : "text-[#555] hover:text-[#333]"
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            {/* Engagement selector — recurring types only */}
            {isRecurringType && !isEdit && (
              <div className="mb-5">
                <label className={labelClass}>Engagement</label>
                <CustomSelect
                  value={engagementId}
                  onChange={setEngagementId}
                  options={engagementOptions}
                  placeholder="Select engagement..."
                />
                {companyId && engagementOptions.length === 0 && (
                  <p className="mt-1 text-[11px] text-[#c0392b]">
                    No engagements found for this client
                  </p>
                )}
              </div>
            )}

            {/* Dates + Net Quick-Set — one-time and retainer */}
            {(activeType === "one-time" || activeType === "retainer") && (
              <div className="mb-5 grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>
                    {activeType === "retainer" ? "Start Date" : "Issue Date"}
                  </label>
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
                <div>
                  <label className={labelClass}>Quick Set</label>
                  <div className="flex gap-2">
                    {[15, 30, 60].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => handleNetDays(days)}
                        className={`flex-1 rounded-[6px] border px-2 py-2 text-[12px] font-medium transition-colors ${
                          dueDate === addDays(issuedDate, days)
                            ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                            : "border-[#e0e0e0] bg-[#fafafa] text-[#555] hover:bg-[#f0f0f0]"
                        }`}
                      >
                        Net {days}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Commission dates — start date only */}
            {activeType === "commission" && (
              <div className="mb-5 grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Start Date</label>
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
            )}

            {/* Frequency selector — retainer and commission */}
            {(activeType === "retainer" || activeType === "commission") && !isEdit && (
              <div className="mb-5">
                <label className={labelClass}>Frequency</label>
                <div className="flex items-center gap-0.5 rounded-lg bg-[#f0f0f0] p-0.5 w-fit">
                  {FREQUENCIES.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFrequency(f.value)}
                      className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                        frequency === f.value
                          ? "bg-white text-[#222] shadow-sm"
                          : "text-[#555] hover:text-[#333]"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Commission-specific fields */}
            {activeType === "commission" && (
              <div className="mb-5 grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Commission Rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={commissionRate}
                    onChange={(e) =>
                      setCommissionRate(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))
                    }
                    placeholder="10"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Revenue Source URL</label>
                  <input
                    type="url"
                    value={revenueSourceUrl}
                    onChange={(e) => setRevenueSourceUrl(e.target.value)}
                    placeholder="https://dashboard.stripe.com/..."
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* Auto-send toggle — recurring types only */}
            {isRecurringType && !isEdit && (
              <div className="mb-5 flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSend}
                  onClick={() => setAutoSend(!autoSend)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    autoSend ? "bg-[#1a73e8]" : "bg-[#d0d0d0]"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      autoSend ? "translate-x-[18px]" : "translate-x-[3px]"
                    }`}
                  />
                </button>
                <span className="text-[13px] text-[#555]">Auto-send when generated</span>
              </div>
            )}

            {/* Line Items Table — one-time and retainer */}
            {hasLineItems && (
              <div className="mb-5">
                <label className={labelClass}>
                  {activeType === "retainer" ? "Line Item Template" : "Line Items"}
                </label>
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
            )}

            {/* Milestone Schedule — milestone type */}
            {activeType === "milestone" && (
              <div className="mb-5">
                <label className={labelClass}>Milestone Schedule</label>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e0e0e0]">
                      <th className="w-36 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                        Date
                      </th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                        Description
                      </th>
                      <th className="w-32 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                        Amount
                      </th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((m, index) => (
                      <tr
                        key={index}
                        className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]"
                      >
                        <td className="px-2 py-1.5">
                          <input
                            type="date"
                            value={m.date}
                            onChange={(e) =>
                              handleMilestoneChange(index, "date", e.target.value)
                            }
                            className="w-full border-0 bg-transparent text-[13px] text-[#222] outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={m.description}
                            onChange={(e) =>
                              handleMilestoneChange(index, "description", e.target.value)
                            }
                            placeholder="Milestone description..."
                            className="w-full border-0 bg-transparent text-[13px] text-[#222] outline-none placeholder:text-[#ccc]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={m.amount || ""}
                            onChange={(e) =>
                              handleMilestoneChange(
                                index,
                                "amount",
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            placeholder="0.00"
                            className="w-full border-0 bg-transparent text-right text-[13px] text-[#222] outline-none placeholder:text-[#ccc]"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveMilestone(index)}
                            disabled={milestones.length <= 1}
                            className="rounded p-1 text-[#ccc] transition-colors hover:bg-[#fde8e8] hover:text-[#c0392b] disabled:opacity-0"
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  type="button"
                  onClick={handleAddMilestone}
                  className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[#1a73e8] transition-colors hover:text-[#1557b0]"
                >
                  <Plus size={14} strokeWidth={2} />
                  Add Milestone
                </button>
              </div>
            )}

            {/* Subtotal — only for types with line items */}
            {hasLineItems && (
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
            )}

            {/* Milestone total */}
            {activeType === "milestone" && (
              <div className="mb-5 flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between py-2">
                    <span className="text-[14px] font-semibold text-[#222]">Total (all milestones)</span>
                    <span className="text-[14px] font-semibold text-[#222]">
                      {formatCurrency(milestoneTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}

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

        {/* Right — Live Preview */}
        <div className="flex-1 min-w-0">
          <div className="sticky top-6">
            <p className={`${labelClass} mb-2`}>Live Preview</p>
            <LivePreview
              invoiceType={activeType}
              invoiceNumber={invoiceNumber}
              companyName={selectedCompany?.name ?? ""}
              clientEmail={clientEmail}
              issuedDate={issuedDate}
              dueDate={dueDate}
              lineItems={lineItems.filter((li) => li.description.trim())}
              subtotal={subtotal}
              notes={notes}
              frequency={frequency}
              autoSend={autoSend}
              commissionRate={commissionRate}
              milestones={milestones.filter((m) => m.description.trim())}
              milestoneTotal={milestoneTotal}
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
        {activeType === "one-time" ? (
          <button
            type="button"
            onClick={handleSendInvoice}
            disabled={saving || sending}
            className="flex items-center gap-1.5 rounded-[6px] bg-[#111] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-40"
          >
            <Send size={14} strokeWidth={2} />
            {sending ? "Sending..." : "Send Invoice"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCreateSchedule}
            disabled={saving || sending}
            className="flex items-center gap-1.5 rounded-[6px] bg-[#111] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-40"
          >
            <CalendarPlus size={14} strokeWidth={2} />
            {sending ? "Creating..." : "Create Schedule"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Live Preview Panel ──────────────────────────────────

function LivePreview({
  invoiceType,
  invoiceNumber,
  companyName,
  clientEmail,
  issuedDate,
  dueDate,
  lineItems,
  subtotal,
  notes,
  frequency,
  autoSend,
  commissionRate,
  milestones,
  milestoneTotal,
}: {
  invoiceType: InvoiceType;
  invoiceNumber: string;
  companyName: string;
  clientEmail: string;
  issuedDate: string;
  dueDate: string;
  lineItems: LineItem[];
  subtotal: number;
  notes: string;
  frequency: Frequency;
  autoSend: boolean;
  commissionRate: number;
  milestones: MilestoneRow[];
  milestoneTotal: number;
}) {
  // For milestone preview, show the first milestone as the invoice
  const previewMilestone = milestones.length > 0 ? milestones[0] : null;

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
          {invoiceType !== "one-time" && (
            <p className="mt-1 text-[11px] capitalize text-[#888]">
              {invoiceType} &middot; {invoiceType !== "milestone" ? frequency : "per milestone"}
              {autoSend && " &middot; auto-send"}
            </p>
          )}
        </div>
      </div>

      {/* Bill-to + Dates */}
      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Bill To
          </p>
          <p className="mt-1 text-[13px] font-medium text-[#222]">
            {companyName || "\u2014"}
          </p>
          {clientEmail && (
            <p className="text-[12px] text-[#888]">{clientEmail}</p>
          )}
        </div>
        <div className="text-right">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                {invoiceType === "one-time" ? "Issue Date" : "Start Date"}
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
                {invoiceType === "milestone" && previewMilestone
                  ? formatDateDisplay(previewMilestone.date)
                  : formatDateDisplay(dueDate)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Line items — one-time and retainer */}
      {(invoiceType === "one-time" || invoiceType === "retainer") && (
        <>
          {invoiceType === "retainer" && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#888]">
              Template Line Items
            </p>
          )}
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
              {lineItems.map((li, index) => {
                const amount = li.quantity * li.rate;
                return (
                  <tr
                    key={index}
                    className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]"
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
              })}
              {lineItems.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-2 py-6 text-center text-[13px] text-[#ccc]"
                  >
                    No line items
                  </td>
                </tr>
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
        </>
      )}

      {/* Commission preview */}
      {invoiceType === "commission" && (
        <div className="rounded-[6px] border border-dashed border-[#e0e0e0] bg-[#fafafa] px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-[#888]">
            Commission amount calculated from client revenue
          </p>
          <p className="mt-1 text-[12px] text-[#bbb]">
            Rate: {commissionRate}% &middot; Amount TBD
          </p>
        </div>
      )}

      {/* Milestone preview — show first milestone */}
      {invoiceType === "milestone" && (
        <>
          {previewMilestone ? (
            <>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#888]">
                Milestone 1 of {milestones.length}
              </p>
              <table className="mb-4 w-full">
                <thead>
                  <tr className="border-b border-[#e0e0e0]">
                    <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Description
                    </th>
                    <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#f0f0f0]">
                    <td className="px-2 py-2.5 text-[13px] text-[#222]">
                      {previewMilestone.description}
                    </td>
                    <td className="px-2 py-2.5 text-right text-[13px] font-medium text-[#222]">
                      {formatCurrency(previewMilestone.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-56">
                  <div className="flex justify-between border-b border-[#f0f0f0] py-2">
                    <span className="text-[13px] text-[#888]">This milestone</span>
                    <span className="text-[13px] text-[#222]">
                      {formatCurrency(previewMilestone.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-[13px] text-[#888]">All milestones</span>
                    <span className="text-[13px] font-semibold text-[#222]">
                      {formatCurrency(milestoneTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[6px] border border-dashed border-[#e0e0e0] bg-[#fafafa] px-4 py-8 text-center">
              <p className="text-[13px] text-[#ccc]">Add milestones to preview</p>
            </div>
          )}
        </>
      )}

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
          strvx &middot; hello@strvx.com &middot; Thank you for your business
        </p>
      </div>
    </div>
  );
}
