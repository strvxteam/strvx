import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoices,
  recurringInvoiceSchedules,
  engagements,
  companies,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getDueSchedules, getOverdueUnremindedInvoices, getNextInvoiceNumber } from "@/lib/queries";
import { sendOverdueReminderEmail } from "@/lib/invoice-email";
import { runReconciliation } from "@/lib/reconciliation";

export const dynamic = "force-dynamic";

function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

function advanceDate(dateStr: string, frequency: string): string {
  const date = new Date(dateStr);
  switch (frequency) {
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "biweekly":
      date.setDate(date.getDate() + 14);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
  }
  return date.toISOString().split("T")[0];
}

async function generateRecurringInvoices(): Promise<{ generated: number; errors: string[] }> {
  const errors: string[] = [];
  let generated = 0;
  const dueSchedules = await getDueSchedules();

  for (const schedule of dueSchedules) {
    try {
      const [engagement] = await db
        .select({
          name: engagements.name,
          companyId: engagements.companyId,
          companyName: companies.name,
        })
        .from(engagements)
        .innerJoin(companies, eq(engagements.companyId, companies.id))
        .where(eq(engagements.id, schedule.engagementId));

      if (!engagement) {
        errors.push(`Schedule ${schedule.id}: engagement not found, skipping`);
        continue;
      }

      const existingInvoices = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.recurringScheduleId, schedule.id),
            eq(invoices.issuedDate, schedule.nextRunDate)
          )
        );

      if (existingInvoices.length > 0) {
        await db
          .update(recurringInvoiceSchedules)
          .set({ nextRunDate: advanceDate(schedule.nextRunDate, schedule.frequency) })
          .where(eq(recurringInvoiceSchedules.id, schedule.id));
        continue;
      }

      const invoiceNumber = await getNextInvoiceNumber();
      let lineItems: { id: string; description: string; quantity: number; rate: number; amount: number }[] = [];
      let amount = 0;
      let commissionRevenue: string | null = null;

      if (schedule.type === "retainer") {
        const template = schedule.lineItemTemplate as { description: string; quantity: number; rate: number }[] | null;
        if (!template || template.length === 0) {
          errors.push(`Schedule ${schedule.id}: retainer has no line item template`);
          continue;
        }
        lineItems = template.map((li, i) => ({
          id: `li-${i}`,
          description: li.description,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.quantity * li.rate,
        }));
        amount = lineItems.reduce((sum, li) => sum + li.amount, 0);
      } else if (schedule.type === "commission") {
        const rate = Number(schedule.commissionRate ?? 0);
        const sourceUrl = schedule.commissionSourceUrl;
        if (!sourceUrl || rate <= 0) {
          errors.push(`Schedule ${schedule.id}: commission missing rate or source URL`);
          continue;
        }

        let revenue = 0;
        try {
          const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          revenue = Number(data.revenue ?? data.amount ?? 0);
        } catch (err) {
          errors.push(`Schedule ${schedule.id}: failed to fetch commission revenue — creating as draft`);
          const dueDate = advanceDate(schedule.nextRunDate, "monthly");
          await db.insert(invoices).values({
            invoiceNumber,
            engagementId: schedule.engagementId,
            clientName: engagement.companyName,
            amount: "0",
            status: "draft",
            issuedDate: schedule.nextRunDate,
            dueDate,
            lineItems: [],
            notes: `[AUTO] Commission invoice — revenue fetch failed: ${err instanceof Error ? err.message : "unknown"}. Update amount manually.`,
            recurringScheduleId: schedule.id,
          });
          generated++;
          await db
            .update(recurringInvoiceSchedules)
            .set({ nextRunDate: advanceDate(schedule.nextRunDate, schedule.frequency) })
            .where(eq(recurringInvoiceSchedules.id, schedule.id));
          continue;
        }

        amount = Math.round(revenue * rate) / 100;
        commissionRevenue = String(revenue);
        const monthYear = new Date(schedule.nextRunDate).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        lineItems = [{
          id: "li-0",
          description: `Commission — ${monthYear} (${rate}% of $${revenue.toLocaleString()})`,
          quantity: 1,
          rate: amount,
          amount,
        }];
      } else if (schedule.type === "milestone") {
        const milestones = schedule.milestoneSchedule as { date: string; description: string; amount: number }[] | null;
        if (!milestones || milestones.length === 0) {
          await db
            .update(recurringInvoiceSchedules)
            .set({ status: "completed" })
            .where(eq(recurringInvoiceSchedules.id, schedule.id));
          continue;
        }

        const nextMilestone = milestones[0];
        amount = nextMilestone.amount;
        lineItems = [{
          id: "li-0",
          description: nextMilestone.description,
          quantity: 1,
          rate: amount,
          amount,
        }];

        const remainingMilestones = milestones.slice(1);
        const nextDate = remainingMilestones.length > 0 ? remainingMilestones[0].date : null;

        await db
          .update(recurringInvoiceSchedules)
          .set({
            milestoneSchedule: remainingMilestones,
            nextRunDate: nextDate ?? schedule.nextRunDate,
            ...(remainingMilestones.length === 0 ? { status: "completed" as const } : {}),
          })
          .where(eq(recurringInvoiceSchedules.id, schedule.id));
      }

      const dueDate = advanceDate(schedule.nextRunDate, "monthly");
      const status = schedule.autoSend ? "sent" : "draft";

      await db.insert(invoices).values({
        invoiceNumber,
        engagementId: schedule.engagementId,
        clientName: engagement.companyName,
        amount: String(amount),
        status,
        issuedDate: schedule.nextRunDate,
        dueDate,
        lineItems,
        notes: schedule.notes || null,
        recurringScheduleId: schedule.id,
        commissionRevenue,
      });

      generated++;

      if (schedule.type !== "milestone") {
        await db
          .update(recurringInvoiceSchedules)
          .set({ nextRunDate: advanceDate(schedule.nextRunDate, schedule.frequency) })
          .where(eq(recurringInvoiceSchedules.id, schedule.id));
      }

      if (schedule.autoSend) {
        try {
          const { sendInvoiceAction } = await import("@/app/actions");
          const [created] = await db
            .select({ id: invoices.id })
            .from(invoices)
            .where(eq(invoices.invoiceNumber, invoiceNumber));
          if (created) {
            await sendInvoiceAction(created.id);
          }
        } catch (err) {
          errors.push(`Schedule ${schedule.id}: auto-send failed: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }
    } catch (err) {
      errors.push(`Schedule ${schedule.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return { generated, errors };
}

async function processOverdueReminders(): Promise<{ reminded: number; errors: string[] }> {
  const errors: string[] = [];
  let reminded = 0;
  const overdueInvoices = await getOverdueUnremindedInvoices();

  for (const inv of overdueInvoices) {
    try {
      if (!inv.clientEmail) continue;
      const lineItems = Array.isArray(inv.lineItems)
        ? (inv.lineItems as { description: string; quantity: number; rate: number; amount: number }[])
        : [];

      await sendOverdueReminderEmail({
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.clientName,
        clientEmail: inv.clientEmail,
        amount: Number(inv.amount),
        taxRate: Number(inv.taxRate ?? 0),
        issuedDate: inv.issuedDate ?? "",
        dueDate: inv.dueDate ?? "",
        lineItems,
        notes: inv.notes,
        stripePaymentUrl: inv.stripePaymentUrl,
      });

      await db
        .update(invoices)
        .set({ status: "overdue", reminderSentAt: new Date() })
        .where(eq(invoices.id, inv.id));

      reminded++;
    } catch (err) {
      errors.push(`Invoice ${inv.invoiceNumber}: reminder failed — ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return { reminded, errors };
}

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    recurring: { generated: 0, errors: [] as string[] },
    reminders: { reminded: 0, errors: [] as string[] },
    reconciliation: { matched: 0, unmatched: 0, errors: [] as string[] },
  };

  try {
    results.recurring = await generateRecurringInvoices();
  } catch (err) {
    results.recurring.errors.push(`Fatal: ${err instanceof Error ? err.message : "unknown"}`);
  }

  try {
    results.reminders = await processOverdueReminders();
  } catch (err) {
    results.reminders.errors.push(`Fatal: ${err instanceof Error ? err.message : "unknown"}`);
  }

  try {
    results.reconciliation = await runReconciliation();
  } catch (err) {
    results.reconciliation.errors.push(`Fatal: ${err instanceof Error ? err.message : "unknown"}`);
  }

  console.log("[Cron] Daily invoice run:", JSON.stringify(results));

  return NextResponse.json({ ok: true, ...results });
}
