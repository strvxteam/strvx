# STRVX Internal Dashboard -- Security Audit Report

**Date:** 2026-03-30
**Auditor:** Claude Opus 4.6 (Security Audit Agent)
**Scope:** Full-stack audit of the STRVX internal CRM dashboard
**Stack:** Next.js 16 + React 19 + Drizzle ORM + Supabase (Auth + Postgres) + Vercel

---

## Finding 1

### [CRITICAL] Authentication Middleware Disabled -- Entire Application Unauthenticated

**Location:** `src/middleware.ts:1-13`
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**Description:**
The Supabase auth middleware import is commented out with the note "Auth disabled until Supabase is connected." The middleware function is a passthrough that does nothing -- it immediately returns `NextResponse.next()`. The actual auth logic exists in `src/lib/supabase/middleware.ts` and is fully implemented (checks `supabase.auth.getUser()`, redirects unauthenticated users to `/login`). It is simply never called.

**Impact:**
Every route in the application is accessible without authentication. Any person with the URL can:
- View all client engagements, contacts, deal values, and pipeline data
- Create, modify, and delete engagements, tasks, invoices, expenses, goals
- View internal financial data (invoices, expenses, revenue)
- Access internal documents
- View all prospect/outreach data with emails, phone numbers, LinkedIn URLs

**Proof of Concept:**
Navigate directly to `https://<deployed-url>/dashboard` or `/pipeline` without logging in. Full access is granted.

**Remediation:**
Uncomment the middleware import and call it:

```ts
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}
```

**Verification:** After enabling, navigate to `/dashboard` in an incognito window. You should be redirected to `/login`.

---

## Finding 2

### [CRITICAL] Server Actions Auth Bypass via Dev Fallback

**Location:** `src/app/actions.ts:18-35`
**CWE:** CWE-287 (Improper Authentication)

**Description:**
The `getCurrentUser()` function, which gates all write operations, has a fallback that silently swallows authentication failures and defaults to the first user in the database. The `catch` block catches all errors (including legitimate auth failures), so every unauthenticated request to a server action succeeds and is attributed to `nick@strvx.com`.

**Impact:**
Combined with Finding 1, any anonymous user can invoke all 20+ server actions (create engagements, modify deal values, delete tasks, create invoices, update documents, etc.) and all operations are silently attributed to nick@strvx.com. This also means there is zero audit trail for who actually performed actions.

**Remediation:**
Remove the dev fallback in production. Make auth failure an explicit error:

```ts
async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    throw new Error("Unauthorized");
  }
  const dbUser = await getUserByEmail(user.email);
  if (!dbUser) {
    throw new Error("User not found in database");
  }
  return dbUser;
}
```

If a dev fallback is needed, gate it behind an environment variable:

```ts
if (process.env.NODE_ENV === "development" && process.env.DEV_AUTH_BYPASS === "true") {
  // dev fallback
}
```

---

## Finding 3

### [HIGH] Open Redirect in OAuth Callback

**Location:** `src/app/auth/callback/route.ts:7-14`
**CWE:** CWE-601 (URL Redirection to Untrusted Site)

**Description:**
The auth callback reads a `next` parameter from the URL query string and uses it directly in a redirect without validation:

```ts
const next = searchParams.get("next") ?? "/dashboard";
// ...
return NextResponse.redirect(`${origin}${next}`);
```

There is no validation that `next` starts with `/` and does not contain protocol-relative URLs (e.g., `//evil.com`) or path traversal. An attacker could craft a phishing link like:

```
https://strvx.app/auth/callback?code=VALID_CODE&next=//evil.com/steal-session
```

After successful authentication, the user would be redirected to `https://evil.com/steal-session`.

**Impact:**
Post-authentication phishing. An attacker sends a legitimate-looking login link. After the user authenticates, they are redirected to an attacker-controlled page that could mimic the dashboard and harvest additional credentials or session tokens.

**Remediation:**

```ts
const rawNext = searchParams.get("next") ?? "/dashboard";
// Sanitize: must start with / and not be protocol-relative
const next = rawNext.startsWith("/") && !rawNext.startsWith("//")
  ? rawNext
  : "/dashboard";
```

---

## Finding 4

### [HIGH] Webhook Signature Verification is Optional

**Location:** `src/app/api/webhooks/calendly/route.ts:11-38`
**CWE:** CWE-345 (Insufficient Verification of Data Authenticity)

**Description:**
The Calendly webhook handler only verifies the HMAC signature if `CALENDLY_WEBHOOK_SECRET` is set in the environment. If the secret is not configured (which is the current state -- it is absent from `.env.local`), the entire webhook body is accepted and processed without any authentication.

**Impact:**
Anyone who discovers or guesses the webhook URL (`/api/webhooks/calendly`) can send forged webhook payloads to:
- Create fake companies, contacts, and engagements in the CRM
- Pollute the pipeline with bogus data
- Create fake interaction records (audit trail poisoning)

**Proof of Concept:**
```bash
curl -X POST https://<deployed-url>/api/webhooks/calendly \
  -H "Content-Type: application/json" \
  -d '{"event":"invitee.created","payload":{"name":"Fake Lead","email":"attacker@evil.com","event_type":{"name":"Fake Call"},"event":{"start_time":"2026-04-01T10:00:00Z"}}}'
```

**Remediation:**
Make signature verification mandatory:

```ts
const secret = process.env.CALENDLY_WEBHOOK_SECRET;
if (!secret) {
  console.error("CALENDLY_WEBHOOK_SECRET not configured");
  return NextResponse.json(
    { error: "Webhook not configured" },
    { status: 503 }
  );
}
```

Also, the signature comparison on line 35 uses `!==` (string comparison) instead of `crypto.timingSafeEqual`, making it vulnerable to timing attacks (see Finding 9).

---

## Finding 5

### [HIGH] Webhook Raw SQL with Potential Injection Vector

**Location:** `src/app/api/webhooks/calendly/route.ts:63-67`
**CWE:** CWE-89 (SQL Injection)

**Description:**
The Calendly webhook constructs a raw SQL query for idempotency checking using `db.execute()` with a hand-written query string and a `@ts-expect-error` annotation suggesting the API may not work as expected:

```ts
const existing = await db.execute(
  `SELECT id FROM interactions WHERE content LIKE '%' || $1 || '%' LIMIT 1`,
  // @ts-expect-error - raw SQL with param
  [calendlyEventUri]
);
```

While `$1` parameterization should prevent classic SQL injection, the `LIKE` operator combined with user-controlled input allows **LIKE pattern injection**. The `calendlyEventUri` comes from `payload.uri` in the webhook body (which, per Finding 4, may be forged). If it contains `%` or `_` characters, the query behavior changes. An attacker could send `uri: "%"` to match all interactions, causing the idempotency check to always return true (blocking legitimate webhooks).

Additionally, the `@ts-expect-error` suppression suggests the API for `db.execute` with parameters is not standard for Drizzle ORM's `postgres-js` driver, meaning this may not actually parameterize correctly at runtime.

**Impact:**
- Denial of service: forged webhook with `uri: "%"` causes all future legitimate Calendly events to be incorrectly deduplicated
- If parameterization fails at runtime, full SQL injection

**Remediation:**
Use Drizzle's `sql` tagged template for safe parameterization:

```ts
import { sql } from "drizzle-orm";

const existing = await db.execute(
  sql`SELECT id FROM interactions WHERE content LIKE ${'%' + calendlyEventUri + '%'} LIMIT 1`
);
```

Or better, store `calendlyEventUri` in a dedicated column rather than searching free text with LIKE.

---

## Finding 6

### [HIGH] Database Credential Exposed in .env.local with Direct Password

**Location:** `.env.local:3`
**CWE:** CWE-798 (Use of Hard-coded Credentials)

**Description:**
The `.env.local` file contains the full Postgres connection string with an embedded plaintext password. The connection string uses the `postgres` role through the Supabase pooler, which has full database access and bypasses all Row Level Security (RLS) policies.

**Impact:**
- The `postgres` role bypasses all RLS policies, meaning even if RLS were configured, the application would ignore it
- If this credential leaks (logs, error messages, build artifacts), an attacker gains full read/write/delete access to the entire database

**Remediation:**
1. Verify the file was never committed: `git log --all -- .env.local` (confirmed: it was not committed)
2. Consider rotating the database password since it appears in this audit report
3. For the application, consider using a service role key with limited permissions instead of the postgres superuser
4. The `.env*` glob in `.gitignore` correctly covers this file

---

## Finding 7

### [MEDIUM] No Input Validation or Schema Validation on Server Actions

**Location:** `src/app/actions.ts` (throughout)
**CWE:** CWE-20 (Improper Input Validation)

**Description:**
Server actions accept `FormData` or plain objects but perform only minimal validation (null/empty checks). There is no schema validation library (like Zod) used anywhere. Specific issues:

1. **`createEngagement`** (line 39): `stage` is cast to a union type with `as` without runtime validation. A malicious client can send any string.

2. **`changeStage`** (line 183): `engagementId` is never validated as UUID format. Malformed IDs hit the database directly.

3. **`updateEngagement`** (line 263): Accepts arbitrary `dealValue`, `probability` as strings for `numeric` database columns with no numeric validation.

4. **`createInvoice`** (line 430): `lineItems` is typed as `unknown` and stored directly in a `jsonb` column with no schema validation.

5. **`searchAll`** (line 330): No length limit on the search query. ILIKE with `%` wildcards on unindexed text columns could cause expensive full-table scans.

**Impact:**
- Potential for unexpected database errors that leak schema details
- Excessive data in `jsonb` columns (no size limit on `lineItems`)
- DoS via expensive search queries
- Business logic bypasses (invalid stage values, negative deal values)

**Remediation:**
Add Zod validation to all server actions:

```ts
import { z } from "zod";

const createEngagementSchema = z.object({
  companyName: z.string().min(1).max(200),
  engagementName: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  dealValue: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal("")),
  stage: z.enum(stageEnum.enumValues).default("discovery"),
});

export async function createEngagement(formData: FormData) {
  const parsed = createEngagementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid input: " + parsed.error.issues[0].message);
  }
  // use parsed.data instead of raw formData
}
```

---

## Finding 8

### [MEDIUM] No Authorization Checks -- Any Authenticated User Can Modify Any Resource

**Location:** `src/app/actions.ts` (all mutation functions)
**CWE:** CWE-862 (Missing Authorization)

**Description:**
Once Finding 1 and 2 are fixed and authentication is enforced, there is still no authorization layer. Every server action operates on any resource by ID without verifying that the current user has permission to access or modify it:

- `changeStage(engagementId, newStage)` -- any user can change any engagement's stage
- `toggleAction(actionId)` -- any user can toggle any action
- `updateEngagement(engagementId, data)` -- any user can modify any engagement
- `archiveEngagement(engagementId)` -- any user can archive any engagement
- `deleteTask(taskId)` -- any user can delete any task
- `updateDocument(docId, data)` -- any user can edit any document

**Impact:**
In a multi-user deployment, any authenticated user (including one with limited intended access) can read and modify all CRM data, financial records, and documents belonging to any user.

**Remediation:**
For an internal tool with a small team, this may be acceptable if all users are trusted admins. However, if any form of role-based access is intended, add ownership/permission checks. Additionally, consider enabling Supabase RLS on the database tables as a defense-in-depth layer.

---

## Finding 9

### [MEDIUM] Webhook Timing Attack on HMAC Comparison

**Location:** `src/app/api/webhooks/calendly/route.ts:35`
**CWE:** CWE-208 (Observable Timing Discrepancy)

**Description:**
The HMAC signature comparison uses JavaScript's `!==` operator, which short-circuits on the first different character. This leaks timing information about how many leading characters of the signature are correct, allowing an attacker to forge valid signatures byte by byte.

**Impact:**
If `CALENDLY_WEBHOOK_SECRET` is configured, an attacker could theoretically brute-force a valid HMAC signature for a chosen payload by measuring response times.

**Remediation:**
Use `crypto.timingSafeEqual`:

```ts
const providedBuf = Buffer.from(providedSig, "hex");
const expectedBuf = Buffer.from(expectedSig, "hex");
if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}
```

---

## Finding 10

### [MEDIUM] No Rate Limiting on Any Endpoint

**Location:** Application-wide
**CWE:** CWE-770 (Allocation of Resources Without Limits)

**Description:**
There is no rate limiting on any route, server action, or API endpoint. This applies to:
- The login page (magic link OTP via Supabase)
- All 20+ server actions (create/update/delete operations)
- The search functionality
- The Calendly webhook endpoint

**Impact:**
- **Login bruteforce/enumeration:** Spam the magic link endpoint to enumerate valid email addresses
- **Data flooding:** Automated scripts can create thousands of fake engagements, contacts, tasks, or expenses
- **Resource exhaustion:** Expensive search queries or bulk webhook calls can degrade performance
- **Email bombing:** Spam the OTP endpoint to flood a target email inbox

**Remediation:**
For Next.js on Vercel, use middleware-based rate limiting (e.g., `@upstash/ratelimit`). For the webhook endpoint, add IP-based rate limiting or restrict to Calendly's known IP ranges.

---

## Finding 11

### [MEDIUM] No Security Headers Configured

**Location:** `next.config.ts`
**CWE:** CWE-693 (Protection Mechanism Failure)

**Description:**
The Next.js config is empty with no security headers defined. Missing headers include:
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`
- `Referrer-Policy`
- `Permissions-Policy`

**Impact:**
- Without HSTS, the app is vulnerable to SSL stripping attacks
- Without X-Frame-Options, the app can be embedded in iframes (clickjacking)
- Without CSP, any future XSS vulnerability has unrestricted impact
- Without nosniff, browsers may MIME-sniff responses

**Remediation:**
Add security headers in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};
```

---

## Finding 12

### [MEDIUM] Supabase Anon Key Exposed with Likely No RLS

**Location:** `.env.local:1-2`, `src/lib/supabase/client.ts`
**CWE:** CWE-200 (Exposure of Sensitive Information)

**Description:**
The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is a JWT with `role: "anon"`, exposed to the client browser (this is by design for Supabase). However, the security of this architecture depends entirely on Row Level Security (RLS) being enabled on all tables. The application uses a direct Postgres connection (`DATABASE_URL`) for all server-side queries via Drizzle ORM, bypassing Supabase's PostgREST layer entirely. This means:

1. RLS policies may not exist since the app never queries through PostgREST
2. The anon key, combined with the Supabase client, could allow direct REST API access to any table without RLS
3. The Realtime subscription in `src/lib/use-realtime.ts` subscribes to `postgres_changes` on 7 tables using the anon key -- if RLS is not enabled, this broadcasts all changes to any connected client

**Impact:**
If RLS is not enabled (likely given the architecture), anyone with the anon key (publicly visible in the page source) can query any table via Supabase REST API, subscribe to real-time changes, and potentially modify data.

**Remediation:**
1. Enable RLS on all tables in Supabase Dashboard
2. Create restrictive RLS policies (at minimum, require `auth.uid() IS NOT NULL`)
3. Audit Realtime configuration to ensure it respects RLS
4. Consider disabling the PostgREST API if all queries go through Drizzle

---

## Finding 13

### [LOW] Drizzle ORM Connection Without TLS Verification

**Location:** `src/lib/db/index.ts:7-8`
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

**Description:**
The Postgres connection is created with `prepare: false` (for PgBouncer compatibility) but without explicit SSL/TLS configuration. Supabase enforces TLS at the infrastructure level, so this is likely encrypted in transit. However, there is no explicit `ssl: { rejectUnauthorized: true }` configuration.

**Impact:**
Low in the current Supabase deployment. Would be higher if the database were migrated to a self-hosted environment.

**Remediation:**

```ts
const client = connectionString
  ? postgres(connectionString, {
      prepare: false,
      ssl: { rejectUnauthorized: true },
    })
  : null;
```

---

## Finding 14

### [LOW] Error Messages May Leak Internal Details

**Location:** `src/app/actions.ts` (throughout), `src/app/api/webhooks/calendly/route.ts`
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)

**Description:**
Server actions throw raw `Error` objects that are caught by client components and displayed directly. If a database error occurs (e.g., constraint violation, connection failure), the raw Postgres error message will propagate to the client, potentially revealing table names, column names, and constraint details.

**Impact:**
Information disclosure that aids further attacks. An attacker can learn the database schema, table names, and constraint configurations from error messages.

**Remediation:**
Wrap server action logic in try/catch and return sanitized errors:

```ts
export async function changeStage(engagementId: string, newStage: string) {
  try {
    // ... existing logic ...
  } catch (error) {
    console.error("changeStage failed:", error);
    throw new Error("Failed to update stage. Please try again.");
  }
}
```

---

## Finding 15

### [LOW] Dependency Vulnerability -- esbuild in drizzle-kit

**Location:** `package.json` (devDependency: `drizzle-kit`)
**CWE:** CWE-1395 (Dependency on Vulnerable Third-Party Component)

**Description:**
`pnpm audit` reports 1 moderate vulnerability: esbuild <=0.24.2 (GHSA-67mh-4wv8-2f99), reachable through drizzle-kit's dependency chain. This vulnerability allows any website to send requests to the esbuild development server and read responses.

**Impact:**
Low -- this is a devDependency only used during local development for `drizzle-kit generate` and `drizzle-kit push`. It does not affect the production build or deployed application.

**Remediation:**
Update `drizzle-kit` when a patched version is available, or add a `pnpm.overrides` entry:

```json
"pnpm": {
  "overrides": {
    "esbuild": ">=0.25.0"
  }
}
```

---

## Finding 16

### [INFO] Mock Data Fallback Pattern Creates Confusing Security Boundary

**Location:** `src/app/(app)/clients/[id]/page.tsx:37-56`, multiple page files
**CWE:** N/A (Architectural concern)

**Description:**
Several pages use a pattern where they attempt to fetch real data, and on any error, silently fall back to mock data. This means if an auth check were added that throws, the catch block would swallow it and show mock data instead of denying access.

**Impact:**
No direct security impact, but this pattern makes it difficult to add security controls without introducing subtle bypasses.

**Remediation:**
Use specific error handling rather than catch-all, or remove mock data fallbacks once the database is stable.

---

## Finding 17

### [INFO] No CSRF Protection Considerations for Server Actions

**Location:** Application-wide
**CWE:** CWE-352 (Cross-Site Request Forgery)

**Description:**
Next.js server actions have built-in CSRF protection through an anti-CSRF token mechanism since Next.js 14. The framework automatically validates that server action requests originate from the same origin. This is correctly in place here.

The Calendly webhook endpoint is a standard POST route that does not go through the server action CSRF mechanism, but relies on webhook signature verification (covered by Finding 4).

**Impact:**
Minimal for server actions (framework handles CSRF). The webhook endpoint's CSRF risk is already covered by Finding 4.

**Remediation:**
No additional action needed for server actions. Fix Finding 4 for the webhook endpoint.

---

## Finding 18

### [INFO] Search Function Allows LIKE Pattern Characters

**Location:** `src/lib/queries.ts:352-376`
**CWE:** CWE-943 (Improper Neutralization of Special Elements in Data Query Logic)

**Description:**
The `searchEngagements` function wraps user input in `%` for an `ILIKE` search without escaping LIKE metacharacters (`%` and `_`). This is parameterized (no SQL injection) but allows unintended search behavior.

**Impact:**
Minimal -- this is a search function for authenticated users. The worst case is returning unexpected results.

**Remediation:**
Escape LIKE special characters:

```ts
const escapedQuery = query.replace(/[%_\\]/g, "\\$&");
const searchTerm = `%${escapedQuery}%`;
```

---

# Executive Summary

## Overall Security Posture: CRITICAL

The STRVX internal dashboard has a **fully disabled authentication layer**. The middleware that enforces login is commented out, and the server-side auth function silently falls back to a hardcoded default user on any auth failure. This means the entire application -- including all CRM data, financial records, client contacts, and deal pipeline -- is accessible to anyone with the URL.

The two critical findings (disabled middleware + auth fallback) combine to create a situation where the application has zero access control at any layer:

1. **Middleware:** passes all requests through (Finding 1)
2. **Server actions:** fallback to `nick@strvx.com` on auth failure (Finding 2)
3. **Database:** direct Postgres connection bypasses RLS (Finding 6, 12)
4. **Supabase REST API:** likely no RLS policies (Finding 12)

Beyond authentication, the application lacks input validation, rate limiting, security headers, and authorization checks.

## Findings Summary Table

| # | Severity | Finding | File | Status |
|---|----------|---------|------|--------|
| 1 | CRITICAL | Auth middleware disabled | `src/middleware.ts` | Open |
| 2 | CRITICAL | Server actions auth bypass via dev fallback | `src/app/actions.ts` | Open |
| 3 | HIGH | Open redirect in OAuth callback | `src/app/auth/callback/route.ts` | Open |
| 4 | HIGH | Webhook signature verification optional | `src/app/api/webhooks/calendly/route.ts` | Open |
| 5 | HIGH | Webhook raw SQL LIKE injection | `src/app/api/webhooks/calendly/route.ts` | Open |
| 6 | HIGH | Database superuser credential in connection | `.env.local` | Open |
| 7 | MEDIUM | No schema validation on server actions | `src/app/actions.ts` | Open |
| 8 | MEDIUM | No authorization checks on resources | `src/app/actions.ts` | Open |
| 9 | MEDIUM | Timing-unsafe HMAC comparison | `src/app/api/webhooks/calendly/route.ts` | Open |
| 10 | MEDIUM | No rate limiting anywhere | Application-wide | Open |
| 11 | MEDIUM | No security headers | `next.config.ts` | Open |
| 12 | MEDIUM | Supabase anon key + likely no RLS | Application-wide | Open |
| 13 | LOW | No explicit TLS for DB connection | `src/lib/db/index.ts` | Open |
| 14 | LOW | Error messages leak internals | `src/app/actions.ts` | Open |
| 15 | LOW | esbuild vulnerability in devDep | `package.json` | Open |
| 16 | INFO | Mock data fallback swallows errors | Multiple pages | Open |
| 17 | INFO | CSRF (framework-handled) | Application-wide | N/A |
| 18 | INFO | LIKE pattern chars in search | `src/lib/queries.ts` | Open |

## Priority Remediation Roadmap

**Immediate (before any deployment):**
1. **Enable auth middleware** (Finding 1) -- uncomment one line
2. **Remove auth dev fallback** (Finding 2) -- make auth failure throw
3. **Make webhook signature mandatory** (Finding 4) -- add env var check

**Within 24 hours:**
4. **Fix open redirect** (Finding 3) -- validate `next` parameter
5. **Fix timing-safe comparison** (Finding 9) -- use `crypto.timingSafeEqual`
6. **Enable RLS on Supabase tables** (Finding 12)

**Within 1 week:**
7. **Add Zod validation to all server actions** (Finding 7)
8. **Add security headers** (Finding 11)
9. **Add rate limiting** (Finding 10)
10. **Fix webhook SQL** (Finding 5) -- use Drizzle `sql` template
11. **Sanitize error messages** (Finding 14)

**Next sprint:**
12. **Add authorization checks** (Finding 8)
13. **Add explicit TLS config** (Finding 13)
14. **Remove mock data fallbacks** (Finding 16)
15. **Update drizzle-kit for esbuild fix** (Finding 15)

## Positive Findings

The following security practices are correctly implemented:

1. **Drizzle ORM parameterized queries:** All standard Drizzle queries (select, insert, update, delete) use parameterized queries that prevent SQL injection. The ORM handles escaping correctly.

2. **Supabase SSR cookie handling:** The `@supabase/ssr` implementation follows Supabase's recommended pattern for server-side cookie management.

3. **Auth middleware logic is correct:** The `updateSession` function in `src/lib/supabase/middleware.ts` is well-implemented -- it just needs to be activated. It correctly exempts `/login`, `/auth`, and `/api/webhooks` paths.

4. **No unsafe HTML rendering:** The codebase does not use unsafe innerHTML injection patterns anywhere, eliminating the most common XSS vector in React applications.

5. **Content rendering is safe:** The document viewer (`src/app/(app)/docs/[id]/page.tsx`) parses markdown manually but renders through React JSX (not raw HTML), which auto-escapes content.

6. **Timeline component is XSS-safe:** User-generated content in the timeline (`src/components/client/timeline.tsx`) is rendered as text content in JSX, not as HTML.

7. **`.env*` files are properly gitignored:** The `.gitignore` correctly excludes all `.env*` files, and the `.env.local` file was never committed to git history.

8. **No secrets in client bundles:** Only `NEXT_PUBLIC_` prefixed variables (Supabase URL and anon key, which are designed to be public) are exposed to the client.

9. **UUIDs for primary keys:** All tables use `uuid().defaultRandom()` for primary keys, making ID enumeration attacks impractical.

10. **Transaction usage:** Stage changes and action creation correctly use database transactions to maintain consistency.
