# CODE REVIEW REPORT -- PASS 3 (FINAL)

- **Verdict: NEEDS REVISION**
- Blockers: 3 | High: 4 | Medium: 6

---

## Automated Checks

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS (zero errors) |
| `npx next build` | PASS (Next.js 16.2.1) |

---

## Blockers

### B1. Zod validation bypass in `updateEngagement` -- raw `data` used instead of `parsed.data`
**File:** `apps/internal/src/app/actions.ts:370-380`

The function validates input with Zod on line 363, but lines 370-378 use the original `data` parameter instead of `parsed.data`. This means Zod's sanitization (trimming, type coercion, defaults) is completely bypassed. Additionally, line 380 uses `engagementId` (raw) instead of `parsedId.data`.

```ts
// Current (BROKEN):
.set({
  name: data.name ?? undefined,       // raw input
  dealValue: data.dealValue ?? undefined,  // raw input
  ...
})
.where(eq(engagements.id, engagementId));  // raw input

// Fix:
.set({
  name: parsed.data.name ?? undefined,
  dealValue: parsed.data.dealValue ?? undefined,
  probability: parsed.data.probability ?? undefined,
  expectedCloseDate: parsed.data.expectedCloseDate ?? undefined,
  maintenanceOptedIn: parsed.data.maintenanceOptedIn ?? undefined,
  maintenanceMonthlyFee: parsed.data.maintenanceMonthlyFee ?? undefined,
  maintenanceNextCheckin: parsed.data.maintenanceNextCheckin ?? undefined,
  tags: parsed.data.tags ?? undefined,
})
.where(eq(engagements.id, parsedId.data));
```

### B2. Missing `invoiceNumber` validation in `saveInvoiceDraft`
**File:** `apps/internal/src/app/actions.ts:1792` + `apps/internal/src/lib/validations.ts:52-64`

The `invoiceDraftSchema` does not include `invoiceNumber` as a field, so the raw `data.invoiceNumber` goes directly to the DB insert without any validation. An attacker could pass an arbitrarily long or malicious string.

**Fix:** Add `invoiceNumber` to the schema and use `parsed.data.invoiceNumber`:
```ts
// In validations.ts, invoiceDraftSchema:
invoiceNumber: z.string().min(1, "Invoice number required").max(50),

// In actions.ts line 1792:
invoiceNumber: parsed.data.invoiceNumber,  // was: data.invoiceNumber
```

### B3. Three server actions missing `getCurrentUser()` authentication
**File:** `apps/internal/src/app/actions.ts:1624, 1628, 1858`

| Function | Line | Issue |
|----------|------|-------|
| `getCompaniesAction` | 1624 | No auth check -- exposes company list to unauthenticated callers |
| `createCompanyAction` | 1628 | No auth check -- allows unauthenticated company creation |
| `toggleUserStatus` | 1858 | No auth check AND no UUID validation on `userId` |

**Fix:** Add `await getCurrentUser();` at the start of each function and add `uuidSchema.safeParse(userId)` to `toggleUserStatus`.

---

## High Priority

### H1. Portal token entropy is low -- 16 hex chars from truncated UUID
**File:** `apps/internal/src/app/actions.ts:960`

```ts
const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
```

This creates a 16 hex-character token (64 bits of entropy). While sufficient against online brute-force, it is below the recommended 128 bits for bearer tokens. The token also has no expiration set by default (`expiresAt` is nullable and not populated here).

**Fix:** Use 32+ hex characters and set a default expiration:
```ts
const token = crypto.randomUUID().replace(/-/g, "").toUpperCase(); // 32 chars = 128 bits
// AND set expiresAt:
expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
```

### H2. No rate limiting on portal auth endpoint
**File:** `apps/internal/src/app/api/portal/auth/route.ts`

The portal auth endpoint accepts unlimited login attempts with no rate limiting or account lockout. Combined with the 64-bit token (B1 notwithstanding), this creates an enumeration risk.

**Fix:** Add rate limiting via a middleware or in-memory counter (e.g., `Map<ip, {count, lastAttempt}>`), or use Vercel's built-in WAF rate limiting if deployed there.

### H3. Unvalidated `source` and `apolloContactId` bypass Zod in `createProspect`
**File:** `apps/internal/src/app/actions.ts:1412-1413`

```ts
source: data.source || "manual",           // raw input, not in schema
apolloContactId: data.apolloContactId || null,  // raw input, not in schema
```

These fields come from `data` (raw) because `createProspectSchema` does not include them. They bypass all validation.

**Fix:** Add `source` and `apolloContactId` to `createProspectSchema`:
```ts
source: z.string().max(100).optional(),
apolloContactId: z.string().max(200).optional(),
```
Then use `parsed.data.source` and `parsed.data.apolloContactId`.

### H4. API routes (`/api/ai/*`) do not validate `engagementId` as UUID
**Files:**
- `apps/internal/src/app/api/ai/predict/route.ts:15`
- `apps/internal/src/app/api/ai/proposal/route.ts:22`
- `apps/internal/src/app/api/ai/sentiment/route.ts:19`

All three routes extract `engagementId` from the request body and pass it directly to `getEngagement()` without UUID validation. A malformed string will cause an unhandled Postgres error ("invalid input syntax for type uuid") that leaks DB error details.

**Fix:** Add UUID validation before calling `getEngagement`:
```ts
import { z } from "zod";
const parsed = z.string().uuid().safeParse(engagementId);
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid engagementId" }, { status: 400 });
}
```

---

## Medium Priority

### M1. `createTimeEntry` allows NaN for `hours`
**File:** `apps/internal/src/app/actions.ts:1077`

```ts
if (data.hours <= 0 || data.hours > 24) throw new Error("Hours must be between 0 and 24");
```

`NaN <= 0` is `false` and `NaN > 24` is `false`, so `NaN` passes this check and is written to the DB as "NaN" in the numeric column, which will cause a Postgres error.

**Fix:**
```ts
if (!Number.isFinite(data.hours) || data.hours <= 0 || data.hours > 24) {
  throw new Error("Hours must be a number between 0 and 24");
}
```

### M2. `updateEngagementSchema` does not validate numeric fields
**File:** `apps/internal/src/lib/validations.ts:149-150,153`

`dealValue`, `probability`, and `maintenanceMonthlyFee` accept any string. A non-numeric string would cause a Postgres error. The `createEngagementSchema` validates `dealValue` with a regex, but the update schema does not.

**Fix:** Add regex validation:
```ts
dealValue: z.string().regex(/^\d*\.?\d*$/, "Invalid deal value").nullable().optional(),
probability: z.string().regex(/^\d{1,3}(\.\d+)?$/, "Invalid probability").nullable().optional(),
maintenanceMonthlyFee: z.string().regex(/^\d*\.?\d*$/, "Invalid fee").nullable().optional(),
```

### M3. `logTouchSchema.direction` accepts any non-empty string
**File:** `apps/internal/src/lib/validations.ts:241`

The `direction` field should be constrained to valid values.

**Fix:**
```ts
direction: z.enum(["inbound", "outbound"]),
```

### M4. `ai-sentiment.ts` trusts Claude's JSON response shape without validation
**File:** `apps/internal/src/lib/ai-sentiment.ts:57`

```ts
return JSON.parse(cleaned) as SentimentResult;
```

If Claude returns valid JSON but with wrong field types (e.g., `score: "high"` instead of a number, or `trend: "going up"` instead of a valid enum value), the code will pass malformed data to the caller with no validation.

**Fix:** Validate with Zod after parsing:
```ts
const sentimentSchema = z.object({
  score: z.number().min(1).max(10),
  trend: z.enum(["improving", "stable", "declining"]),
  summary: z.string(),
  signals: z.array(z.string()),
  recommendation: z.string(),
});
const result = sentimentSchema.safeParse(JSON.parse(cleaned));
if (!result.success) return fallbackResult;
return result.data;
```

### M5. Portal project detail page does not validate `id` param as UUID
**File:** `apps/internal/src/app/(portal)/portal/projects/[id]/page.tsx:39`

```ts
const { id } = await params;
```

The `id` is used directly in a DB query without UUID validation. While Postgres will reject non-UUID strings, the error message may leak internal details.

**Fix:** Add validation:
```ts
const { id } = await params;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(id)) redirect("/portal");
```

### M6. Gmail sync deduplication uses exact string match on content
**File:** `apps/internal/src/lib/gmail.ts:157`

```ts
if (existingSet.has(content)) continue;
```

The dedup key is `[Email] ${subject}: ${snippet}`. If a contact sends two different emails with the same subject and the snippets happen to be identical (unlikely but possible), the second email will be silently dropped. Also, if the same email is forwarded with slightly different snippet truncation, it could create duplicates.

**Suggestion:** Include the Gmail message ID in the content or store it separately as a dedup key:
```ts
const content = `[Email:${email.id}] ${email.subject}: ${email.snippet}`;
```

---

## Good Practices

- **Transaction safety**: Critical multi-table operations (createEngagement, changeStage, updateTask assignees, convertProspect) are properly wrapped in `db.transaction()`.
- **HTML escaping**: Invoice email template uses `escapeHtml()` consistently on all user-supplied values including descriptions, client names, dates, payment URLs, and notes.
- **Cookie security**: Portal cookie sets `httpOnly: true`, `secure` in production, `sameSite: "lax"`, and scopes `path: "/portal"`.
- **Middleware portal exclusion**: The auth middleware correctly excludes `/portal` and `/api/portal` paths so portal users are not forced through Supabase auth.
- **AI fallbacks**: Sentiment analysis has a proper fallback for malformed Claude responses (catch block returns sensible defaults). Proposal generation returns a clear error message if the text block is missing.
- **RESEND_API_KEY guard**: Weekly report route checks for RESEND_API_KEY and returns metrics without sending email if the key is absent.
- **Production auth enforcement**: `getCurrentUser()` throws in production if no auth is configured, with a dev-only fallback that logs a clear warning.
- **Lazy API client initialization**: Both Anthropic and Resend clients use lazy singleton pattern, avoiding module-level side effects.
- **N+1 prevention**: Portal pages use `Promise.all` for parallel queries. No N+1 patterns detected in the modified files.
- **Event listener cleanup**: `useEffect` in StageDropdown properly returns cleanup function for the mousedown listener.
