# CODE REVIEW REPORT -- Pass 2

- Verdict: **NEEDS REVISION**
- Blockers: 1 | High: 4 | Medium: 6 | Low: 3

---

## Status of First-Pass Fixes (commit 6b837f4)

| First-Pass Issue | Fix Status | Notes |
|---|---|---|
| B1. XSS in invoice email | **Partial** -- regression below (H1) | `escapeHtml()` applied to 5 of 8 user-controlled interpolations. `stripePaymentUrl`, `issuedDate`, `dueDate` still unescaped. |
| B2. Portal project expiry check | **Fixed** | Correctly selects `expiresAt` and compares against `new Date()`. |
| H2. Lazy Anthropic/Resend init | **Fixed** | Both `ai-proposals.ts` and `ai-sentiment.ts` use `getAnthropic()`. `invoice-email.ts` uses `getResend()`. All guard on missing env vars. |
| H4. UUID validation on time entries | **Fixed** | `createTimeEntry` and `deleteTimeEntry` both validate with `uuidSchema.safeParse()` and use `parsedId.data` in queries. |

---

## Blockers

### B1. Middleware blocks all portal access for unauthenticated clients
**File:** `apps/internal/src/lib/supabase/middleware.ts:40-49`

The Supabase middleware redirects any unauthenticated request to `/login` unless the path starts with `/login`, `/auth`, `/api/auth`, or `/api/webhooks`. The portal paths (`/portal`, `/portal/login`, `/portal/projects/*`, `/api/portal/auth`) are NOT exempted. Portal clients (who authenticate via a simple token cookie, not Supabase Auth) will be redirected to the internal login page on every request.

This means the entire client portal is inaccessible in production. The portal works in development only because `middleware.ts:6` has a `BYPASS_AUTH` escape hatch.

**Fix:** Add portal path exemptions to the middleware:
```ts
if (
  !user &&
  !request.nextUrl.pathname.startsWith("/login") &&
  !request.nextUrl.pathname.startsWith("/auth") &&
  !request.nextUrl.pathname.startsWith("/api/auth") &&
  !request.nextUrl.pathname.startsWith("/api/webhooks") &&
  !request.nextUrl.pathname.startsWith("/portal") &&       // <-- add
  !request.nextUrl.pathname.startsWith("/api/portal")       // <-- add
) {
```
This is NOT a regression from the fixes -- it was present before -- but the first-pass review missed it.

---

## High Priority

### H1. Incomplete XSS escaping in invoice email (partial fix regression)
**File:** `apps/internal/src/lib/invoice-email.ts:52,82-83`

The first-pass fix correctly applied `escapeHtml()` to `clientName`, `clientEmail`, `invoiceNumber`, `item.description`, and `notes`. However, three fields remain unescaped:

- **Line 52:** `data.stripePaymentUrl` is injected directly into an `href` attribute: `<a href="${data.stripePaymentUrl}"`. A malicious URL like `javascript:alert(1)` or a URL containing `"` would break out of the attribute. While the URL comes from Stripe's API (trusted source), defensive escaping is still warranted since the data ultimately flows from the DB.
- **Lines 82-83:** `data.issuedDate` and `data.dueDate` are interpolated without escaping. These come from the invoice record. Lower risk since they're typically ISO date strings, but the escaping should be consistent.

**Fix:** Apply `escapeHtml()` to `data.issuedDate` and `data.dueDate`. For `stripePaymentUrl`, use URL validation or at minimum `escapeHtml()` on the href value:
```ts
const safePaymentUrl = data.stripePaymentUrl ? escapeHtml(data.stripePaymentUrl) : "";
```

### H2. `updateProspect` uses raw input instead of validated data
**File:** `apps/internal/src/app/actions.ts:1439-1454`

The function validates input via `updateProspectSchema.safeParse(data)` at line 1434, but then constructs the SET clause using `data` (raw input) at lines 1442-1451 instead of `parsed.data`. It also uses `prospectId` (raw) at line 1454 instead of `parsedId.data`.

Since the Zod schema performs string trimming and coercion, the raw values may differ from the validated ones. For example, if the schema trims whitespace, using `data.firstName` instead of `parsed.data.firstName` bypasses that sanitization.

**Fix:** Replace all `data.*` references with `parsed.data.*` and `prospectId` with `parsedId.data` in the `.where()` clause:
```ts
const [updated] = await db
  .update(prospects)
  .set({
    firstName: parsed.data.firstName ?? undefined,
    // ... etc
  })
  .where(eq(prospects.id, parsedId.data))
```

### H3. Missing UUID validation on invoice mutation actions
**File:** `apps/internal/src/app/actions.ts:865,1806,1832`

Three invoice actions accept `invoiceId: string` without UUID validation:
- `sendInvoiceAction` (line 865) -- highest risk, triggers email send + Stripe API call
- `voidInvoiceAction` (line 1806) -- triggers Stripe void
- `markInvoicePaidAction` (line 1832) -- updates payment status

Additionally, `toggleUserStatus` (line 1850) and `createPortalToken` (line 951, `companyId` param) lack UUID validation.

While Drizzle parameterizes the values (no SQL injection), passing arbitrary strings to UUID columns will cause Postgres type-cast errors that bubble up as unhandled 500s instead of clean 400s.

**Fix:** Add `uuidSchema.safeParse()` at the top of each function, consistent with the pattern used in all other actions.

### H4. `updateTask` assignee replacement is not in a transaction
**File:** `apps/internal/src/app/actions.ts:779-806`

The delete-and-reinsert pattern for task assignees (lines 780-788) and the subsequent task field update (line 806) are three separate DB operations not wrapped in a transaction. If two concurrent `updateTask` calls race:
1. Both delete existing assignees
2. Both insert their respective assignee lists
3. Result: duplicate or stale assignees

**Fix:** Wrap lines 779-806 in `db.transaction(async (tx) => { ... })`, using `tx` for all three operations.

---

## Medium Priority

### M1. Portal project detail page exposes all project columns
**File:** `apps/internal/src/app/(portal)/portal/projects/[id]/page.tsx:41`

The query uses `.select()` (select all) instead of explicit column selection. This exposes internal-only fields to the portal rendering context:
- `team` (array of team member names)
- `engagementId` (internal engagement UUID)
- `createdAt`

While these fields are not explicitly rendered in the JSX, they are available in the `project` object. If a future developer adds `{JSON.stringify(project)}` for debugging or passes the full object to a client component, internal data leaks.

**Fix:** Use explicit `.select({ id: projects.id, name: projects.name, status: projects.status, description: projects.description, startDate: projects.startDate, endDate: projects.endDate })`.

### M2. Portal tokens are created without an expiry
**File:** `apps/internal/src/app/actions.ts:958-965`

`createPortalToken` inserts into `portal_tokens` without setting `expiresAt`. The column is nullable, and the expiry check at login/page level uses `if (portalToken.expiresAt && ...)` -- meaning a null expiry effectively grants permanent access. Combined with the 30-day cookie, a portal token created today will work indefinitely unless manually deleted.

**Fix:** Set a default expiry (e.g., 90 days):
```ts
.values({
  companyId,
  contactEmail,
  token,
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
})
```

### M3. No rate limiting on AI endpoints
**Files:** `apps/internal/src/app/api/ai/proposal/route.ts`, `apps/internal/src/app/api/ai/sentiment/route.ts`, `apps/internal/src/app/api/ai/predict/route.ts`

These endpoints call the Anthropic API (which costs money per request) with no rate limiting. An authenticated user (or a stolen session) could spam these endpoints to rack up API costs. The predict endpoint additionally runs a complex CTE query on every call.

**Fix:** Add per-user rate limiting. A simple approach for Next.js:
```ts
// In-memory rate limiter (sufficient for single-instance internal tool)
const rateLimiter = new Map<string, number[]>();
function checkRateLimit(userId: string, windowMs = 60000, maxRequests = 5): boolean {
  const now = Date.now();
  const timestamps = (rateLimiter.get(userId) ?? []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  rateLimiter.set(userId, timestamps);
  return true;
}
```

### M4. `deleteEngagement` orphan cleanup is not in a transaction
**File:** `apps/internal/src/app/actions.ts:484-512`

The engagement deletion and subsequent orphan cleanup (checking whether the company/contact is still referenced) runs as separate queries without a transaction. A concurrent `createEngagement` for the same company could race with the orphan check, causing the company to be deleted right after the new engagement was linked to it.

Low probability for an internal tool, but the fix is straightforward: wrap lines 484-512 in `db.transaction()`.

### M5. `global-error.tsx` leaks raw error messages
**File:** `apps/internal/src/app/global-error.tsx:17`

The `(app)/error.tsx` correctly filters error messages containing SQL keywords, but `global-error.tsx` renders `error.message` without any filtering. If a database error or internal error reaches the global boundary, the raw message (potentially containing table names, column names, or Postgres error details) is shown to the user.

**Fix:** Apply the same filtering logic from `(app)/error.tsx`:
```ts
{error.message &&
  !error.message.includes("select ") &&
  !error.message.includes("insert ") &&
  error.message.length < 200
    ? error.message
    : "An unexpected error occurred."}
```

### M6. Unused imports in portal project detail page
**File:** `apps/internal/src/app/(portal)/portal/projects/[id]/page.tsx:6`

`taskAssignees` and `users` are imported from `@/lib/db/schema` but never used. These were likely leftover from an earlier version that queried assignees. Tree-shaking handles it at build time, but dead imports add noise and could mislead future developers.

**Fix:** Remove `taskAssignees` and `users` from the import.

---

## Low Priority

### L1. AI API routes do not validate `engagementId` as UUID
**Files:** `apps/internal/src/app/api/ai/proposal/route.ts:22`, `apps/internal/src/app/api/ai/sentiment/route.ts:19`, `apps/internal/src/app/api/ai/predict/route.ts:15`

All three routes accept `engagementId` from `req.json()` without UUID validation. The `getEngagement()` query will fail gracefully (returns null, then 404), but passing arbitrary strings to a UUID column causes a Postgres type-cast error that returns a 500 instead of a 400.

**Fix:** Add UUID validation after parsing the request body.

### L2. Gmail sync deduplication is fragile
**File:** `apps/internal/src/lib/gmail.ts:134-157`

Deduplication relies on exact string matching of the constructed content (`[Email] ${subject}: ${snippet}`). If the snippet changes between syncs (e.g., Gmail modifies it), duplicates will be created. A more robust approach would be to store the Gmail message ID and check against that.

### L3. Mercury `accountId` in URL path is not validated
**File:** `apps/internal/src/lib/mercury.ts:79`

`accountId` is interpolated into the URL path without validation. Since the ID comes from a prior `getMercuryAccounts()` call (trusted), this is low risk, but URL-encoding the value would be defensive:
```ts
const url = `${MERCURY_BASE}/account/${encodeURIComponent(accountId)}/transactions?${params}`;
```

---

## Good Practices (maintained from first pass)

- All first-pass fixes compile cleanly: `tsc --noEmit` passes with zero errors.
- `next build` passes successfully with all 48 routes compiling.
- The lazy initialization pattern for Anthropic and Resend is clean and consistent.
- The `escapeHtml()` function correctly handles all five HTML special characters in the proper order (& first).
- Portal expiry check fix is correct and matches the pattern on the main portal page.
- UUID validation on time entries uses `parsedId.data` in both the INSERT and the `revalidatePath` call, which is correct.
- Calendly webhook uses timing-safe signature verification.
- Stripe webhook uses `constructEvent` for signature verification.
- All raw SQL uses Drizzle's `sql` tagged template (parameterized).
- Portal data is correctly scoped by company in all queries.
