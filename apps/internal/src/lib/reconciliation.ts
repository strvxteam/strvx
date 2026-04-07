import { db } from "./db";
import { invoices, invoiceReconciliations } from "./db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getStripePayouts, getBalanceTransactionsForPayout } from "./stripe";
import { getMercuryAccounts, getMercuryTransactions } from "./mercury";

interface PayoutInvoiceLink {
  stripePayoutId: string;
  stripeInvoiceId: string;
  payoutAmount: number;
  payoutCreatedAt: string;
}

export async function fetchStripePayoutLinks(): Promise<PayoutInvoiceLink[]> {
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const payouts = await getStripePayouts({ created: { gte: thirtyDaysAgo } });
  const links: PayoutInvoiceLink[] = [];

  for (const payout of payouts) {
    if (payout.status !== "paid") continue;
    const txns = await getBalanceTransactionsForPayout(payout.id);

    for (const txn of txns) {
      if (txn.type !== "charge" || !txn.source) continue;
      links.push({
        stripePayoutId: payout.id,
        stripeInvoiceId: typeof txn.source === "string" ? txn.source : txn.source.id,
        payoutAmount: payout.amount / 100,
        payoutCreatedAt: new Date(payout.created * 1000).toISOString(),
      });
    }
  }

  return links;
}

export async function runReconciliation(): Promise<{
  matched: number;
  unmatched: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let matched = 0;
  let unmatched = 0;

  let payoutLinks: PayoutInvoiceLink[] = [];
  try {
    payoutLinks = await fetchStripePayoutLinks();
  } catch (err) {
    errors.push(`Stripe payout fetch failed: ${err instanceof Error ? err.message : "unknown"}`);
    return { matched, unmatched, errors };
  }

  let mercuryTxns: { id: string; amount: number; counterpartyName: string; createdAt: string }[] = [];
  try {
    const accounts = await getMercuryAccounts();
    for (const acct of accounts) {
      const { transactions } = await getMercuryTransactions(acct.id, { limit: 100 });
      mercuryTxns.push(...transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        counterpartyName: t.counterpartyName,
        createdAt: t.createdAt,
      })));
    }
  } catch (err) {
    errors.push(`Mercury fetch failed: ${err instanceof Error ? err.message : "unknown"}`);
  }

  const paidInvoices = await db
    .select({
      id: invoices.id,
      stripeInvoiceId: invoices.stripeInvoiceId,
      amount: invoices.amount,
      paidDate: invoices.paidDate,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "paid"),
        isNotNull(invoices.stripeInvoiceId)
      )
    );

  for (const inv of paidInvoices) {
    const [existing] = await db
      .select({ id: invoiceReconciliations.id })
      .from(invoiceReconciliations)
      .where(eq(invoiceReconciliations.invoiceId, inv.id));

    if (existing) continue;

    const payoutLink = payoutLinks.find((pl) =>
      pl.stripeInvoiceId === inv.stripeInvoiceId
    );

    if (!payoutLink) {
      await db.insert(invoiceReconciliations).values({
        invoiceId: inv.id,
        stripeAmount: String(inv.amount),
        status: "unmatched",
        matchMethod: "auto",
      });
      unmatched++;
      continue;
    }

    const payoutDate = new Date(payoutLink.payoutCreatedAt);
    const threeDaysLater = new Date(payoutDate.getTime() + 3 * 24 * 60 * 60 * 1000);

    const mercuryMatch = mercuryTxns.find((mt) => {
      if (mt.counterpartyName?.toLowerCase() !== "stripe") return false;
      const mtDate = new Date(mt.createdAt);
      if (mtDate < payoutDate || mtDate > threeDaysLater) return false;
      return Math.abs(Math.abs(mt.amount) - payoutLink.payoutAmount) < 0.01;
    });

    if (mercuryMatch) {
      await db.insert(invoiceReconciliations).values({
        invoiceId: inv.id,
        stripePayoutId: payoutLink.stripePayoutId,
        mercuryTransactionId: mercuryMatch.id,
        stripeAmount: String(payoutLink.payoutAmount),
        mercuryAmount: String(Math.abs(mercuryMatch.amount)),
        status: "matched",
        matchedAt: new Date(),
        matchMethod: "auto",
      });
      matched++;
    } else {
      await db.insert(invoiceReconciliations).values({
        invoiceId: inv.id,
        stripePayoutId: payoutLink.stripePayoutId,
        stripeAmount: String(payoutLink.payoutAmount),
        status: "unmatched",
        matchMethod: "auto",
      });
      unmatched++;
    }
  }

  return { matched, unmatched, errors };
}
