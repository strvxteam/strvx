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
      recurringData = { type: schedule.type, frequency: schedule.frequency, nextRunDate: schedule.nextRunDate };
    }
  }

  return <InvoiceDetailClient invoice={invoice} reconciliation={recData} recurring={recurringData} />;
}
