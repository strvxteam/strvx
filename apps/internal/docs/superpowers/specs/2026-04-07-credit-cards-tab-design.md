# Credit Cards Tab — Design Spec

**Date:** 2026-04-07
**Location:** `/finances` page, new tab alongside overview | revenue | expenses
**Approach:** Hybrid — Mercury API (live card roster + transactions) + Supabase (local enrichment)

---

## 1. Data Architecture

### From Mercury API (live)

**Cards endpoint** (`GET /account/{accountId}/cards`):
- `cardId`, `nameOnCard`, `lastFourDigits`, `network` (visa/mastercard), `status` (active/frozen/cancelled/inactive/expired/suspended), `physicalCardStatus`, `createdAt`

**Transactions endpoint** (existing integration):
- Full transaction list, filtered locally for card-related `kind` values (`debitCardTransaction`, `creditCardTransaction`)

### New Supabase Tables

**`credit_cards`** — local enrichment linked to Mercury card IDs

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid (PK) | Local ID |
| `mercury_card_id` | text (unique) | Links to Mercury API card |
| `card_nickname` | text | Friendly name (e.g., "Marketing Amex") |
| `assigned_employee` | text | Who carries this card |
| `credit_limit` | numeric | Credit limit |
| `reward_rate` | numeric | Cashback % (e.g., 1.5) |
| `created_at` | timestamptz | Auto |

**`card_budgets`** — category spending limits per card

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid (PK) | |
| `credit_card_id` | uuid (FK) | Links to credit_cards |
| `category` | text | e.g., "Marketing", "Software" |
| `monthly_limit` | numeric | Budget cap |
| `created_at` | timestamptz | |

**`card_receipts`** — receipt uploads per transaction

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid (PK) | |
| `mercury_transaction_id` | text | Links to Mercury txn |
| `credit_card_id` | uuid (FK) | |
| `file_url` | text | Supabase Storage URL |
| `uploaded_at` | timestamptz | |

**`card_alerts`** — alert configuration per card

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid (PK) | |
| `credit_card_id` | uuid (FK) | |
| `alert_type` | text | "limit_threshold", "unusual_spend", "payment_due" |
| `threshold_value` | numeric | e.g., 80 (for 80% of limit) |
| `enabled` | boolean | |

---

## 2. Mercury API Integration

### New functions in `mercury.ts`

- **`getMercuryCards(accountId)`** — calls `GET /account/{accountId}/cards`, returns card roster
- **`getAllMercuryCards()`** — iterates all accounts, aggregates cards across accounts
- **`getMercuryCardTransactions(accountId, options)`** — reuses existing `getMercuryTransactions`, adds local filter for card-related transaction `kind` values

### Data merge strategy

- On page load: fetch cards from Mercury API + local enrichment from `credit_cards` table
- If a Mercury card has no local row yet: show with defaults (no nickname, no limit) and prompt to configure
- Transactions fetched from Mercury, matched to cards by transaction `kind`
- Same 5-minute `revalidate` caching as existing integration

> **Implementation note:** The transaction `kind` values for card transactions (e.g., `debitCardTransaction`, `creditCardTransaction`) need verification against live Mercury API responses. Filter logic should be adjusted based on actual enum values returned.

---

## 3. Tab UI & Sub-views

New `"credit-cards"` tab added to the tab bar: `overview | revenue | expenses | credit-cards`

### Secondary navigation — 4 sub-views via pill toggle:

### 3a. Cards Overview (default)
- **Summary stats row:** total credit limit, total balance, overall utilization %, total rewards earned this month
- **Card grid:** each card rendered as a visual card component showing:
  - Last 4 digits, network logo (Visa/MC), cardholder name, nickname
  - Status badge (active/frozen/etc.)
  - Credit limit + current utilization bar
- Cards with no local enrichment show a "Configure" prompt

### 3b. Transactions
- Filterable table of all card transactions from Mercury
- **Columns:** date, card (last 4), counterparty, amount, status, category, receipt indicator
- **Filters:** by card, date range, amount range
- **Row expand:** full details + receipt upload button
- **Recurring charges section** (collapsible, top of view): auto-detected charges with monthly cost total

### 3c. Budgets
- Per-card, per-category budget management
- Visual progress bars: spend vs budget for current month
- CRUD for budgets per card
- Alert indicators when approaching threshold

### 3d. Reports
- **Monthly spending summary** — by card, by category, trend charts
- **Rewards tracker** — cashback earned per card, total YTD
- **Export** — CSV/PDF download for date range
- **Per-employee spending** — grouped view by assigned employee

---

## 4. Recurring Charge Detection

Computed at query time from transaction history — no table needed.

### Algorithm
1. Group transactions by `counterpartyName`
2. Check for similar amounts (within 10% tolerance) on regular intervals (weekly, monthly, quarterly)
3. Minimum 2 occurrences to flag as recurring
4. Score confidence: exact amount + consistent interval = high, similar amount + roughly regular = medium

### Output per recurring charge
- Counterparty name, average amount, frequency, last charged date, next expected date
- Total monthly cost across all detected recurring charges

Displayed as collapsible section at top of Transactions sub-view.

---

## 5. Alerts System

In-app only — no email/SMS. Visual indicators inline with card/transaction display.

| Alert Type | Trigger | Display |
|------------|---------|---------|
| `limit_threshold` | Utilization hits configured % (e.g., 80%) | Warning badge on card + yellow utilization bar |
| `unusual_spend` | Transaction exceeds 2x card's average amount | Flag icon on transaction row |
| `payment_due` | Configurable reminder days before statement close | Banner at top of credit cards tab |

- Evaluated at render time — no background jobs
- Checked when card/transaction data loads against `card_alerts` config
- Triggered alerts render inline (badges, banners, colored bars)

---

## 6. Receipt Uploads

**Storage:** Supabase Storage bucket (`card-receipts`)

### Flow
1. User expands a transaction row
2. "Upload Receipt" button opens file picker
3. File uploads to Supabase Storage, URL saved in `card_receipts`
4. Thumbnail/icon shown on transaction row
5. Click to view/download

### Constraints
- Max file size: 5MB
- Accepted types: PNG, JPG, PDF
- One receipt per transaction (replace on re-upload)

---

## 7. File Structure

```
finances/
├── page.tsx                    (server component — add card data fetching)
├── finances-client.tsx         (add "credit-cards" to TabView, import CreditCardsTab)
├── loading.tsx                 (existing)
└── components/
    └── credit-cards/
        ├── credit-cards-tab.tsx        (main tab — sub-view toggle + routing)
        ├── cards-overview.tsx          (card grid + summary stats)
        ├── card-component.tsx          (individual card visual)
        ├── card-transactions.tsx       (transaction table + recurring charges)
        ├── card-budgets.tsx            (budget management CRUD)
        ├── card-reports.tsx            (charts, rewards, exports, per-employee)
        ├── receipt-upload.tsx          (file upload + display)
        └── configure-card-modal.tsx    (set nickname, limit, employee, reward rate)
```

### Touched existing files
- `mercury.ts` — add `getMercuryCards`, `getAllMercuryCards`
- `finances-client.tsx` — add `"credit-cards"` to `TabView` union, render `<CreditCardsTab />`
- `page.tsx` — fetch card data in server component, pass as props
- Drizzle schema in `packages/db` — add 4 new tables
- `app/actions.ts` — add server actions for CRUD on budgets, alerts, receipts, card config
- `sidebar.tsx` — no change (stays under existing Finances link)
