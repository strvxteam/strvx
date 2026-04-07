# Credit Cards Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-featured credit cards management tab under the existing `/finances` page, pulling live card data from Mercury's API and enriching it locally with budgets, receipts, alerts, and rewards tracking.

**Architecture:** Hybrid data approach — Mercury API provides the live card roster and transaction feed; four new Supabase/Drizzle tables store local enrichment (card config, budgets, receipts, alerts). The UI is a new `"credit-cards"` tab in `finances-client.tsx` that delegates to a component tree rooted at `credit-cards-tab.tsx` with 4 sub-views.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Drizzle ORM, Supabase (auth + storage), Mercury API, Recharts, Zod, Lucide icons, Sonner toasts.

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `apps/internal/src/app/(app)/finances/components/credit-cards/credit-cards-tab.tsx` | Main tab shell — sub-view pill toggle, delegates to sub-views |
| `apps/internal/src/app/(app)/finances/components/credit-cards/cards-overview.tsx` | Summary stats row + card grid |
| `apps/internal/src/app/(app)/finances/components/credit-cards/card-component.tsx` | Single card visual (network logo, utilization bar, status badge) |
| `apps/internal/src/app/(app)/finances/components/credit-cards/card-transactions.tsx` | Transaction table with filters + recurring charges section |
| `apps/internal/src/app/(app)/finances/components/credit-cards/card-budgets.tsx` | Per-card per-category budget CRUD + progress bars |
| `apps/internal/src/app/(app)/finances/components/credit-cards/card-reports.tsx` | Charts, rewards tracker, CSV/PDF export, per-employee view |
| `apps/internal/src/app/(app)/finances/components/credit-cards/receipt-upload.tsx` | File upload to Supabase Storage + display |
| `apps/internal/src/app/(app)/finances/components/credit-cards/configure-card-modal.tsx` | Modal for setting nickname, limit, employee, reward rate |
| `apps/internal/src/lib/recurring-detection.ts` | Recurring charge detection algorithm (pure function) |

### Modified files
| File | Changes |
|------|---------|
| `packages/db/src/schema.ts` | Add 4 tables: `creditCards`, `cardBudgets`, `cardReceipts`, `cardAlerts` |
| `apps/internal/src/lib/mercury.ts` | Add `MercuryCard` type, `getMercuryCards()`, `getAllMercuryCards()` |
| `apps/internal/src/lib/queries.ts` | Add query functions for the 4 new tables |
| `apps/internal/src/lib/validations.ts` | Add Zod schemas for card CRUD |
| `apps/internal/src/app/actions.ts` | Add server actions for card config, budgets, alerts, receipts |
| `apps/internal/src/app/(app)/finances/page.tsx` | Fetch card data in server component, pass as props |
| `apps/internal/src/app/(app)/finances/finances-client.tsx` | Add `"credit-cards"` to `TabView`, add props, render `<CreditCardsTab />` |

---

## Task 1: Database Schema — Add 4 New Tables

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Add `creditCards` table**

Add to the bottom of `packages/db/src/schema.ts`:

```typescript
// ── Credit Cards (local enrichment for Mercury cards) ─────────────

export const creditCards = pgTable("credit_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  mercuryCardId: text("mercury_card_id").notNull().unique(),
  cardNickname: text("card_nickname"),
  assignedEmployee: text("assigned_employee"),
  creditLimit: numeric("credit_limit"),
  rewardRate: numeric("reward_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Add `cardBudgets` table**

Add below `creditCards`:

```typescript
export const cardBudgets = pgTable("card_budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  creditCardId: uuid("credit_card_id")
    .notNull()
    .references(() => creditCards.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  monthlyLimit: numeric("monthly_limit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Add `cardReceipts` table**

```typescript
export const cardReceipts = pgTable("card_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  mercuryTransactionId: text("mercury_transaction_id").notNull(),
  creditCardId: uuid("credit_card_id")
    .notNull()
    .references(() => creditCards.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Add `cardAlerts` table**

```typescript
export const cardAlerts = pgTable("card_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  creditCardId: uuid("credit_card_id")
    .notNull()
    .references(() => creditCards.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(), // "limit_threshold" | "unusual_spend" | "payment_due"
  thresholdValue: numeric("threshold_value").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 5: Generate and run migration**

Run from repo root:

```bash
cd /Users/narvisbot/strvx
pnpm --filter @strvx/db drizzle-kit generate
pnpm --filter @strvx/db drizzle-kit migrate
```

Expected: Migration file created in `packages/db/drizzle/` and applied. Four new tables in the database.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat: add credit card enrichment tables (cards, budgets, receipts, alerts)"
```

---

## Task 2: Mercury API — Card Fetching Functions

**Files:**
- Modify: `apps/internal/src/lib/mercury.ts`

- [ ] **Step 1: Add `MercuryCard` type**

Add after the `MercuryTransaction` interface in `mercury.ts`:

```typescript
export interface MercuryCard {
  cardId: string;
  nameOnCard: string;
  lastFourDigits: string;
  network: "visa" | "mastercard";
  status: "active" | "frozen" | "cancelled" | "inactive" | "expired" | "suspended";
  physicalCardStatus: "inactive" | "active" | "paused" | null;
  createdAt: string;
}
```

- [ ] **Step 2: Update `PaginatedResponse` to support cards**

Replace the existing `PaginatedResponse` interface:

```typescript
interface PaginatedResponse<T> {
  total: number;
  transactions?: T[];
  accounts?: T[];
  cards?: T[];
}
```

- [ ] **Step 3: Add `getMercuryCards` function**

Add after `getAllMercuryTransactions`:

```typescript
export async function getMercuryCards(
  accountId: string
): Promise<MercuryCard[]> {
  const res = await fetch(`${MERCURY_BASE}/account/${accountId}/cards`, {
    headers: getHeaders(),
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.error("[Mercury] Failed to fetch cards:", res.status, await res.text());
    return [];
  }
  const data = (await res.json()) as PaginatedResponse<MercuryCard>;
  return data.cards ?? [];
}
```

- [ ] **Step 4: Add `getAllMercuryCards` function**

```typescript
export async function getAllMercuryCards(): Promise<MercuryCard[]> {
  const accounts = await getMercuryAccounts();
  if (accounts.length === 0) return [];

  const allCards: MercuryCard[] = [];
  await Promise.all(
    accounts.map(async (acct) => {
      const cards = await getMercuryCards(acct.id);
      allCards.push(...cards);
    })
  );

  allCards.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return allCards;
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/internal/src/lib/mercury.ts
git commit -m "feat: add Mercury card-fetching API functions"
```

---

## Task 3: Validation Schemas

**Files:**
- Modify: `apps/internal/src/lib/validations.ts`

- [ ] **Step 1: Add card configuration schema**

Add to the bottom of `validations.ts`:

```typescript
// ── Credit Cards ─────────────────────────────────────

export const upsertCardConfigSchema = z.object({
  mercuryCardId: z.string().min(1, "Mercury card ID is required"),
  cardNickname: z.string().max(100).optional(),
  assignedEmployee: z.string().max(200).optional(),
  creditLimit: z.number().min(0).optional(),
  rewardRate: z.number().min(0).max(100).optional(),
});

export const createCardBudgetSchema = z.object({
  creditCardId: z.string().uuid("Invalid card ID"),
  category: z.string().min(1, "Category is required").max(100),
  monthlyLimit: z.number().positive("Budget must be positive"),
});

export const updateCardBudgetSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  monthlyLimit: z.number().positive().optional(),
});

export const upsertCardAlertSchema = z.object({
  creditCardId: z.string().uuid("Invalid card ID"),
  alertType: z.enum(["limit_threshold", "unusual_spend", "payment_due"]),
  thresholdValue: z.number().min(0),
  enabled: z.boolean().optional(),
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/lib/validations.ts
git commit -m "feat: add Zod schemas for credit card CRUD"
```

---

## Task 4: Query Functions

**Files:**
- Modify: `apps/internal/src/lib/queries.ts`

- [ ] **Step 1: Add import for new tables**

At the top of `queries.ts`, add the new tables to the existing schema import:

```typescript
import { creditCards, cardBudgets, cardReceipts, cardAlerts } from "@/lib/db/schema";
```

(Merge into the existing import from `@/lib/db/schema`.)

- [ ] **Step 2: Add card query functions**

Add to the bottom of `queries.ts`:

```typescript
// ── Credit Cards ─────────────────────────────────────

export async function getCreditCards() {
  return db.select().from(creditCards).orderBy(desc(creditCards.createdAt));
}

export async function getCreditCardByMercuryId(mercuryCardId: string) {
  const rows = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.mercuryCardId, mercuryCardId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCardBudgets(creditCardId: string) {
  return db
    .select()
    .from(cardBudgets)
    .where(eq(cardBudgets.creditCardId, creditCardId))
    .orderBy(cardBudgets.category);
}

export async function getAllCardBudgets() {
  return db.select().from(cardBudgets).orderBy(cardBudgets.category);
}

export async function getCardReceipts(creditCardId: string) {
  return db
    .select()
    .from(cardReceipts)
    .where(eq(cardReceipts.creditCardId, creditCardId))
    .orderBy(desc(cardReceipts.uploadedAt));
}

export async function getReceiptByTransactionId(mercuryTransactionId: string) {
  const rows = await db
    .select()
    .from(cardReceipts)
    .where(eq(cardReceipts.mercuryTransactionId, mercuryTransactionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAllCardReceipts() {
  return db.select().from(cardReceipts);
}

export async function getCardAlerts(creditCardId: string) {
  return db
    .select()
    .from(cardAlerts)
    .where(eq(cardAlerts.creditCardId, creditCardId));
}

export async function getAllCardAlerts() {
  return db.select().from(cardAlerts);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/lib/queries.ts
git commit -m "feat: add query functions for credit card tables"
```

---

## Task 5: Server Actions

**Files:**
- Modify: `apps/internal/src/app/actions.ts`

- [ ] **Step 1: Add imports**

Add to the existing imports at the top of `actions.ts`:

```typescript
import { creditCards, cardBudgets, cardReceipts, cardAlerts } from "@/lib/db/schema";
import {
  upsertCardConfigSchema,
  createCardBudgetSchema,
  updateCardBudgetSchema,
  upsertCardAlertSchema,
} from "@/lib/validations";
```

(Merge into existing import lines for schema and validations.)

- [ ] **Step 2: Add `upsertCardConfig` action**

```typescript
export async function upsertCardConfig(data: {
  mercuryCardId: string;
  cardNickname?: string;
  assignedEmployee?: string;
  creditLimit?: number;
  rewardRate?: number;
}) {
  await getCurrentUser();
  const parsed = upsertCardConfigSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const existing = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.mercuryCardId, parsed.data.mercuryCardId))
    .limit(1);

  if (existing.length > 0) {
    const setData: Record<string, unknown> = {};
    if (parsed.data.cardNickname !== undefined) setData.cardNickname = parsed.data.cardNickname;
    if (parsed.data.assignedEmployee !== undefined) setData.assignedEmployee = parsed.data.assignedEmployee;
    if (parsed.data.creditLimit !== undefined) setData.creditLimit = String(parsed.data.creditLimit);
    if (parsed.data.rewardRate !== undefined) setData.rewardRate = String(parsed.data.rewardRate);

    const [updated] = await db
      .update(creditCards)
      .set(setData)
      .where(eq(creditCards.mercuryCardId, parsed.data.mercuryCardId))
      .returning();
    revalidatePath("/finances");
    return updated;
  }

  const [created] = await db
    .insert(creditCards)
    .values({
      mercuryCardId: parsed.data.mercuryCardId,
      cardNickname: parsed.data.cardNickname ?? null,
      assignedEmployee: parsed.data.assignedEmployee ?? null,
      creditLimit: parsed.data.creditLimit != null ? String(parsed.data.creditLimit) : null,
      rewardRate: parsed.data.rewardRate != null ? String(parsed.data.rewardRate) : null,
    })
    .returning();
  revalidatePath("/finances");
  return created;
}
```

- [ ] **Step 3: Add budget actions**

```typescript
export async function createCardBudget(data: {
  creditCardId: string;
  category: string;
  monthlyLimit: number;
}) {
  await getCurrentUser();
  const parsed = createCardBudgetSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const [budget] = await db
    .insert(cardBudgets)
    .values({
      creditCardId: parsed.data.creditCardId,
      category: parsed.data.category,
      monthlyLimit: String(parsed.data.monthlyLimit),
    })
    .returning();
  revalidatePath("/finances");
  return budget;
}

export async function updateCardBudget(budgetId: string, data: {
  category?: string;
  monthlyLimit?: number;
}) {
  await getCurrentUser();
  const parsedId = z.string().uuid().safeParse(budgetId);
  if (!parsedId.success) throw new Error("Invalid budget ID");
  const parsed = updateCardBudgetSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const setData: Record<string, unknown> = {};
  if (parsed.data.category !== undefined) setData.category = parsed.data.category;
  if (parsed.data.monthlyLimit !== undefined) setData.monthlyLimit = String(parsed.data.monthlyLimit);

  const [updated] = await db
    .update(cardBudgets)
    .set(setData)
    .where(eq(cardBudgets.id, parsedId.data))
    .returning();
  revalidatePath("/finances");
  return updated;
}

export async function deleteCardBudget(budgetId: string) {
  await getCurrentUser();
  const parsed = z.string().uuid().safeParse(budgetId);
  if (!parsed.success) throw new Error("Invalid budget ID");

  await db.delete(cardBudgets).where(eq(cardBudgets.id, parsed.data));
  revalidatePath("/finances");
}
```

- [ ] **Step 4: Add alert actions**

```typescript
export async function upsertCardAlert(data: {
  creditCardId: string;
  alertType: "limit_threshold" | "unusual_spend" | "payment_due";
  thresholdValue: number;
  enabled?: boolean;
}) {
  await getCurrentUser();
  const parsed = upsertCardAlertSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const existing = await db
    .select()
    .from(cardAlerts)
    .where(
      and(
        eq(cardAlerts.creditCardId, parsed.data.creditCardId),
        eq(cardAlerts.alertType, parsed.data.alertType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(cardAlerts)
      .set({
        thresholdValue: String(parsed.data.thresholdValue),
        enabled: parsed.data.enabled ?? true,
      })
      .where(eq(cardAlerts.id, existing[0].id))
      .returning();
    revalidatePath("/finances");
    return updated;
  }

  const [created] = await db
    .insert(cardAlerts)
    .values({
      creditCardId: parsed.data.creditCardId,
      alertType: parsed.data.alertType,
      thresholdValue: String(parsed.data.thresholdValue),
      enabled: parsed.data.enabled ?? true,
    })
    .returning();
  revalidatePath("/finances");
  return created;
}

export async function deleteCardAlert(alertId: string) {
  await getCurrentUser();
  const parsed = z.string().uuid().safeParse(alertId);
  if (!parsed.success) throw new Error("Invalid alert ID");

  await db.delete(cardAlerts).where(eq(cardAlerts.id, parsed.data));
  revalidatePath("/finances");
}
```

- [ ] **Step 5: Add receipt upload action**

```typescript
export async function uploadCardReceipt(data: {
  mercuryTransactionId: string;
  creditCardId: string;
  fileUrl: string;
}) {
  await getCurrentUser();
  const parsed = z.object({
    mercuryTransactionId: z.string().min(1),
    creditCardId: z.string().uuid(),
    fileUrl: z.string().url(),
  }).safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  // Upsert — replace existing receipt for this transaction
  const existing = await db
    .select()
    .from(cardReceipts)
    .where(eq(cardReceipts.mercuryTransactionId, parsed.data.mercuryTransactionId))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(cardReceipts)
      .set({ fileUrl: parsed.data.fileUrl })
      .where(eq(cardReceipts.id, existing[0].id))
      .returning();
    revalidatePath("/finances");
    return updated;
  }

  const [created] = await db
    .insert(cardReceipts)
    .values({
      mercuryTransactionId: parsed.data.mercuryTransactionId,
      creditCardId: parsed.data.creditCardId,
      fileUrl: parsed.data.fileUrl,
    })
    .returning();
  revalidatePath("/finances");
  return created;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/internal/src/app/actions.ts
git commit -m "feat: add server actions for credit card config, budgets, alerts, receipts"
```

---

## Task 6: Recurring Charge Detection

**Files:**
- Create: `apps/internal/src/lib/recurring-detection.ts`

- [ ] **Step 1: Create the recurring detection module**

```typescript
interface Transaction {
  id: string;
  amount: number;
  counterpartyName: string;
  createdAt: string;
}

export interface RecurringCharge {
  counterpartyName: string;
  averageAmount: number;
  frequency: "weekly" | "monthly" | "quarterly";
  confidence: "high" | "medium";
  lastChargedDate: string;
  nextExpectedDate: string;
  occurrences: number;
  totalMonthlyEstimate: number;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function detectFrequency(
  avgGap: number
): "weekly" | "monthly" | "quarterly" | null {
  if (avgGap >= 5 && avgGap <= 10) return "weekly";
  if (avgGap >= 25 && avgGap <= 38) return "monthly";
  if (avgGap >= 80 && avgGap <= 100) return "quarterly";
  return null;
}

function addFrequency(date: Date, freq: "weekly" | "monthly" | "quarterly"): string {
  const d = new Date(date);
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setMonth(d.getMonth() + 3);
  return d.toISOString().split("T")[0];
}

function toMonthly(amount: number, freq: "weekly" | "monthly" | "quarterly"): number {
  if (freq === "weekly") return amount * 4.33;
  if (freq === "monthly") return amount;
  return amount / 3;
}

export function detectRecurringCharges(
  transactions: Transaction[]
): RecurringCharge[] {
  // Group by counterparty
  const groups = new Map<string, Transaction[]>();
  for (const txn of transactions) {
    const key = txn.counterpartyName.toLowerCase().trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(txn);
    groups.set(key, list);
  }

  const results: RecurringCharge[] = [];

  for (const [, txns] of groups) {
    if (txns.length < 2) continue;

    // Sort by date ascending
    const sorted = [...txns].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Check amount similarity (within 10% of average)
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const allSimilar = amounts.every(
      (a) => Math.abs(a - avgAmount) / avgAmount <= 0.1
    );
    if (!allSimilar) continue;

    // Check interval regularity
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i].createdAt, sorted[i - 1].createdAt));
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

    const frequency = detectFrequency(avgGap);
    if (!frequency) continue;

    // Confidence: exact amount + consistent gap = high
    const exactAmount = amounts.every((a) => a === amounts[0]);
    const gapVariance =
      gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length;
    const confidence: "high" | "medium" =
      exactAmount && gapVariance < 25 ? "high" : "medium";

    const lastTxn = sorted[sorted.length - 1];

    results.push({
      counterpartyName: lastTxn.counterpartyName,
      averageAmount: Math.round(avgAmount * 100) / 100,
      frequency,
      confidence,
      lastChargedDate: lastTxn.createdAt.split("T")[0],
      nextExpectedDate: addFrequency(new Date(lastTxn.createdAt), frequency),
      occurrences: sorted.length,
      totalMonthlyEstimate: Math.round(toMonthly(avgAmount, frequency) * 100) / 100,
    });
  }

  // Sort by monthly estimate descending
  results.sort((a, b) => b.totalMonthlyEstimate - a.totalMonthlyEstimate);
  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/lib/recurring-detection.ts
git commit -m "feat: add recurring charge detection algorithm"
```

---

## Task 7: Server Data Fetching — Update `page.tsx`

**Files:**
- Modify: `apps/internal/src/app/(app)/finances/page.tsx`

- [ ] **Step 1: Add imports for card data**

Add to the imports at the top of `page.tsx`:

```typescript
import { getAllMercuryCards } from "@/lib/mercury";
import { getCreditCards, getAllCardBudgets, getAllCardReceipts, getAllCardAlerts } from "@/lib/queries";
```

- [ ] **Step 2: Fetch card data alongside existing fetches**

Inside the `if (mercuryConnected)` block, add card fetching to the existing `Promise.all`:

Replace the existing Mercury fetch block:

```typescript
  if (mercuryConnected) {
    try {
      const [accounts, transactions, mercuryCards] = await Promise.all([
        getMercuryAccounts(),
        getAllMercuryTransactions({ limit: 50 }),
        getAllMercuryCards(),
      ]);
```

(Add `mercuryCards` to the destructuring and `getAllMercuryCards()` to the Promise.all.)

- [ ] **Step 3: Fetch local enrichment data**

Add after the Mercury fetch block (still inside the server component, outside the `if`):

```typescript
  // Fetch local card enrichment data
  const [localCards, allBudgets, allReceipts, allAlerts] = await Promise.all([
    getCreditCards(),
    getAllCardBudgets(),
    getAllCardReceipts(),
    getAllCardAlerts(),
  ]);

  const cardEnrichment = localCards.map((c) => ({
    id: c.id,
    mercuryCardId: c.mercuryCardId,
    cardNickname: c.cardNickname,
    assignedEmployee: c.assignedEmployee,
    creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
    rewardRate: c.rewardRate ? Number(c.rewardRate) : null,
  }));

  const budgets = allBudgets.map((b) => ({
    id: b.id,
    creditCardId: b.creditCardId,
    category: b.category,
    monthlyLimit: Number(b.monthlyLimit),
  }));

  const receipts = allReceipts.map((r) => ({
    id: r.id,
    mercuryTransactionId: r.mercuryTransactionId,
    creditCardId: r.creditCardId,
    fileUrl: r.fileUrl,
  }));

  const alerts = allAlerts.map((a) => ({
    id: a.id,
    creditCardId: a.creditCardId,
    alertType: a.alertType as "limit_threshold" | "unusual_spend" | "payment_due",
    thresholdValue: Number(a.thresholdValue),
    enabled: a.enabled,
  }));
```

- [ ] **Step 4: Transform Mercury cards and pass to client**

Add the Mercury card transformation:

```typescript
  const mercuryCardsList = (mercuryConnected ? mercuryCards : []).map((c) => ({
    cardId: c.cardId,
    nameOnCard: c.nameOnCard,
    lastFourDigits: c.lastFourDigits,
    network: c.network,
    status: c.status,
    physicalCardStatus: c.physicalCardStatus,
    createdAt: c.createdAt,
  }));
```

Add these new props to the `<FinancesPage />` return:

```typescript
      mercuryCards={mercuryCardsList}
      cardEnrichment={cardEnrichment}
      cardBudgets={budgets}
      cardReceipts={receipts}
      cardAlerts={alerts}
```

- [ ] **Step 5: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/page.tsx
git commit -m "feat: fetch Mercury cards and local enrichment in finances server component"
```

---

## Task 8: Tab Integration — Update `finances-client.tsx`

**Files:**
- Modify: `apps/internal/src/app/(app)/finances/finances-client.tsx`

- [ ] **Step 1: Update `TabView` type**

Change:

```typescript
type TabView = "overview" | "revenue" | "expenses";
```

To:

```typescript
type TabView = "overview" | "revenue" | "expenses" | "credit-cards";
```

- [ ] **Step 2: Add card-related type definitions**

Add after the existing interfaces (after `ProjectProfitability`):

```typescript
export interface MercuryCardSlim {
  cardId: string;
  nameOnCard: string;
  lastFourDigits: string;
  network: "visa" | "mastercard";
  status: "active" | "frozen" | "cancelled" | "inactive" | "expired" | "suspended";
  physicalCardStatus: "inactive" | "active" | "paused" | null;
  createdAt: string;
}

export interface CardEnrichment {
  id: string;
  mercuryCardId: string;
  cardNickname: string | null;
  assignedEmployee: string | null;
  creditLimit: number | null;
  rewardRate: number | null;
}

export interface CardBudgetSlim {
  id: string;
  creditCardId: string;
  category: string;
  monthlyLimit: number;
}

export interface CardReceiptSlim {
  id: string;
  mercuryTransactionId: string;
  creditCardId: string;
  fileUrl: string;
}

export interface CardAlertSlim {
  id: string;
  creditCardId: string;
  alertType: "limit_threshold" | "unusual_spend" | "payment_due";
  thresholdValue: number;
  enabled: boolean;
}
```

- [ ] **Step 3: Add card props to `FinancesPageProps`**

Add to the `FinancesPageProps` interface:

```typescript
  mercuryCards?: MercuryCardSlim[];
  cardEnrichment?: CardEnrichment[];
  cardBudgets?: CardBudgetSlim[];
  cardReceipts?: CardReceiptSlim[];
  cardAlerts?: CardAlertSlim[];
```

Add defaults in the destructuring:

```typescript
  mercuryCards = [],
  cardEnrichment = [],
  cardBudgets = [],
  cardReceipts = [],
  cardAlerts = [],
```

- [ ] **Step 4: Add import for CreditCardsTab**

```typescript
import { CreditCardsTab } from "./components/credit-cards/credit-cards-tab";
```

- [ ] **Step 5: Update tab buttons array**

Change:

```typescript
{(["overview", "revenue", "expenses"] as const).map((t) => (
```

To:

```typescript
{(["overview", "revenue", "expenses", "credit-cards"] as const).map((t) => (
```

Update the button label to show "Credit Cards" properly. Replace the button content `{t}` with:

```typescript
{t === "credit-cards" ? "Credit Cards" : t}
```

- [ ] **Step 6: Add credit-cards tab render block**

After the `{tab === "expenses" && (` block, add:

```typescript
      {tab === "credit-cards" && (
        <CreditCardsTab
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardBudgets={cardBudgets}
          cardReceipts={cardReceipts}
          cardAlerts={cardAlerts}
          bankTransactions={bankTransactions}
          mercuryConnected={mercuryConnected}
        />
      )}
```

- [ ] **Step 7: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/finances-client.tsx
git commit -m "feat: add credit-cards tab to finances page"
```

---

## Task 9: Credit Cards Tab Shell

**Files:**
- Create: `apps/internal/src/app/(app)/finances/components/credit-cards/credit-cards-tab.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /Users/narvisbot/strvx/apps/internal/src/app/\(app\)/finances/components/credit-cards
```

- [ ] **Step 2: Create the tab shell component**

```typescript
"use client";

import { useState } from "react";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardBudgetSlim,
  CardReceiptSlim,
  CardAlertSlim,
} from "../../finances-client";
import { CardsOverview } from "./cards-overview";
import { CardTransactions } from "./card-transactions";
import { CardBudgets } from "./card-budgets";
import { CardReports } from "./card-reports";

type SubView = "overview" | "transactions" | "budgets" | "reports";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CreditCardsTabProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardBudgets: CardBudgetSlim[];
  cardReceipts: CardReceiptSlim[];
  cardAlerts: CardAlertSlim[];
  bankTransactions: BankTransaction[];
  mercuryConnected: boolean;
}

export function CreditCardsTab({
  mercuryCards,
  cardEnrichment,
  cardBudgets,
  cardReceipts,
  cardAlerts,
  bankTransactions,
  mercuryConnected,
}: CreditCardsTabProps) {
  const [subView, setSubView] = useState<SubView>("overview");

  // Check for payment_due alerts
  const paymentDueAlerts = cardAlerts.filter(
    (a) => a.alertType === "payment_due" && a.enabled
  );

  if (!mercuryConnected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d0d0d0] py-16 text-center">
        <p className="text-[15px] font-medium text-[#333]">
          Mercury not connected
        </p>
        <p className="mt-1 text-[13px] text-[#888]">
          Set the MERCURY_API_KEY environment variable to enable credit card tracking.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Payment due banner */}
      {paymentDueAlerts.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          <span className="font-medium">Payment Reminder:</span>{" "}
          {paymentDueAlerts.length} card(s) have upcoming payment due dates.
        </div>
      )}

      {/* Sub-view pill toggle */}
      <div className="mb-5 flex items-center gap-1 rounded-lg border border-[#e0e0e0] bg-white p-1 w-fit">
        {(["overview", "transactions", "budgets", "reports"] as const).map(
          (sv) => (
            <button
              key={sv}
              onClick={() => setSubView(sv)}
              className={`rounded-md px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                subView === sv
                  ? "bg-[#111] text-white"
                  : "text-[#555] hover:bg-[#f5f5f5]"
              }`}
            >
              {sv}
            </button>
          )
        )}
      </div>

      {subView === "overview" && (
        <CardsOverview
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardAlerts={cardAlerts}
          bankTransactions={bankTransactions}
        />
      )}
      {subView === "transactions" && (
        <CardTransactions
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardReceipts={cardReceipts}
          cardAlerts={cardAlerts}
          bankTransactions={bankTransactions}
        />
      )}
      {subView === "budgets" && (
        <CardBudgets
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardBudgets={cardBudgets}
          cardAlerts={cardAlerts}
          bankTransactions={bankTransactions}
        />
      )}
      {subView === "reports" && (
        <CardReports
          mercuryCards={mercuryCards}
          cardEnrichment={cardEnrichment}
          cardBudgets={cardBudgets}
          cardReceipts={cardReceipts}
          bankTransactions={bankTransactions}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/components/credit-cards/credit-cards-tab.tsx
git commit -m "feat: add credit cards tab shell with sub-view routing"
```

---

## Task 10: Configure Card Modal

**Files:**
- Create: `apps/internal/src/app/(app)/finances/components/credit-cards/configure-card-modal.tsx`

- [ ] **Step 1: Create the modal component**

```typescript
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { upsertCardConfig } from "@/app/actions";
import { toast } from "sonner";
import type { MercuryCardSlim, CardEnrichment } from "../../finances-client";

interface ConfigureCardModalProps {
  card: MercuryCardSlim;
  enrichment: CardEnrichment | null;
  onClose: () => void;
}

export function ConfigureCardModal({
  card,
  enrichment,
  onClose,
}: ConfigureCardModalProps) {
  const [nickname, setNickname] = useState(enrichment?.cardNickname ?? "");
  const [employee, setEmployee] = useState(enrichment?.assignedEmployee ?? "");
  const [limit, setLimit] = useState(enrichment?.creditLimit?.toString() ?? "");
  const [rewardRate, setRewardRate] = useState(
    enrichment?.rewardRate?.toString() ?? "1.5"
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await upsertCardConfig({
        mercuryCardId: card.cardId,
        cardNickname: nickname || undefined,
        assignedEmployee: employee || undefined,
        creditLimit: limit ? Number(limit) : undefined,
        rewardRate: rewardRate ? Number(rewardRate) : undefined,
      });
      toast.success("Card configured");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">
            Configure Card •••• {card.lastFourDigits}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[#888] hover:bg-[#f0f0f0]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#555]">Nickname</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Marketing Card"
              className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#555]">
              Assigned Employee
            </span>
            <input
              type="text"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              placeholder="e.g. John Smith"
              className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#555]">
              Credit Limit ($)
            </span>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 10000"
              min="0"
              step="100"
              className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#555]">
              Reward Rate (%)
            </span>
            <input
              type="number"
              value={rewardRate}
              onChange={(e) => setRewardRate(e.target.value)}
              placeholder="e.g. 1.5"
              min="0"
              max="100"
              step="0.1"
              className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#e0e0e0] px-4 py-1.5 text-[13px] font-medium text-[#555] hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#111] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/components/credit-cards/configure-card-modal.tsx
git commit -m "feat: add configure card modal (nickname, employee, limit, reward rate)"
```

---

## Task 11: Card Component

**Files:**
- Create: `apps/internal/src/app/(app)/finances/components/credit-cards/card-component.tsx`

- [ ] **Step 1: Create the visual card component**

```typescript
"use client";

import { Settings, AlertTriangle } from "lucide-react";
import type { MercuryCardSlim, CardEnrichment, CardAlertSlim } from "../../finances-client";

interface CardComponentProps {
  card: MercuryCardSlim;
  enrichment: CardEnrichment | null;
  alerts: CardAlertSlim[];
  currentSpend: number;
  onConfigure: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-green-50", text: "text-green-700" },
  frozen: { bg: "bg-blue-50", text: "text-blue-700" },
  cancelled: { bg: "bg-red-50", text: "text-red-700" },
  inactive: { bg: "bg-gray-50", text: "text-gray-500" },
  expired: { bg: "bg-orange-50", text: "text-orange-700" },
  suspended: { bg: "bg-red-50", text: "text-red-700" },
};

export function CardComponent({
  card,
  enrichment,
  alerts,
  currentSpend,
  onConfigure,
}: CardComponentProps) {
  const limit = enrichment?.creditLimit ?? 0;
  const utilization = limit > 0 ? (currentSpend / limit) * 100 : 0;
  const rewardRate = enrichment?.rewardRate ?? 0;

  // Check for limit threshold alert
  const thresholdAlert = alerts.find(
    (a) => a.alertType === "limit_threshold" && a.enabled
  );
  const isOverThreshold =
    thresholdAlert && limit > 0 && utilization >= thresholdAlert.thresholdValue;

  const statusStyle = STATUS_COLORS[card.status] ?? STATUS_COLORS.inactive;

  return (
    <div className="relative rounded-xl border border-[#e0e0e0] bg-white p-4 transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#111]">
              •••• {card.lastFourDigits}
            </span>
            <span className="text-[11px] font-medium uppercase text-[#999]">
              {card.network}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[#888]">
            {enrichment?.cardNickname ?? card.nameOnCard}
          </p>
          {enrichment?.assignedEmployee && (
            <p className="text-[11px] text-[#aaa]">
              {enrichment.assignedEmployee}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}
          >
            {card.status}
          </span>
          <button
            onClick={onConfigure}
            className="rounded-md p-1 text-[#999] hover:bg-[#f0f0f0] hover:text-[#555]"
            title="Configure card"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Limit & Utilization */}
      {limit > 0 ? (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-[#888]">
              ${currentSpend.toLocaleString()} / ${limit.toLocaleString()}
            </span>
            <span
              className={`font-medium ${
                isOverThreshold ? "text-amber-600" : "text-[#555]"
              }`}
            >
              {utilization.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0f0]">
            <div
              className={`h-full rounded-full transition-all ${
                isOverThreshold
                  ? "bg-amber-400"
                  : utilization > 90
                    ? "bg-red-400"
                    : "bg-[#111]"
              }`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          {isOverThreshold && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600">
              <AlertTriangle size={12} />
              Approaching limit ({thresholdAlert.thresholdValue}% threshold)
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={onConfigure}
          className="mb-3 w-full rounded-lg border border-dashed border-[#d0d0d0] py-2 text-[12px] text-[#888] hover:border-[#999] hover:text-[#555]"
        >
          Set credit limit to track utilization
        </button>
      )}

      {/* Reward rate */}
      {rewardRate > 0 && (
        <div className="text-[11px] text-[#aaa]">
          {rewardRate}% cashback
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/components/credit-cards/card-component.tsx
git commit -m "feat: add individual credit card visual component"
```

---

## Task 12: Cards Overview Sub-view

**Files:**
- Create: `apps/internal/src/app/(app)/finances/components/credit-cards/cards-overview.tsx`

- [ ] **Step 1: Create the overview component**

```typescript
"use client";

import { useState, useMemo } from "react";
import { CreditCard, DollarSign, TrendingUp, Percent } from "lucide-react";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardAlertSlim,
} from "../../finances-client";
import { CardComponent } from "./card-component";
import { ConfigureCardModal } from "./configure-card-modal";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CardsOverviewProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardAlerts: CardAlertSlim[];
  bankTransactions: BankTransaction[];
}

export function CardsOverview({
  mercuryCards,
  cardEnrichment,
  cardAlerts,
  bankTransactions,
}: CardsOverviewProps) {
  const [configuringCard, setConfiguringCard] = useState<MercuryCardSlim | null>(
    null
  );

  // Calculate per-card spend from transactions (negative amounts = spending)
  const cardSpendMap = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const map = new Map<string, number>();

    for (const txn of bankTransactions) {
      if (new Date(txn.createdAt) < monthStart) continue;
      if (txn.amount >= 0) continue; // skip credits/deposits
      // Attribute to a card if kind contains "card" (verify against live data)
      if (txn.kind.toLowerCase().includes("card")) {
        // Sum absolute spend — we don't have per-card attribution from Mercury
        // so we distribute evenly across active cards as a baseline
        const key = "__all__";
        map.set(key, (map.get(key) ?? 0) + Math.abs(txn.amount));
      }
    }
    return map;
  }, [bankTransactions]);

  const totalCardSpend = cardSpendMap.get("__all__") ?? 0;
  const activeCards = mercuryCards.filter((c) => c.status === "active");
  const perCardSpend =
    activeCards.length > 0 ? totalCardSpend / activeCards.length : 0;

  // Summary stats
  const totalLimit = cardEnrichment.reduce(
    (sum, e) => sum + (e.creditLimit ?? 0),
    0
  );
  const overallUtilization =
    totalLimit > 0 ? (totalCardSpend / totalLimit) * 100 : 0;
  const avgRewardRate =
    cardEnrichment.length > 0
      ? cardEnrichment.reduce((sum, e) => sum + (e.rewardRate ?? 0), 0) /
        cardEnrichment.filter((e) => e.rewardRate && e.rewardRate > 0).length || 0
      : 0;
  const estimatedRewards = totalCardSpend * (avgRewardRate / 100);

  function getEnrichment(cardId: string): CardEnrichment | null {
    return cardEnrichment.find((e) => e.mercuryCardId === cardId) ?? null;
  }

  function getAlerts(cardId: string): CardAlertSlim[] {
    const enrichment = getEnrichment(cardId);
    if (!enrichment) return [];
    return cardAlerts.filter((a) => a.creditCardId === enrichment.id);
  }

  const stats = [
    {
      label: "Total Credit Limit",
      value: `$${totalLimit.toLocaleString()}`,
      icon: CreditCard,
    },
    {
      label: "Current Month Spend",
      value: `$${totalCardSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
    },
    {
      label: "Utilization",
      value: totalLimit > 0 ? `${overallUtilization.toFixed(1)}%` : "—",
      icon: Percent,
    },
    {
      label: "Est. Rewards (MTD)",
      value: `$${estimatedRewards.toFixed(2)}`,
      icon: TrendingUp,
    },
  ];

  return (
    <div>
      {/* Summary stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[#e0e0e0] bg-white p-4"
          >
            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase text-[#999]">
              <s.icon size={13} strokeWidth={1.5} />
              {s.label}
            </div>
            <div className="text-[18px] font-semibold text-[#111]">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Card grid */}
      {mercuryCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d0d0d0] py-16 text-center">
          <CreditCard size={28} strokeWidth={1.5} className="mb-2 text-[#ccc]" />
          <p className="text-[13px] text-[#888]">
            No cards found in Mercury.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mercuryCards.map((card) => (
            <CardComponent
              key={card.cardId}
              card={card}
              enrichment={getEnrichment(card.cardId)}
              alerts={getAlerts(card.cardId)}
              currentSpend={card.status === "active" ? perCardSpend : 0}
              onConfigure={() => setConfiguringCard(card)}
            />
          ))}
        </div>
      )}

      {/* Configure modal */}
      {configuringCard && (
        <ConfigureCardModal
          card={configuringCard}
          enrichment={getEnrichment(configuringCard.cardId)}
          onClose={() => setConfiguringCard(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/components/credit-cards/cards-overview.tsx
git commit -m "feat: add cards overview sub-view with summary stats and card grid"
```

---

## Task 13: Receipt Upload Component

**Files:**
- Create: `apps/internal/src/app/(app)/finances/components/credit-cards/receipt-upload.tsx`

- [ ] **Step 1: Create the receipt upload component**

```typescript
"use client";

import { useState, useRef } from "react";
import { Upload, FileText, X, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadCardReceipt } from "@/app/actions";
import { toast } from "sonner";
import type { CardReceiptSlim } from "../../finances-client";

interface ReceiptUploadProps {
  mercuryTransactionId: string;
  creditCardId: string;
  existingReceipt: CardReceiptSlim | null;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function ReceiptUpload({
  mercuryTransactionId,
  creditCardId,
  existingReceipt,
}: ReceiptUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPG, and PDF files are accepted");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const path = `receipts/${mercuryTransactionId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("card-receipts")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("card-receipts")
        .getPublicUrl(path);

      await uploadCardReceipt({
        mercuryTransactionId,
        creditCardId,
        fileUrl: urlData.publicUrl,
      });

      toast.success("Receipt uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (existingReceipt) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={existingReceipt.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md bg-[#f5f5f5] px-2 py-1 text-[11px] text-[#555] hover:bg-[#e8e8e8]"
        >
          <FileText size={12} />
          View Receipt
          <Download size={10} />
        </a>
        <button
          onClick={() => fileRef.current?.click()}
          className="text-[11px] text-[#999] hover:text-[#555]"
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Replace"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf"
          onChange={handleUpload}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1 rounded-md border border-dashed border-[#d0d0d0] px-2 py-1 text-[11px] text-[#888] hover:border-[#999] hover:text-[#555] disabled:opacity-50"
      >
        <Upload size={12} />
        {uploading ? "Uploading..." : "Upload Receipt"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg,.pdf"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/components/credit-cards/receipt-upload.tsx
git commit -m "feat: add receipt upload component with Supabase Storage"
```

---

## Task 14: Card Transactions Sub-view

**Files:**
- Create: `apps/internal/src/app/(app)/finances/components/credit-cards/card-transactions.tsx`

- [ ] **Step 1: Create the transactions sub-view**

```typescript
"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  Flag,
  RefreshCw,
  Filter,
} from "lucide-react";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardReceiptSlim,
  CardAlertSlim,
} from "../../finances-client";
import { ReceiptUpload } from "./receipt-upload";
import {
  detectRecurringCharges,
  type RecurringCharge,
} from "@/lib/recurring-detection";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CardTransactionsProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardReceipts: CardReceiptSlim[];
  cardAlerts: CardAlertSlim[];
  bankTransactions: BankTransaction[];
}

export function CardTransactions({
  mercuryCards,
  cardEnrichment,
  cardReceipts,
  cardAlerts,
  bankTransactions,
}: CardTransactionsProps) {
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [showRecurring, setShowRecurring] = useState(true);
  const [filterCard, setFilterCard] = useState<string>("all");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Filter to card-related transactions
  const cardTransactions = useMemo(
    () =>
      bankTransactions.filter((t) =>
        t.kind.toLowerCase().includes("card")
      ),
    [bankTransactions]
  );

  // Apply user filters
  const filteredTransactions = useMemo(() => {
    let result = cardTransactions;

    if (filterDateStart) {
      result = result.filter(
        (t) => t.createdAt.split("T")[0] >= filterDateStart
      );
    }
    if (filterDateEnd) {
      result = result.filter(
        (t) => t.createdAt.split("T")[0] <= filterDateEnd
      );
    }
    if (filterAmountMin) {
      result = result.filter(
        (t) => Math.abs(t.amount) >= Number(filterAmountMin)
      );
    }
    if (filterAmountMax) {
      result = result.filter(
        (t) => Math.abs(t.amount) <= Number(filterAmountMax)
      );
    }

    return result;
  }, [cardTransactions, filterDateStart, filterDateEnd, filterAmountMin, filterAmountMax]);

  // Recurring charge detection
  const recurringCharges = useMemo(
    () => detectRecurringCharges(cardTransactions),
    [cardTransactions]
  );
  const totalMonthlyRecurring = recurringCharges.reduce(
    (sum, r) => sum + r.totalMonthlyEstimate,
    0
  );

  // Average transaction amount for unusual spend detection
  const avgTxnAmount = useMemo(() => {
    if (cardTransactions.length === 0) return 0;
    return (
      cardTransactions.reduce((s, t) => s + Math.abs(t.amount), 0) /
      cardTransactions.length
    );
  }, [cardTransactions]);

  function getReceipt(txnId: string): CardReceiptSlim | null {
    return cardReceipts.find((r) => r.mercuryTransactionId === txnId) ?? null;
  }

  // Get a credit card ID for receipt uploads (use first enrichment as fallback)
  function getCreditCardId(): string {
    return cardEnrichment[0]?.id ?? "";
  }

  function isUnusualSpend(amount: number): boolean {
    return avgTxnAmount > 0 && Math.abs(amount) > avgTxnAmount * 2;
  }

  return (
    <div>
      {/* Recurring charges section */}
      {recurringCharges.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#e0e0e0] bg-white">
          <button
            onClick={() => setShowRecurring(!showRecurring)}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-[#888]" />
              <span className="text-[13px] font-medium">
                Recurring Charges
              </span>
              <span className="rounded-full bg-[#f0f0f0] px-2 py-0.5 text-[11px] text-[#555]">
                {recurringCharges.length} detected
              </span>
              <span className="text-[12px] text-[#888]">
                ~${totalMonthlyRecurring.toFixed(2)}/mo
              </span>
            </div>
            {showRecurring ? (
              <ChevronUp size={14} className="text-[#888]" />
            ) : (
              <ChevronDown size={14} className="text-[#888]" />
            )}
          </button>
          {showRecurring && (
            <div className="border-t border-[#e0e0e0] px-4 py-2">
              <div className="grid gap-1">
                {recurringCharges.map((rc) => (
                  <div
                    key={rc.counterpartyName}
                    className="flex items-center justify-between py-1.5 text-[12px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#333]">
                        {rc.counterpartyName}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                          rc.confidence === "high"
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {rc.confidence}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[#888]">
                      <span>${rc.averageAmount.toFixed(2)}</span>
                      <span className="capitalize">{rc.frequency}</span>
                      <span>Next: {rc.nextExpectedDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
            showFilters
              ? "border-[#111] bg-[#111] text-white"
              : "border-[#e0e0e0] text-[#555] hover:bg-[#f5f5f5]"
          }`}
        >
          <Filter size={12} />
          Filters
        </button>
        <span className="text-[12px] text-[#999]">
          {filteredTransactions.length} transactions
        </span>
      </div>

      {showFilters && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[#e0e0e0] bg-[#fafafa] p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">From</span>
            <input
              type="date"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">To</span>
            <input
              type="date"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">Min $</span>
            <input
              type="number"
              value={filterAmountMin}
              onChange={(e) => setFilterAmountMin(e.target.value)}
              placeholder="0"
              className="w-24 rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">Max $</span>
            <input
              type="number"
              value={filterAmountMax}
              onChange={(e) => setFilterAmountMax(e.target.value)}
              placeholder="∞"
              className="w-24 rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px]"
            />
          </label>
          <button
            onClick={() => {
              setFilterDateStart("");
              setFilterDateEnd("");
              setFilterAmountMin("");
              setFilterAmountMax("");
            }}
            className="text-[11px] text-[#999] hover:text-[#555]"
          >
            Clear
          </button>
        </div>
      )}

      {/* Transaction table */}
      <div className="overflow-x-auto rounded-xl border border-[#e0e0e0] bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#e0e0e0] text-left text-[11px] font-medium uppercase text-[#999]">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Counterparty</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Receipt</th>
              <th className="px-4 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[13px] text-[#999]"
                >
                  No card transactions found.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((txn) => {
                const receipt = getReceipt(txn.id);
                const unusual = isUnusualSpend(txn.amount);
                const isExpanded = expandedTxn === txn.id;

                return (
                  <tr key={txn.id} className="group">
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5 text-[#555]">
                      {new Date(txn.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-[#333]">
                          {txn.counterpartyName}
                        </span>
                        {unusual && (
                          <Flag
                            size={12}
                            className="text-amber-500"
                            title="Unusual spend (>2x average)"
                          />
                        )}
                      </div>
                      {isExpanded && txn.note && (
                        <p className="mt-1 text-[11px] text-[#999]">
                          {txn.note}
                        </p>
                      )}
                      {isExpanded && (
                        <div className="mt-2">
                          <ReceiptUpload
                            mercuryTransactionId={txn.id}
                            creditCardId={getCreditCardId()}
                            existingReceipt={receipt}
                          />
                        </div>
                      )}
                    </td>
                    <td
                      className={`border-b border-[#f0f0f0] px-4 py-2.5 text-right font-medium ${
                        txn.amount < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {txn.amount < 0 ? "-" : "+"}$
                      {Math.abs(txn.amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          txn.status === "sent"
                            ? "bg-green-50 text-green-700"
                            : txn.status === "pending"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {txn.status}
                      </span>
                    </td>
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5">
                      {receipt && !isExpanded && (
                        <span className="text-[11px] text-green-600">
                          ✓
                        </span>
                      )}
                    </td>
                    <td className="border-b border-[#f0f0f0] px-4 py-2.5">
                      <button
                        onClick={() =>
                          setExpandedTxn(isExpanded ? null : txn.id)
                        }
                        className="rounded-md p-1 text-[#ccc] hover:bg-[#f5f5f5] hover:text-[#888]"
                      >
                        {isExpanded ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/components/credit-cards/card-transactions.tsx
git commit -m "feat: add card transactions sub-view with filters, recurring detection, receipts"
```

---

## Task 15: Card Budgets Sub-view

**Files:**
- Create: `apps/internal/src/app/(app)/finances/components/credit-cards/card-budgets.tsx`

- [ ] **Step 1: Create the budgets sub-view**

```typescript
"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, AlertTriangle } from "lucide-react";
import {
  createCardBudget,
  updateCardBudget,
  deleteCardBudget,
} from "@/app/actions";
import { toast } from "sonner";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardBudgetSlim,
  CardAlertSlim,
} from "../../finances-client";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CardBudgetsProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardBudgets: CardBudgetSlim[];
  cardAlerts: CardAlertSlim[];
  bankTransactions: BankTransaction[];
}

const BUDGET_CATEGORIES = [
  "Software",
  "Hosting",
  "Marketing",
  "Office",
  "Travel",
  "Contractors",
  "Subscriptions",
  "Equipment",
  "Meals",
  "Misc",
];

export function CardBudgets({
  mercuryCards,
  cardEnrichment,
  cardBudgets,
  cardAlerts,
  bankTransactions,
}: CardBudgetsProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<CardBudgetSlim | null>(
    null
  );
  const [selectedCardId, setSelectedCardId] = useState<string>(
    cardEnrichment[0]?.id ?? ""
  );
  const [category, setCategory] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [saving, setSaving] = useState(false);

  // Current month card transactions (spending only)
  const currentMonthSpend = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return bankTransactions.filter(
      (t) =>
        t.kind.toLowerCase().includes("card") &&
        t.amount < 0 &&
        new Date(t.createdAt) >= monthStart
    );
  }, [bankTransactions]);

  // Group spend by rough category (using counterparty name as proxy)
  // In practice, Mercury doesn't provide merchant category — this is a best-effort mapping
  const totalSpendThisMonth = currentMonthSpend.reduce(
    (s, t) => s + Math.abs(t.amount),
    0
  );

  // Budgets for selected card
  const budgetsForCard = cardBudgets.filter(
    (b) => b.creditCardId === selectedCardId
  );

  async function handleSave() {
    if (!selectedCardId || !category || !monthlyLimit) {
      toast.error("Fill in all fields");
      return;
    }
    setSaving(true);
    try {
      if (editingBudget) {
        await updateCardBudget(editingBudget.id, {
          category,
          monthlyLimit: Number(monthlyLimit),
        });
        toast.success("Budget updated");
      } else {
        await createCardBudget({
          creditCardId: selectedCardId,
          category,
          monthlyLimit: Number(monthlyLimit),
        });
        toast.success("Budget created");
      }
      closeModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(budgetId: string) {
    try {
      await deleteCardBudget(budgetId);
      toast.success("Budget deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  function openEdit(budget: CardBudgetSlim) {
    setEditingBudget(budget);
    setSelectedCardId(budget.creditCardId);
    setCategory(budget.category);
    setMonthlyLimit(budget.monthlyLimit.toString());
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingBudget(null);
    setCategory("");
    setMonthlyLimit("");
  }

  // Distribute total spend evenly across budgets as approximation
  const spendPerBudget =
    budgetsForCard.length > 0
      ? totalSpendThisMonth / budgetsForCard.length
      : 0;

  return (
    <div>
      {/* Card selector + add button */}
      <div className="mb-4 flex items-center justify-between">
        <select
          value={selectedCardId}
          onChange={(e) => setSelectedCardId(e.target.value)}
          className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[13px] outline-none"
        >
          {cardEnrichment.length === 0 ? (
            <option value="">No configured cards</option>
          ) : (
            cardEnrichment.map((e) => {
              const mc = mercuryCards.find((c) => c.cardId === e.mercuryCardId);
              return (
                <option key={e.id} value={e.id}>
                  {e.cardNickname ?? mc?.nameOnCard ?? `•••• ${mc?.lastFourDigits ?? "?"}`}
                </option>
              );
            })
          )}
        </select>
        <button
          onClick={() => setShowModal(true)}
          disabled={!selectedCardId}
          className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-50"
        >
          <Plus size={14} />
          Add Budget
        </button>
      </div>

      {/* Budget list */}
      {budgetsForCard.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d0d0d0] py-16 text-center">
          <p className="text-[13px] text-[#888]">
            No budgets set for this card.
          </p>
          <p className="mt-1 text-[12px] text-[#bbb]">
            Add category budgets to track spending limits.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {budgetsForCard.map((budget) => {
            const spent = spendPerBudget;
            const pct =
              budget.monthlyLimit > 0
                ? (spent / budget.monthlyLimit) * 100
                : 0;
            const overBudget = pct >= 100;
            const nearBudget = pct >= 80;

            return (
              <div
                key={budget.id}
                className="rounded-xl border border-[#e0e0e0] bg-white p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#333]">
                      {budget.category}
                    </span>
                    {(overBudget || nearBudget) && (
                      <AlertTriangle
                        size={13}
                        className={
                          overBudget ? "text-red-500" : "text-amber-500"
                        }
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(budget)}
                      className="rounded-md p-1 text-[#ccc] hover:bg-[#f5f5f5] hover:text-[#888]"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(budget.id)}
                      className="rounded-md p-1 text-[#ccc] hover:bg-[#f5f5f5] hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-[#888]">
                  <span>
                    ~${spent.toFixed(2)} / ${budget.monthlyLimit.toLocaleString()}
                  </span>
                  <span
                    className={`font-medium ${
                      overBudget
                        ? "text-red-600"
                        : nearBudget
                          ? "text-amber-600"
                          : "text-[#555]"
                    }`}
                  >
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0f0]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      overBudget
                        ? "bg-red-400"
                        : nearBudget
                          ? "bg-amber-400"
                          : "bg-[#111]"
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Budget Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">
                {editingBudget ? "Edit Budget" : "Add Budget"}
              </h3>
              <button
                onClick={closeModal}
                className="rounded-md p-1 text-[#888] hover:bg-[#f0f0f0]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[#555]">
                  Category
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
                >
                  <option value="">Select category</option>
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[#555]">
                  Monthly Limit ($)
                </span>
                <input
                  type="number"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  placeholder="e.g. 5000"
                  min="0"
                  step="100"
                  className="rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#111]"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-lg border border-[#e0e0e0] px-4 py-1.5 text-[13px] font-medium text-[#555] hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[#111] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-50"
              >
                {saving ? "Saving..." : editingBudget ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/components/credit-cards/card-budgets.tsx
git commit -m "feat: add card budgets sub-view with CRUD and progress bars"
```

---

## Task 16: Card Reports Sub-view

**Files:**
- Create: `apps/internal/src/app/(app)/finances/components/credit-cards/card-reports.tsx`

- [ ] **Step 1: Create the reports sub-view**

```typescript
"use client";

import { useMemo, useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type {
  MercuryCardSlim,
  CardEnrichment,
  CardBudgetSlim,
  CardReceiptSlim,
} from "../../finances-client";

interface BankTransaction {
  id: string;
  amount: number;
  counterpartyName: string;
  note: string | null;
  createdAt: string;
  status: string;
  kind: string;
}

interface CardReportsProps {
  mercuryCards: MercuryCardSlim[];
  cardEnrichment: CardEnrichment[];
  cardBudgets: CardBudgetSlim[];
  cardReceipts: CardReceiptSlim[];
  bankTransactions: BankTransaction[];
}

const CHART_COLORS = [
  "#111111",
  "#555555",
  "#888888",
  "#aaaaaa",
  "#cccccc",
  "#e0e0e0",
];

export function CardReports({
  mercuryCards,
  cardEnrichment,
  cardBudgets,
  cardReceipts,
  bankTransactions,
}: CardReportsProps) {
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");

  const cardTransactions = useMemo(
    () =>
      bankTransactions.filter(
        (t) => t.kind.toLowerCase().includes("card") && t.amount < 0
      ),
    [bankTransactions]
  );

  // Monthly spending data (last 6 months)
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    for (const txn of cardTransactions) {
      const d = new Date(txn.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[key] = (months[key] ?? 0) + Math.abs(txn.amount);
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, amount]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        amount: Math.round(amount * 100) / 100,
      }));
  }, [cardTransactions]);

  // Top counterparties (pie chart data)
  const topCounterparties = useMemo(() => {
    const map = new Map<string, number>();
    for (const txn of cardTransactions) {
      const name = txn.counterpartyName;
      map.set(name, (map.get(name) ?? 0) + Math.abs(txn.amount));
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, amount]) => ({ name, value: Math.round(amount * 100) / 100 }));
  }, [cardTransactions]);

  // Rewards tracker
  const rewardsData = useMemo(() => {
    return cardEnrichment
      .filter((e) => e.rewardRate && e.rewardRate > 0)
      .map((e) => {
        const mc = mercuryCards.find((c) => c.cardId === e.mercuryCardId);
        // Estimate: distribute total spend across cards with rewards
        const cardShare =
          cardTransactions.length > 0
            ? cardTransactions.reduce((s, t) => s + Math.abs(t.amount), 0) /
              cardEnrichment.length
            : 0;
        const earned = cardShare * ((e.rewardRate ?? 0) / 100);
        return {
          name: e.cardNickname ?? mc?.nameOnCard ?? `•••• ${mc?.lastFourDigits}`,
          rate: e.rewardRate ?? 0,
          estimated: Math.round(earned * 100) / 100,
        };
      });
  }, [cardEnrichment, mercuryCards, cardTransactions]);

  const totalRewards = rewardsData.reduce((s, r) => s + r.estimated, 0);

  // Per-employee spending
  const employeeSpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of cardEnrichment) {
      if (!e.assignedEmployee) continue;
      // Approximate: distribute total card spend across employees
      const share =
        cardTransactions.reduce((s, t) => s + Math.abs(t.amount), 0) /
        cardEnrichment.filter((x) => x.assignedEmployee).length;
      map.set(
        e.assignedEmployee,
        (map.get(e.assignedEmployee) ?? 0) + share
      );
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount * 100) / 100,
      }));
  }, [cardEnrichment, cardTransactions]);

  // Export CSV
  function handleExport() {
    let txns = cardTransactions;
    if (exportStart) {
      txns = txns.filter((t) => t.createdAt.split("T")[0] >= exportStart);
    }
    if (exportEnd) {
      txns = txns.filter((t) => t.createdAt.split("T")[0] <= exportEnd);
    }

    const header = "Date,Counterparty,Amount,Status,Kind\n";
    const rows = txns
      .map(
        (t) =>
          `${t.createdAt.split("T")[0]},"${t.counterpartyName}",${t.amount},${t.status},${t.kind}`
      )
      .join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-transactions-${exportStart || "all"}-to-${exportEnd || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6">
      {/* Monthly Spending Chart */}
      <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
        <h3 className="mb-3 text-[13px] font-semibold text-[#333]">
          Monthly Card Spending
        </h3>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#888" }}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#888" }}
                axisLine={false}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
              />
              <Tooltip
                formatter={(value: number) => [
                  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                  "Spend",
                ]}
              />
              <Bar dataKey="amount" fill="#111" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-[13px] text-[#999]">
            No transaction data yet.
          </p>
        )}
      </div>

      {/* Top Spending + Rewards side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top counterparties */}
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-[#333]">
            Top Spending By Vendor
          </h3>
          {topCounterparties.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={topCounterparties}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name.slice(0, 12)}${name.length > 12 ? "..." : ""} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {topCounterparties.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [
                    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-[13px] text-[#999]">
              No data yet.
            </p>
          )}
        </div>

        {/* Rewards tracker */}
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#333]">
            <TrendingUp size={14} />
            Rewards Tracker
          </h3>
          {rewardsData.length > 0 ? (
            <div>
              <div className="mb-3 grid gap-2">
                {rewardsData.map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span className="text-[#555]">{r.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[#aaa]">{r.rate}%</span>
                      <span className="font-medium text-[#333]">
                        ${r.estimated.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#f0f0f0] pt-2 text-right text-[13px] font-semibold text-[#111]">
                Total: ${totalRewards.toFixed(2)}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] text-[#999]">
              Configure reward rates on your cards to track cashback.
            </p>
          )}
        </div>
      </div>

      {/* Per-employee spending */}
      {employeeSpend.length > 0 && (
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-[#333]">
            Spending By Employee
          </h3>
          <div className="grid gap-2">
            {employeeSpend.map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between rounded-lg bg-[#fafafa] px-3 py-2 text-[12px]"
              >
                <span className="font-medium text-[#333]">{e.name}</span>
                <span className="text-[#555]">
                  ${e.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export */}
      <div className="rounded-xl border border-[#e0e0e0] bg-white p-4">
        <h3 className="mb-3 text-[13px] font-semibold text-[#333]">
          Export Transactions
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">From</span>
            <input
              type="date"
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1.5 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#888]">To</span>
            <input
              type="date"
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1.5 text-[12px]"
            />
          </label>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg bg-[#111] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#333]"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/internal/src/app/\(app\)/finances/components/credit-cards/card-reports.tsx
git commit -m "feat: add card reports sub-view with charts, rewards, employee spend, export"
```

---

## Task 17: Verify Build & Integration Test

- [ ] **Step 1: Run the dev build to verify no type errors**

```bash
cd /Users/narvisbot/strvx
pnpm --filter internal build
```

Expected: Build completes without TypeScript errors.

- [ ] **Step 2: Fix any type errors found**

Address any missing imports, type mismatches, or build failures.

- [ ] **Step 3: Start dev server and verify tab renders**

```bash
cd /Users/narvisbot/strvx
pnpm --filter internal dev
```

Navigate to `http://localhost:3000/finances` and verify:
- "Credit Cards" tab appears in the tab bar
- Clicking it shows the sub-view toggle (overview, transactions, budgets, reports)
- If Mercury is configured, cards load in the overview
- If Mercury is not configured, the "Mercury not connected" message appears

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve any build issues with credit cards tab integration"
```

(Skip this commit if no fixes were needed.)
