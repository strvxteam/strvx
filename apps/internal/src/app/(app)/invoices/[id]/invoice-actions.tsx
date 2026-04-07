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
