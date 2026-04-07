# Invoice Enhancements — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recurring invoices, PDF generation, overdue reminders, and Mercury reconciliation to the STRVX internal tool's backend.

**Architecture:** Hybrid approach — app owns invoice scheduling and generation, Stripe handles payment collection (existing flow), Mercury provides bank-side reconciliation. A single daily Vercel Cron route handles recurring invoice generation, overdue reminders, and reconciliation syncing.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, Supabase (Postgres), Stripe API, Mercury API (existing client), Resend (existing email), Zod validation, Vercel Cron.

**Design Spec:** `docs/superpowers/specs/2026-04-07-invoice-enhancements-design.md`

---

## File Structure

### New files
- `packages/db/src/schema.ts` — modify: add `recurringInvoiceSchedules`, `invoiceReconciliations` tables, new enums, and new columns on `invoices`
- `apps/internal/src/lib/reconciliation.ts` — Stripe payout fetching + Mercury matching engine
- `apps/internal/src/app/api/cron/generate-invoices/route.ts` — daily cron: recurring invoices, overdue reminders, reconciliation sync
- `apps/internal/src/app/api/invoices/[id]/pdf/route.ts` — PDF HTML route

### Modified files
- `apps/internal/src/lib/queries.ts` — add recurring schedule + reconciliation queries
- `apps/internal/src/lib/validations.ts` — add recurring schedule validation schema
- `apps/internal/src/app/actions.ts` — add server actions for schedule CRUD, manual reconciliation
- `apps/internal/src/lib/invoice-email.ts` — add overdue reminder email template
- `apps/internal/src/lib/mercury.ts` — no changes needed (already has what we need)
- `apps/internal/src/lib/stripe.ts` — add payout fetching functions
- `vercel.json` — add cron config

---

### Task 1: Database Schema — New Enums and Tables

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Add new enums after existing enum definitions**

Add after the `interactionTypeEnum` definition (line 42):

```typescript
export const recurringTypeEnum = pgEnum("recurring_type", [
  "retainer",
  "milestone",
  "commission",
]);

export const recurringStatusEnum = pgEnum("recurring_status", [
  "active",
  "paused",
  "cancelled",
  "completed",
]);

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
]);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "matched",
  "unmatched",
  "partial",
  "manual",
]);

export const matchMethodEnum = pgEnum("match_method", [
  "auto",
  "manual",
]);
```

- [ ] **Step 2: Add the `recurringInvoiceSchedules` table after the `invoices` table**

```typescript
export const recurringInvoiceSchedules = pgTable("recurring_invoice_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id, { onDelete: "cascade" }),
  type: recurringTypeEnum("type").notNull(),
  status: recurringStatusEnum("status").notNull().default("active"),
  frequency: recurringFrequencyEnum("frequency").notNull().default("monthly"),
  nextRunDate: date("next_run_date").notNull(),
  lineItemTemplate: jsonb("line_item_template"),
  commissionRate: numeric("commission_rate"),
  commissionSourceUrl: text("commission_source_url"),
  milestoneSchedule: jsonb("milestone_schedule"),
  notes: text("notes"),
  autoSend: boolean("auto_send").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Add the `invoiceReconciliations` table**

```typescript
export const invoiceReconciliations = pgTable("invoice_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  stripePayoutId: text("stripe_payout_id"),
  mercuryTransactionId: text("mercury_transaction_id"),
  stripeAmount: numeric("stripe_amount"),
  mercuryAmount: numeric("mercury_amount"),
  status: reconciliationStatusEnum("status").notNull().default("unmatched"),
  matchedAt: timestamp("matched_at", { withTimezone: true }),
  matchMethod: matchMethodEnum("match_method").notNull().default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Add new columns to the existing `invoices` table**

Replace the existing `invoices` table definition with:

```typescript
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceNumber: text("invoice_number").notNull(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull(),
  amount: numeric("amount").notNull(),
  taxRate: numeric("tax_rate").default("0"),
  status: text("status").notNull().default("draft"),
  issuedDate: date("issued_date"),
  dueDate: date("due_date"),
  paidDate: date("paid_date"),
  lineItems: jsonb("line_items"),
  notes: text("notes"),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripePaymentUrl: text("stripe_payment_url"),
  clientEmail: text("client_email"),
  recurringScheduleId: uuid("recurring_schedule_id").references(() => recurringInvoiceSchedules.id, { onDelete: "set null" }),
  commissionRevenue: numeric("commission_revenue"),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 5: Push schema changes to database**

Run: `cd ~/strvx && pnpm db:push`
Expected: Schema changes applied successfully.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat: add recurring invoice schedules and reconciliation tables"
```

---

### Task 2: Export New Schema + Add Queries

**Files:**
- Modify: `apps/internal/src/lib/queries.ts`

- [ ] **Step 1: Add imports for new tables**

At the top of `queries.ts`, add the new tables to the import from `./db/schema`:

```typescript
import {
  engagements,
  companies,
  contacts,
  interactions,
  nextActions,
  users,
  calendarEvents,
  tasks,
  taskAssignees,
  projects,
  invoices,
  expenses,
  goals,
  marketingPosts,
  documents,
  timeEntries,
  monitoredSites,
  uptimeChecks,
  recurringInvoiceSchedules,
  invoiceReconciliations,
} from "./db/schema";
```

- [ ] **Step 2: Add recurring schedule queries after the `getInvoice` function (around line 745)**

```typescript
// ── Recurring Invoice Schedule Queries ───────────────

export async function getRecurringSchedules() {
  return db
    .select({
      id: recurringInvoiceSchedules.id,
      type: recurringInvoiceSchedules.type,
      status: recurringInvoiceSchedules.status,
      frequency: recurringInvoiceSchedules.frequency,
      nextRunDate: recurringInvoiceSchedules.nextRunDate,
      autoSend: recurringInvoiceSchedules.autoSend,
      commissionRate: recurringInvoiceSchedules.commissionRate,
      engagementId: recurringInvoiceSchedules.engagementId,
      engagementName: engagements.name,
      companyName: companies.name,
      createdAt: recurringInvoiceSchedules.createdAt,
    })
    .from(recurringInvoiceSchedules)
    .innerJoin(engagements, eq(recurringInvoiceSchedules.engagementId, engagements.id))
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .orderBy(recurringInvoiceSchedules.nextRunDate);
}

export async function getRecurringSchedule(id: string) {
  const [schedule] = await db
    .select()
    .from(recurringInvoiceSchedules)
    .where(eq(recurringInvoiceSchedules.id, id));
  return schedule;
}

export async function getDueSchedules() {
  const today = new Date().toISOString().split("T")[0];
  return db
    .select()
    .from(recurringInvoiceSchedules)
    .where(
      and(
        eq(recurringInvoiceSchedules.status, "active"),
        lte(recurringInvoiceSchedules.nextRunDate, today)
      )
    );
}
```

- [ ] **Step 3: Add reconciliation queries**

```typescript
// ── Reconciliation Queries ───────────────────────────

export async function getReconciliationForInvoice(invoiceId: string) {
  const [rec] = await db
    .select()
    .from(invoiceReconciliations)
    .where(eq(invoiceReconciliations.invoiceId, invoiceId));
  return rec;
}

export async function getUnmatchedReconciliations() {
  return db
    .select({
      id: invoiceReconciliations.id,
      invoiceId: invoiceReconciliations.invoiceId,
      invoiceNumber: invoices.invoiceNumber,
      clientName: invoices.clientName,
      stripePayoutId: invoiceReconciliations.stripePayoutId,
      stripeAmount: invoiceReconciliations.stripeAmount,
      status: invoiceReconciliations.status,
      createdAt: invoiceReconciliations.createdAt,
    })
    .from(invoiceReconciliations)
    .innerJoin(invoices, eq(invoiceReconciliations.invoiceId, invoices.id))
    .where(eq(invoiceReconciliations.status, "unmatched"))
    .orderBy(desc(invoiceReconciliations.createdAt));
}

export async function getOverdueUnremindedInvoices() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "sent"),
        lte(invoices.dueDate, threeDaysAgo),
        isNull(invoices.reminderSentAt)
      )
    );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/internal/src/lib/queries.ts
git commit -m "feat: add recurring schedule and reconciliation queries"
```

---

### Task 3: Validation Schemas for Recurring Schedules

**Files:**
- Modify: `apps/internal/src/lib/validations.ts`

- [ ] **Step 1: Add recurring schedule validation schema at the end of the file**

```typescript
export const createRecurringScheduleSchema = z.object({
  engagementId: z.string().uuid("Select an engagement"),
  type: z.enum(["retainer", "milestone", "commission"]),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly"]),
  nextRunDate: z.string().min(1, "Start date required"),
  autoSend: z.boolean().default(false),
  notes: z.string().max(5000).optional(),
  // Retainer fields
  lineItemTemplate: z.array(z.object({
    description: z.string().min(1, "Description required"),
    quantity: z.number().positive("Quantity must be positive"),
    rate: z.number().min(0, "Rate must be non-negative"),
  })).optional(),
  // Commission fields
  commissionRate: z.number().min(0).max(100).optional(),
  commissionSourceUrl: z.string().url("Valid URL required").optional(),
  // Milestone fields
  milestoneSchedule: z.array(z.object({
    date: z.string().min(1, "Date required"),
    description: z.string().min(1, "Description required"),
    amount: z.number().positive("Amount must be positive"),
  })).optional(),
});

export const updateRecurringScheduleSchema = z.object({
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).optional(),
  nextRunDate: z.string().optional(),
  autoSend: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

export const manualReconciliationSchema = z.object({
  invoiceId: z.string().uuid("Invalid invoice ID"),
  mercuryTransactionId: z.string().min(1, "Mercury transaction ID required"),
  mercuryAmount: z.number().positive("Amount must be positive"),
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/lib/validations.ts
git commit -m "feat: add validation schemas for recurring schedules and reconciliation"
```

---

### Task 4: Stripe Payout Functions

**Files:**
- Modify: `apps/internal/src/lib/stripe.ts`

- [ ] **Step 1: Add payout and balance transaction fetching functions**

Add at the end of `stripe.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/lib/stripe.ts
git commit -m "feat: add Stripe payout and balance transaction fetching"
```

---

### Task 5: Reconciliation Engine

**Files:**
- Create: `apps/internal/src/lib/reconciliation.ts`

- [ ] **Step 1: Create the reconciliation module**

```typescript
import { db } from "./db";
import { invoices, invoiceReconciliations } from "./db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
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
      // txn.source is a charge ID — the invoice ID is in the charge metadata
      // For Stripe invoices, the source references the charge linked to an invoice
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

  // 1. Get Stripe payout links
  let payoutLinks: PayoutInvoiceLink[] = [];
  try {
    payoutLinks = await fetchStripePayoutLinks();
  } catch (err) {
    errors.push(`Stripe payout fetch failed: ${err instanceof Error ? err.message : "unknown"}`);
    return { matched, unmatched, errors };
  }

  // 2. Get Mercury transactions
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

  // 3. Get paid invoices that have Stripe IDs but no reconciliation yet
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

  // 4. For each paid invoice, try to match
  for (const inv of paidInvoices) {
    // Check if reconciliation already exists
    const [existing] = await db
      .select({ id: invoiceReconciliations.id })
      .from(invoiceReconciliations)
      .where(eq(invoiceReconciliations.invoiceId, inv.id));

    if (existing) continue;

    // Find matching payout
    const payoutLink = payoutLinks.find((pl) =>
      pl.stripeInvoiceId === inv.stripeInvoiceId
    );

    if (!payoutLink) {
      // No payout yet — create unmatched record
      await db.insert(invoiceReconciliations).values({
        invoiceId: inv.id,
        stripeAmount: String(inv.amount),
        status: "unmatched",
        matchMethod: "auto",
      });
      unmatched++;
      continue;
    }

    // Try to match payout to Mercury deposit
    const payoutDate = new Date(payoutLink.payoutCreatedAt);
    const threeDaysLater = new Date(payoutDate.getTime() + 3 * 24 * 60 * 60 * 1000);

    const mercuryMatch = mercuryTxns.find((mt) => {
      if (mt.counterpartyName?.toLowerCase() !== "stripe") return false;
      const mtDate = new Date(mt.createdAt);
      if (mtDate < payoutDate || mtDate > threeDaysLater) return false;
      // Amount match (Mercury amounts are positive for deposits)
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/lib/reconciliation.ts
git commit -m "feat: add Mercury reconciliation engine with auto-matching"
```

---

### Task 6: Overdue Reminder Email Template

**Files:**
- Modify: `apps/internal/src/lib/invoice-email.ts`

- [ ] **Step 1: Add the overdue reminder email function at the end of the file**

```typescript
export async function sendOverdueReminderEmail(data: InvoiceEmailData) {
  const taxAmount = data.amount * (data.taxRate / 100);
  const total = data.amount + taxAmount;

  const overdueHtml = buildInvoiceHtml(data).replace(
    "<!-- Header -->",
    `<!-- Overdue Banner -->
      <div style="background: #fde8e8; padding: 12px 32px; text-align: center;">
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: #c0392b;">
          This invoice is past due. Please submit payment at your earliest convenience.
        </p>
      </div>
      <!-- Header -->`
  );

  const result = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "strvx <invoices@strvx.com>",
    to: [data.clientEmail],
    subject: `Reminder: Invoice ${data.invoiceNumber} is overdue — $${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    html: overdueHtml,
  });

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/lib/invoice-email.ts
git commit -m "feat: add overdue reminder email template"
```

---

### Task 7: Daily Cron Route

**Files:**
- Create: `apps/internal/src/app/api/cron/generate-invoices/route.ts`

- [ ] **Step 1: Create the cron route**

```typescript
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

// Verify cron secret to prevent unauthorized access
function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) return true; // Allow in dev without secret
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
      // Get engagement + company info
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

      // Check for duplicate
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
        // Already generated — just advance the date
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
          const res = await fetch(sourceUrl, {
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          revenue = Number(data.revenue ?? data.amount ?? 0);
        } catch (err) {
          errors.push(`Schedule ${schedule.id}: failed to fetch commission revenue — creating as draft`);
          // Create as draft with a note
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
          // All milestones exhausted
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

        // Remove consumed milestone from schedule
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

      // Create the invoice
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

      // Advance next run date (unless milestone — already handled above)
      if (schedule.type !== "milestone") {
        await db
          .update(recurringInvoiceSchedules)
          .set({ nextRunDate: advanceDate(schedule.nextRunDate, schedule.frequency) })
          .where(eq(recurringInvoiceSchedules.id, schedule.id));
      }

      // Auto-send if configured (reuse existing sendInvoiceAction logic)
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
        .set({
          status: "overdue",
          reminderSentAt: new Date(),
        })
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

  // 1. Generate recurring invoices
  try {
    results.recurring = await generateRecurringInvoices();
  } catch (err) {
    results.recurring.errors.push(`Fatal: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // 2. Process overdue reminders
  try {
    results.reminders = await processOverdueReminders();
  } catch (err) {
    results.reminders.errors.push(`Fatal: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // 3. Run reconciliation
  try {
    results.reconciliation = await runReconciliation();
  } catch (err) {
    results.reconciliation.errors.push(`Fatal: ${err instanceof Error ? err.message : "unknown"}`);
  }

  console.log("[Cron] Daily invoice run:", JSON.stringify(results));

  return NextResponse.json({
    ok: true,
    ...results,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/api/cron/generate-invoices/route.ts
git commit -m "feat: add daily cron route for recurring invoices, reminders, and reconciliation"
```

---

### Task 8: PDF Route

**Files:**
- Create: `apps/internal/src/app/api/invoices/[id]/pdf/route.ts`

- [ ] **Step 1: Create the PDF HTML route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getInvoice } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const lineItems = Array.isArray(invoice.lineItems)
    ? (invoice.lineItems as { id: string; description: string; quantity: number; rate: number; amount: number }[])
    : [];

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const taxRate = Number(invoice.taxRate ?? 0);
  const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + tax;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lineItemRows = lineItems
    .map(
      (li) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">${li.description}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; text-align: center;">${li.quantity}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; text-align: right;">$${fmt(li.rate)}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; text-align: right; font-weight: 500;">$${fmt(li.amount)}</td>
      </tr>`
    )
    .join("");

  const paidSection = invoice.paidDate
    ? `<div style="margin-top: 24px; padding: 12px 16px; background: #e8f5e9; border-radius: 6px; font-size: 13px; color: #27ae60; font-weight: 500;">Paid on ${invoice.paidDate}</div>`
    : "";

  const notesSection = invoice.notes
    ? `<div style="margin-top: 24px; padding: 12px 16px; background: #f9f9f9; border-radius: 6px; font-size: 12px; color: #555;">${invoice.notes}</div>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none !important; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #222; background: #fff; margin: 0; padding: 40px; }
    .invoice { max-width: 680px; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; padding: 8px 0; border-bottom: 2px solid #e0e0e0; }
    th:nth-child(2) { text-align: center; }
    th:nth-child(3), th:nth-child(4) { text-align: right; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 24px;">
    <button onclick="window.print()" style="padding: 8px 24px; background: #111; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">Save as PDF</button>
  </div>
  <div class="invoice">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
      <div>
        <div style="font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">strvx</div>
        <div style="font-size: 12px; color: #888; margin-top: 2px;">Digital Agency</div>
        <div style="font-size: 12px; color: #888;">San Diego, CA</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px;">Invoice</div>
        <div style="font-size: 15px; font-weight: 600;">${invoice.invoiceNumber}</div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
      <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 4px;">Bill To</div>
        <div style="font-size: 14px; font-weight: 500;">${invoice.clientName}</div>
        ${invoice.clientEmail ? `<div style="font-size: 12px; color: #888;">${invoice.clientEmail}</div>` : ""}
      </div>
      <div style="text-align: right; font-size: 13px;">
        <div><span style="color: #888;">Issued:</span> ${invoice.issuedDate ?? "—"}</div>
        <div style="margin-top: 2px;"><span style="color: #888;">Due:</span> ${invoice.dueDate ?? "—"}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>${lineItemRows}</tbody>
    </table>

    <div style="text-align: right; margin-top: 16px;">
      <div style="font-size: 13px; color: #888; margin-bottom: 4px;">Subtotal: $${fmt(subtotal)}</div>
      ${taxRate > 0 ? `<div style="font-size: 13px; color: #888; margin-bottom: 4px;">Tax (${taxRate}%): $${fmt(tax)}</div>` : ""}
      <div style="font-size: 16px; font-weight: 700; border-top: 2px solid #222; display: inline-block; padding-top: 8px; margin-top: 4px;">Total: $${fmt(total)}</div>
    </div>

    ${paidSection}
    ${notesSection}

    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #f0f0f0; text-align: center; font-size: 11px; color: #aaa;">
      strvx &middot; San Diego, CA &middot; strvxteam@gmail.com
    </div>
  </div>

  <script>
    // Auto-trigger print dialog
    if (window.matchMedia('(display-mode: browser)').matches) {
      window.addEventListener('afterprint', () => {});
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/api/invoices/\[id\]/pdf/route.ts
git commit -m "feat: add PDF invoice route with print-to-PDF support"
```

---

### Task 9: Server Actions for Schedule CRUD and Manual Reconciliation

**Files:**
- Modify: `apps/internal/src/app/actions.ts`

- [ ] **Step 1: Add imports at the top of actions.ts**

Add `recurringInvoiceSchedules` and `invoiceReconciliations` to the schema imports, and add the new validation schemas to the validations import.

- [ ] **Step 2: Add schedule CRUD actions at the end of the file**

```typescript
// ── Recurring Schedule Actions ──────────────────────

export async function createRecurringScheduleAction(data: {
  engagementId: string;
  type: "retainer" | "milestone" | "commission";
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly";
  nextRunDate: string;
  autoSend: boolean;
  notes?: string;
  lineItemTemplate?: { description: string; quantity: number; rate: number }[];
  commissionRate?: number;
  commissionSourceUrl?: string;
  milestoneSchedule?: { date: string; description: string; amount: number }[];
}) {
  await getCurrentUser();
  const parsed = createRecurringScheduleSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const [schedule] = await db
    .insert(recurringInvoiceSchedules)
    .values({
      engagementId: parsed.data.engagementId,
      type: parsed.data.type,
      frequency: parsed.data.frequency,
      nextRunDate: parsed.data.nextRunDate,
      autoSend: parsed.data.autoSend,
      notes: parsed.data.notes || null,
      lineItemTemplate: parsed.data.lineItemTemplate || null,
      commissionRate: parsed.data.commissionRate != null ? String(parsed.data.commissionRate) : null,
      commissionSourceUrl: parsed.data.commissionSourceUrl || null,
      milestoneSchedule: parsed.data.milestoneSchedule || null,
    })
    .returning();

  revalidatePath("/invoices");
  return schedule;
}

export async function updateRecurringScheduleAction(
  scheduleId: string,
  data: { status?: "active" | "paused" | "cancelled"; frequency?: string; nextRunDate?: string; autoSend?: boolean; notes?: string }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(scheduleId);
  if (!parsedId.success) throw new Error("Invalid schedule ID");

  const updates: Record<string, unknown> = {};
  if (data.status) updates.status = data.status;
  if (data.frequency) updates.frequency = data.frequency;
  if (data.nextRunDate) updates.nextRunDate = data.nextRunDate;
  if (data.autoSend !== undefined) updates.autoSend = data.autoSend;
  if (data.notes !== undefined) updates.notes = data.notes;

  if (Object.keys(updates).length === 0) return;

  await db
    .update(recurringInvoiceSchedules)
    .set(updates)
    .where(eq(recurringInvoiceSchedules.id, scheduleId));

  revalidatePath("/invoices");
}

// ── Manual Reconciliation ───────────────────────────

export async function manualReconcileAction(data: {
  invoiceId: string;
  mercuryTransactionId: string;
  mercuryAmount: number;
}) {
  await getCurrentUser();
  const parsed = manualReconciliationSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  // Check if reconciliation record exists
  const [existing] = await db
    .select()
    .from(invoiceReconciliations)
    .where(eq(invoiceReconciliations.invoiceId, parsed.data.invoiceId));

  if (existing) {
    // Update existing
    await db
      .update(invoiceReconciliations)
      .set({
        mercuryTransactionId: parsed.data.mercuryTransactionId,
        mercuryAmount: String(parsed.data.mercuryAmount),
        status: "manual",
        matchedAt: new Date(),
        matchMethod: "manual",
      })
      .where(eq(invoiceReconciliations.id, existing.id));
  } else {
    // Create new
    await db.insert(invoiceReconciliations).values({
      invoiceId: parsed.data.invoiceId,
      mercuryTransactionId: parsed.data.mercuryTransactionId,
      mercuryAmount: String(parsed.data.mercuryAmount),
      status: "manual",
      matchedAt: new Date(),
      matchMethod: "manual",
    });
  }

  revalidatePath("/invoices");
  revalidatePath("/finances");
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/app/actions.ts
git commit -m "feat: add server actions for recurring schedules and manual reconciliation"
```

---

### Task 10: Vercel Cron Config

**Files:**
- Modify: `vercel.json` (create if it doesn't exist in `apps/internal/`)

- [ ] **Step 1: Add cron configuration**

Check if `vercel.json` exists in the project root or `apps/internal/`. Add the cron config:

```json
{
  "crons": [
    {
      "path": "/api/cron/generate-invoices",
      "schedule": "0 9 * * *"
    }
  ]
}
```

If a `vercel.json` already exists, merge the `crons` key into it.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel cron config for daily invoice processing"
```

---

### Task 11: Type Check and Verify

- [ ] **Step 1: Run TypeScript type checker**

Run: `cd ~/strvx && pnpm typecheck`
Expected: No type errors.

- [ ] **Step 2: Fix any type errors that arise**

Address any issues from the type check.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors from invoice enhancements"
```
