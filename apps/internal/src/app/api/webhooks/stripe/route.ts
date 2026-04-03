import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe Webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const stripeInvoice = event.data.object as {
    id: string;
    hosted_invoice_url?: string;
  };

  // Find our invoice by Stripe ID
  const [invoice] = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.stripeInvoiceId, stripeInvoice.id));

  if (!invoice) {
    return NextResponse.json({ received: true });
  }

  const statusRank: Record<string, number> = {
    draft: 0,
    sent: 1,
    overdue: 2,
    paid: 3,
    cancelled: 4,
  };

  switch (event.type) {
    case "invoice.finalized": {
      if (statusRank[invoice.status] < statusRank.sent) {
        await db
          .update(invoices)
          .set({
            status: "sent",
            stripePaymentUrl: stripeInvoice.hosted_invoice_url || null,
          })
          .where(eq(invoices.id, invoice.id));
      }
      break;
    }

    case "invoice.paid": {
      if (invoice.status !== "paid") {
        await db
          .update(invoices)
          .set({
            status: "paid",
            paidDate: new Date().toISOString().split("T")[0],
          })
          .where(eq(invoices.id, invoice.id));
      }
      break;
    }

    case "invoice.payment_failed": {
      if (invoice.status === "sent") {
        await db
          .update(invoices)
          .set({ status: "overdue" })
          .where(eq(invoices.id, invoice.id));
      }
      break;
    }

    case "invoice.voided": {
      if (invoice.status !== "paid") {
        await db
          .update(invoices)
          .set({ status: "cancelled" })
          .where(eq(invoices.id, invoice.id));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
