import Stripe from "stripe";
import { db } from "./db";
import { companies } from "./db/schema";
import { eq } from "drizzle-orm";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}


export async function getOrCreateStripeCustomer(
  companyId: string,
  name: string,
  email: string
): Promise<string> {
  const [company] = await db
    .select({ stripeCustomerId: companies.stripeCustomerId })
    .from(companies)
    .where(eq(companies.id, companyId));

  if (company?.stripeCustomerId) {
    return company.stripeCustomerId;
  }

  const client = getStripe();
  const customer = await client.customers.create({
    name,
    email,
    metadata: { strvx_company_id: companyId },
  });

  await db
    .update(companies)
    .set({ stripeCustomerId: customer.id })
    .where(eq(companies.id, companyId));

  return customer.id;
}

export async function createAndSendStripeInvoice(opts: {
  stripeCustomerId: string;
  lineItems: { description: string; quantity: number; rate: number }[];
  dueDate: string;
  notes?: string;
  invoiceNumber: string;
}): Promise<{ stripeInvoiceId: string; paymentUrl: string }> {
  const client = getStripe();
  const invoice = await client.invoices.create({
    customer: opts.stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: Math.max(
      1,
      Math.ceil(
        (new Date(opts.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    ),
    custom_fields: [{ name: "Invoice #", value: opts.invoiceNumber }],
    footer: opts.notes || undefined,
    auto_advance: true,
  });

  for (const item of opts.lineItems) {
    await client.invoiceItems.create({
      customer: opts.stripeCustomerId,
      invoice: invoice.id,
      description: item.description,
      amount: Math.round(item.quantity * item.rate * 100),
      currency: "usd",
    });
  }

  const finalized = await client.invoices.finalizeInvoice(invoice.id);
  await client.invoices.sendInvoice(invoice.id);

  return {
    stripeInvoiceId: invoice.id,
    paymentUrl: finalized.hosted_invoice_url || "",
  };
}

export async function voidStripeInvoice(stripeInvoiceId: string): Promise<void> {
  await getStripe().invoices.voidInvoice(stripeInvoiceId);
}

export async function getStripePayouts(options?: {
  limit?: number;
  created?: { gte?: number; lte?: number };
}) {
  const client = getStripe();
  const payouts = await client.payouts.list({
    limit: options?.limit ?? 30,
    created: options?.created,
  });
  return payouts.data;
}

export async function getBalanceTransactionsForPayout(payoutId: string) {
  const client = getStripe();
  const txns = await client.balanceTransactions.list({
    payout: payoutId,
    limit: 100,
  });
  return txns.data;
}
