"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { sendInvoiceAction, voidInvoiceAction, markInvoicePaidAction } from "@/app/actions";
import { toast } from "sonner";

export function InvoiceActions({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setLoading(true);
    try {
      await sendInvoiceAction(invoiceId);
      toast.success("Invoice sent via Stripe");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  }

  async function handleVoid() {
    setLoading(true);
    try {
      await voidInvoiceAction(invoiceId);
      toast.success("Invoice voided");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void");
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkPaid() {
    setLoading(true);
    try {
      await markInvoicePaidAction(invoiceId);
      toast.success("Invoice marked as paid");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as paid");
    } finally {
      setLoading(false);
    }
  }

  const btnBase = "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40";

  if (status === "draft") {
    return (
      <div className="mt-4 flex gap-2">
        <Link href={`/invoices/${invoiceId}/edit`} className={`${btnBase} border border-[#e0e0e0] text-[#555] hover:bg-[#f5f5f5]`}>
          Edit
        </Link>
        <button onClick={handleSend} disabled={loading} className={`${btnBase} bg-[#1a73e8] text-white hover:bg-[#1557b0]`}>
          {loading ? "Sending..." : "Send Invoice"}
        </button>
      </div>
    );
  }

  if (status === "sent" || status === "overdue") {
    return (
      <div className="mt-4 flex gap-2">
        <button onClick={handleVoid} disabled={loading} className={`${btnBase} border border-[#e0e0e0] text-[#c0392b] hover:bg-[#fde8e8]`}>
          Void
        </button>
        <button onClick={handleMarkPaid} disabled={loading} className={`${btnBase} bg-[#27ae60] text-white hover:bg-[#219a52]`}>
          {loading ? "Updating..." : "Mark as Paid"}
        </button>
      </div>
    );
  }

  return null;
}
