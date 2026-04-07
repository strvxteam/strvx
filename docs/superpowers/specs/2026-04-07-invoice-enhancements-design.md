# Invoice Enhancements — Design Spec

## Overview

Enhance the STRVX internal tool's invoice system with recurring invoices (retainers, milestones, commissions), PDF generation, overdue email reminders, Mercury bank reconciliation, and UI/UX improvements across the list, builder, and detail pages.

**Approach:** Hybrid — app owns scheduling and invoice generation, Stripe handles payment collection (existing flow), Mercury provides bank-side reconciliation.

## Existing System (Context)

The invoice system already supports:
- Full CRUD: create drafts, edit, send, void, mark paid
- Stripe integration: customer sync, hosted invoices, payment links, webhooks (auto-status on payment/failure/void)
- Email via Resend: HTML invoice email with pay button
- Client portal: invoice list with pay buttons
- Auto-incrementing invoice numbers: `STRVX-{YEAR}-{NNN}`
- Mercury API client: read-only, used on the finances page (not connected to invoices)

Key files:
- Schema: `packages/db/src/schema.ts`
- Queries: `apps/internal/src/lib/queries.ts`
- Stripe: `apps/internal/src/lib/stripe.ts`
- Email: `apps/internal/src/lib/invoice-email.ts`
- Actions: `apps/internal/src/app/actions.ts`
- Mercury: `apps/internal/src/lib/mercury.ts`
- Validations: `apps/internal/src/lib/validations.ts`
- Invoice pages: `apps/internal/src/app/(app)/invoices/`
- Webhook: `apps/internal/src/app/api/webhooks/stripe/route.ts`

---

## 1. Data Model

### New table: `recurring_invoice_schedules`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `engagementId` | uuid FK | Links to the client engagement |
| `type` | enum | `retainer`, `milestone`, `commission` |
| `status` | enum | `active`, `paused`, `cancelled` |
| `frequency` | enum | `weekly`, `biweekly`, `monthly`, `quarterly` |
| `nextRunDate` | date | When to generate the next invoice |
| `lineItemTemplate` | jsonb | Template line items (for retainers — reused each cycle) |
| `commissionRate` | numeric | Percentage for commission type (e.g., `10` = 10%) |
| `commissionSourceUrl` | text | URL to the client's admin dashboard API endpoint that returns revenue data (e.g., `https://clientapp.com/api/admin/revenue`) |
| `milestoneSchedule` | jsonb | Array of `{date, description, amount}` for milestone type |
| `notes` | text | Default notes to include on generated invoices |
| `autoSend` | boolean | If true, auto-send on generation; if false, create as draft for review |
| `createdAt` | timestamp | |

### New table: `invoice_reconciliations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `invoiceId` | uuid FK | Links to invoice |
| `stripePayoutId` | text | Stripe payout ID |
| `mercuryTransactionId` | text | Matched Mercury transaction ID |
| `stripeAmount` | numeric | Amount Stripe paid out |
| `mercuryAmount` | numeric | Amount that landed in Mercury |
| `status` | enum | `matched`, `unmatched`, `partial`, `manual` |
| `matchedAt` | timestamp | When the match was confirmed |
| `matchMethod` | enum | `auto`, `manual` |
| `createdAt` | timestamp | |

### Modifications to existing `invoices` table

- Add `recurringScheduleId` (uuid FK, nullable) — links back to the schedule that generated it
- Add `commissionRevenue` (numeric, nullable) — the client revenue figure used to calculate commission amount
- Add `reminderSentAt` (timestamp, nullable) — tracks whether the overdue reminder was sent

---

## 2. Recurring Invoice Engine

### Cron route: `/api/cron/generate-invoices`

Runs daily at 9 AM UTC via Vercel Cron.

**Flow:**
1. Query `recurring_invoice_schedules` where `status = 'active'` and `nextRunDate <= today`
2. For each schedule, generate an invoice based on type:
   - **Retainer** — clone `lineItemTemplate` as-is, same amount every time
   - **Milestone** — pull the next milestone from `milestoneSchedule` array, use that description + amount
   - **Commission** — fetch client revenue from `commissionSourceUrl`, calculate `revenue × commissionRate / 100`, create a single line item (e.g., "Commission — April 2026 (10% of $50,000)")
3. Insert invoice with `recurringScheduleId` set:
   - If `autoSend = true` → create as `status: 'sent'`, push to Stripe, send email (same as existing `sendInvoiceAction`)
   - If `autoSend = false` → create as `status: 'draft'` for manual review
4. Advance `nextRunDate` to the next cycle date based on `frequency`
5. For milestones — if all milestones are exhausted, set schedule `status = 'completed'`

**Edge cases:**
- Revenue API unreachable for commission invoices → create as `draft` with a note explaining the failure
- No engagement linked → skip and log warning
- Duplicate protection — check if an invoice with the same `recurringScheduleId` and matching `nextRunDate` already exists

**Vercel config** (`vercel.json`):
```json
{ "crons": [{ "path": "/api/cron/generate-invoices", "schedule": "0 9 * * *" }] }
```

---

## 3. PDF Generation

### Approach: Browser print-to-PDF (zero dependencies)

**API route:** `/api/invoices/[id]/pdf`

1. Fetches the invoice by ID
2. Renders a standalone HTML page with print-optimized CSS (matches the document-centered detail view layout)
3. Returns HTML with `Content-Type: text/html`
4. Client opens in a new tab → triggers `window.print()` → browser's native "Save as PDF"

**Why not Puppeteer:** Vercel serverless size limits (~280MB for Chromium). Browser print-to-PDF is zero-dependency and produces clean results.

**Template includes:**
- STRVX logo/header
- Bill-to section (client name, email)
- Invoice number, issue date, due date
- Line items table (description, qty, rate, amount)
- Subtotal, tax, total
- Payment status (if paid — shows date)
- Notes section
- Footer with company info

**Download button** added to:
- Invoice detail page (top action bar, all statuses)
- Invoice list page (in the row actions menu)

---

## 4. Overdue Email Reminder

### Same cron route handles reminders

After generating recurring invoices, the `/api/cron/generate-invoices` route also:

1. Queries invoices where `status = 'sent'` and `dueDate < today - 3 days` (3-day grace period) and `reminderSentAt IS NULL`
2. For each, sends one reminder email via Resend
3. Updates `status` to `overdue` and sets `reminderSentAt` to now

**Email content:**
- Subject: `Reminder: Invoice {number} is overdue — ${amount}`
- Body: mirrors original invoice email with an overdue banner at top
- Includes Stripe payment link
- Tone: professional, not aggressive

**One reminder only.** `reminderSentAt` prevents duplicates. Further follow-up is manual.

---

## 5. Mercury Reconciliation

### Three parts: data ingestion, matching engine, reporting

#### Data ingestion

Same daily cron (or a separate `/api/cron/sync-reconciliation` route) handles:

1. Fetch Stripe payouts via `stripe.payouts.list()` for the last 30 days
2. For each payout, fetch balance transactions via `stripe.balanceTransactions.list({ payout: payoutId })` to map payout → invoice(s)
3. Fetch recent Mercury transactions via existing `getMercuryTransactions()`
4. Store/update rows in `invoice_reconciliations`

#### Auto-matching logic

1. **Stripe side** — balance transactions reference charge/payment intent IDs, which link to Stripe invoice IDs, which link to local invoices via `stripeInvoiceId`
2. **Mercury side** — Stripe deposits land with "STRIPE" as counterparty. Match by:
   - Amount match: Stripe payout amount = Mercury deposit amount
   - Date proximity: Mercury deposit within 2-3 business days of Stripe payout date
3. Match outcomes:
   - Both match → `status: 'matched'`
   - Amount matches, no Mercury deposit yet → `status: 'unmatched'` (pending)
   - Stripe batches multiple invoices into one payout → `status: 'partial'`, link all invoices to that payout

#### Manual matching

- UI on the finances page or invoice detail to manually link an unmatched Mercury transaction to an invoice/payout
- For edge cases: wire transfers, checks, non-Stripe payments

#### Reporting

- **Invoice list page**: "Bank" column showing reconciliation status per invoice (matched ✓ / pending ⏳ / unmatched)
- **Invoice detail page**: reconciliation section in the payment timeline (dashboard view)
- **Finances page**: invoiced vs. banked summary, unmatched items list

---

## 6. UI/UX Design

### Invoice List Page — Enhanced Table

Current table layout with additions:
- **Status tab filters**: All | Draft | Sent | Overdue | Paid (pill-style toggle bar)
- **Search bar**: filters by invoice number, client name
- **Client dropdown**: filter by specific client
- **"Bank" column**: reconciliation status per row (✓ matched / ⏳ pending / — n/a)
- **4th summary card**: "Reconciled" amount alongside Outstanding, Overdue, Paid This Month
- **Row actions menu** (⋯): Edit (drafts), Void, Mark Paid, Download PDF

### Invoice Builder — Side-by-Side Form + Live Preview

Replace the current full-page form with a two-column layout:
- **Left: Form** — client selector, invoice type toggle (one-time / retainer / commission / milestone), dates with net-day quick buttons, line items table with inline editing
- **Right: Live preview** — renders the invoice document in real-time as the form is filled out, matching the PDF layout
- **Type-specific fields**:
  - One-time: standard line items (current behavior)
  - Retainer: frequency selector, auto-send toggle, line item template
  - Commission: commission rate %, revenue source URL/path, auto-send toggle
  - Milestone: milestone schedule builder (date + description + amount rows)
- **Action bar** (bottom): Save Draft | Preview PDF | Send Invoice
- For retainer/commission/milestone: "Send Invoice" becomes "Create Schedule" which creates the recurring schedule and optionally generates + sends the first invoice

### Invoice Detail Page — Dual-Mode

**Default: Dashboard view**
- Two-column layout
- Left column: client info card, line items card, notes card
- Right column:
  - Payment timeline (vertical): Created → Sent → Paid → Reconciled (with dates, color-coded dots)
  - Stripe details: invoice ID, payout amount, fees
  - Recurring info (if applicable): schedule type, frequency, next run date
- Top action bar: back link, invoice number + status badge, Download PDF | Void | Mark Paid buttons

**"View Invoice" mode**
- Toggled via a "View Invoice" button on the dashboard view
- Centered document layout matching the PDF template
- Compact reconciliation bar below the document
- Used for reviewing the final invoice appearance before sending or downloading

---

## 7. Agent Work Split

This work is designed to be split between two Claude Code agents:

**Agent 1 — Backend:**
- Database schema changes (new tables + invoice table modifications)
- Recurring invoice engine (cron route, schedule logic, invoice generation)
- Mercury reconciliation engine (data ingestion, matching, Stripe payout API)
- PDF route (`/api/invoices/[id]/pdf`)
- Overdue reminder logic in cron
- Server actions for recurring schedule CRUD
- Validation schemas for new forms

**Agent 2 — Frontend:**
- Invoice list page redesign (filters, search, reconciliation column)
- Invoice builder redesign (side-by-side, type selector, type-specific forms)
- Invoice detail page redesign (dual-mode: dashboard + document view)
- PDF print template styling
- Recurring schedule management UI (create/edit/pause/cancel)
- Manual reconciliation matching UI

---

## 8. Environment Variables

No new API keys required:
- **Mercury**: existing `MERCURY_API_KEY` (restricted, read-only) — already used by finances page
- **Stripe**: existing `STRIPE_SECRET_KEY` — payout/balance transaction read scopes are included
- **Stripe webhook**: existing `STRIPE_WEBHOOK_SECRET`
- **Email**: existing `RESEND_API_KEY` + `RESEND_FROM_EMAIL`

New Vercel config:
- Cron schedule in `vercel.json` for `/api/cron/generate-invoices`
