# Error Handling & Logging Strategy

**Date:** 2026-03-30
**Scope:** STRVX Internal Dashboard (`strvx-internal-tool`)
**Stack:** Next.js 16, React 19, Drizzle ORM, Supabase, PostgreSQL

---

## Part 1: Current State Audit

### 1. try/catch Blocks

The codebase contains **28 try/catch blocks** across 17 files. The dominant pattern is a "DB fallback" idiom: server pages attempt a real database query and silently fall back to mock data on failure.

| Category | Count | Files |
|----------|-------|-------|
| Server page DB fallback (silent catch) | 12 | `dashboard/page.tsx`, `pipeline/page.tsx`, `clients/page.tsx`, `clients/[id]/page.tsx`, `contacts/page.tsx`, `calendar/page.tsx`, `invoices/page.tsx`, `invoices/[id]/page.tsx`, `finances/page.tsx`, `goals/page.tsx`, `marketing/page.tsx` |
| Client-side optimistic update (silent catch) | 8 | `client-detail-view.tsx` (5), `pipeline-board.tsx`, `marketing-client.tsx` (2) |
| Client-side with user-facing error state | 2 | `create-engagement-form.tsx`, `quick-add-bar.tsx` |
| Command palette search (silent catch) | 2 | `command-palette.tsx` |
| Supabase cookie (expected/documented) | 1 | `supabase/server.ts` |
| Auth fallback (silent catch) | 1 | `actions.ts` getCurrentUser() |
| Webhook JSON parse (proper 400 response) | 1 | `api/webhooks/calendly/route.ts` |
| Calendar event creation (silent catch) | 1 | `calendar-page-client.tsx` |

### 2. throw new Error Calls

There are **8 throw statements** in `src/app/actions.ts`. All throw raw `Error` objects that propagate as unhandled exceptions to the client:

| Line | Error Message | User-Friendly? |
|------|--------------|----------------|
| 33 | `"No users in database. Run seed first."` | No -- developer-only message |
| 49 | `"Company name and engagement name are required"` | Yes |
| 113 | `"Content and engagement are required"` | Yes |
| 134 | `"Content cannot be empty"` | Yes |
| 138 | `"Content must be 10,000 characters or less"` | Yes |
| 194 | `"Engagement not found"` | Acceptable but terse |
| 246 | `"Action not found"` | Acceptable but terse |
| 303 | `"Name and company are required"` | Yes |

**Problem:** Server actions throw errors that cross the server/client boundary. When a server action throws, Next.js serializes only the message. Any database or network error in `createEngagement`, `createTask`, `createInvoice`, `createExpense`, `createGoal`, `createMarketingPost`, `createDocument`, `updateDocument`, `updateTask`, `deleteTask`, `updateEngagement`, `archiveEngagement`, `updateGoal`, `updateMarketingPost`, `deleteMarketingPost`, `createCalendarEventAction`, etc. -- **none of these wrap their DB calls in try/catch**, so an unhandled Drizzle/Postgres error will propagate with a raw, potentially information-leaking error message.

### 3. Empty/Silent Catch Blocks

There are **0 truly empty catch blocks** (no code at all inside braces). However, there are **23 catch blocks that suppress errors** with only a comment:

- **12 server-page fallbacks** -- comment like `// DB unavailable` or `// Using mock data`
- **8 optimistic-update catches** -- comment like `// Optimistic update already applied`
- **2 command palette catches** -- silently reset results to empty array
- **1 auth catch** -- `// Auth not configured, fall through to default user`

While the intent (graceful degradation) is understandable, **none of these log anything** -- not even in development. If the database connection fails, there is zero diagnostic signal.

### 4. Server Action Return Patterns

`src/app/actions.ts` has **two return patterns**, both problematic:

1. **Return the entity** (`createEngagement`, `createContact`, `createTask`, etc.) -- no error wrapping. If the DB insert fails, the raw Drizzle error propagates.
2. **Return `{ success: true }`** (`quickAdd`) -- only the happy path returns a value. Failure throws.

**Missing:** A consistent `{ success, error }` or discriminated union return type. Only 2 of ~20 server actions (`createEngagementForm.tsx`, `quick-add-bar.tsx`) catch errors and display them to the user. The rest silently swallow or let the error propagate unhandled.

### 5. Error Boundary Components

**There are no React error boundaries in the codebase.** Specifically:

- No `error.tsx` file in any route segment (Next.js App Router convention)
- No `global-error.tsx` in `src/app/`
- No custom `ErrorBoundary` component

This means any unhandled rendering error in a server or client component will show the **Next.js default error page** in production or a raw stack trace in development.

The codebase does have:
- `src/app/not-found.tsx` -- a styled 404 page
- `src/app/(app)/loading.tsx` -- a loading spinner

### 6. Logging Infrastructure

**There is zero logging infrastructure.** Specifically:

- No logging library installed (no winston, pino, logtail, axiom, etc.)
- No structured logging utility
- No Sentry, LogRocket, Datadog, or any error monitoring SDK
- The only mention of "Sentry" is in **mock data** (`mock-docs.ts`, `mock-tasks.ts`) -- purely fictional content

### 7. Console Statements

**There are zero `console.log`, `console.error`, `console.warn`, or `console.debug` statements** in the entire `src/` directory. While this keeps production output clean, it also means errors are completely invisible -- even during development.

### 8. Additional Findings

**Database connection is unsafe:**
`src/lib/db/index.ts` sets `db` to `null as unknown as ReturnType<typeof drizzle>` when `DATABASE_URL` is missing. This means any query call on `db` when the env var is unset will throw a cryptic "cannot read properties of null" TypeError at runtime, not a meaningful error.

**Supabase client is unsafe:**
`src/lib/supabase/client.ts` returns `null as unknown as ReturnType<typeof createBrowserClient>` when env vars are missing. Same problem.

**Supabase server uses force unwraps:**
`src/lib/supabase/server.ts` line 8-9 uses `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!` -- TypeScript non-null assertions that will throw at runtime if the env vars are missing.

**No input validation library (Zod):**
Despite handling user input in 20+ server actions, there is no Zod or equivalent runtime validation. All input validation is done manually with `if (!x) throw new Error(...)`. This is fragile and inconsistent -- most actions have zero validation (e.g., `createTask`, `createInvoice`, `createExpense`, `createGoal`, `createMarketingPost`, `createDocument`).

**Webhook has no error handling for DB operations:**
`src/app/api/webhooks/calendly/route.ts` parses JSON safely but does not wrap any of its 5 database operations in try/catch. A Drizzle error during company/contact/engagement creation will crash the webhook handler with a 500.

**Realtime provider silently reconnects:**
`src/lib/use-realtime.ts` handles `CHANNEL_ERROR` by retrying after 5 seconds but never logs the error or notifies the user that real-time sync is broken.

---

## Part 2: Strategy

### A. Server Action Error Handling

#### Pattern: Result Type

Every server action should return a discriminated union instead of throwing:

```typescript
// src/lib/action-result.ts
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail(error: string, code?: string): ActionResult<never> {
  return { success: false, error, code };
}
```

**Rules:**
1. Server actions NEVER throw. They return `ActionResult<T>`.
2. Wrap every database call in try/catch.
3. Catch blocks return `fail("User-friendly message")` and log the real error.
4. Validation errors return `fail("Descriptive message", "VALIDATION")`.
5. "Not found" returns `fail("Resource not found", "NOT_FOUND")`.
6. Database/network errors return `fail("Something went wrong. Please try again.", "INTERNAL")`.
7. Never expose raw database error messages to the client.

#### Pattern: Input Validation with Zod

Install Zod (`pnpm add zod`) and define schemas for every server action:

```typescript
// src/lib/schemas.ts
import { z } from "zod";

export const createEngagementSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200),
  engagementName: z.string().min(1, "Engagement name is required").max(200),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  dealValue: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount").optional().or(z.literal("")),
  stage: z.string().optional(),
});

export const quickAddSchema = z.object({
  content: z.string().min(1, "Content is required").max(10000, "Content must be 10,000 characters or less"),
  engagementId: z.string().uuid("Invalid engagement"),
  dueDate: z.string().optional(),
  scheduledAt: z.string().optional(),
});

// ... schemas for createTask, createInvoice, createExpense, createGoal,
//     createMarketingPost, createDocument, createContact, etc.
```

**Rules:**
1. Every server action that accepts user input MUST validate with Zod before any database operation.
2. Parse FormData into an object, then validate with `.safeParse()`.
3. Return `fail(issues[0].message, "VALIDATION")` on parse failure.

### B. Client-Side Error Boundaries

#### Route-Level Error Boundaries

Create `error.tsx` files for every route group:

```
src/app/error.tsx                    -- global fallback
src/app/(app)/error.tsx              -- app shell fallback
src/app/(app)/dashboard/error.tsx    -- dashboard-specific
src/app/(app)/pipeline/error.tsx     -- pipeline-specific
src/app/(app)/clients/error.tsx      -- clients-specific
src/app/(app)/clients/[id]/error.tsx -- client detail-specific
```

Each should:
1. Display a user-friendly error message.
2. Offer a "Try again" button that calls `reset()`.
3. Offer a "Go to Dashboard" fallback link.
4. Report the error to the logging/monitoring system.

Minimal implementation:

```typescript
// src/app/(app)/error.tsx
"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled route error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        An unexpected error occurred. Our team has been notified.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
```

Also create `src/app/global-error.tsx` for errors that break the root layout.

#### Component-Level Error Boundaries

For non-critical widgets (activity feed, pipeline chart, revenue sparkline), wrap them in lightweight error boundaries that show a "Failed to load" placeholder instead of crashing the whole page.

### C. Form Validation Errors

#### Current Good Examples

`create-engagement-form.tsx` and `quick-add-bar.tsx` already implement the correct pattern:
- Catch errors from server actions
- Display user-facing error messages
- Offer retry

#### Pattern for All Forms

Every form that calls a server action should:
1. Use `const [error, setError] = useState<string | null>(null)`.
2. Clear error on new submission: `setError(null)`.
3. On catch, extract the message: `setError(result.success === false ? result.error : "Something went wrong")`.
4. Display the error inline near the submit button.
5. For optimistic updates, revert the optimistic state on failure AND show a toast.

#### Fix Optimistic Update Catches

The 8 silent catch blocks in `client-detail-view.tsx`, `pipeline-board.tsx`, `marketing-client.tsx`, and `calendar-page-client.tsx` all say "Optimistic update already applied" but **never revert the optimistic state** (except `pipeline-board.tsx` which does revert). They should:

1. Revert the optimistic state to the previous value.
2. Show a toast notification: "Failed to save. Please try again."
3. Log the error.

### D. Database Connection Errors

#### Safe Database Initialization

Replace the `null as unknown` pattern with explicit guards:

```typescript
// src/lib/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

function createDb() {
  if (!connectionString) {
    return null;
  }
  const client = postgres(connectionString, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
}

const _db = createDb();

export function getDb() {
  if (!_db) {
    throw new DatabaseUnavailableError(
      "DATABASE_URL is not configured. Database operations are unavailable."
    );
  }
  return _db;
}

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}
```

This makes the failure explicit and catchable rather than producing "cannot read properties of null" at some random query site.

#### Connection Pool Health

Configure postgres.js with:
- `connect_timeout: 10` -- fail fast on connection issues
- `idle_timeout: 20` -- release idle connections
- `max: 10` -- limit pool size for serverless

### E. Network Errors and Retry Strategies

#### Client-Side Retry

For server action calls from client components, implement an exponential backoff utility:

```typescript
// src/lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 2, baseDelay = 500 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * Math.pow(2, attempt))
        );
      }
    }
  }
  throw lastError;
}
```

**When to retry:**
- Network errors (fetch failures, timeouts)
- Database connection errors (transient)

**When NOT to retry:**
- Validation errors (user must fix input)
- Auth errors (user must re-authenticate)
- Not-found errors (resource does not exist)

#### Webhook Retry

The Calendly webhook handler should:
1. Wrap all DB operations in a single try/catch.
2. Return 500 with a structured error body on failure (Calendly will retry).
3. The idempotency check prevents duplicate processing on retry.

### F. Logging Architecture

#### What to Log

| Level | What | Examples |
|-------|------|---------|
| `error` | Unhandled exceptions, failed DB operations, failed external API calls | Drizzle query error, Supabase auth error, webhook processing failure |
| `warn` | Degraded functionality, fallback to mock data, auth fallback | DB unavailable (falling back to mock), Supabase not configured |
| `info` | Significant user actions, state transitions | Engagement created, stage changed, invoice created |
| `debug` | Query details, request/response payloads | Query params, FormData contents (redacted) |

#### Where to Log

| Environment | Target | Library |
|-------------|--------|---------|
| Development | Console (structured JSON) | pino |
| Production | Axiom, Logtail, or Vercel Log Drain | pino + transport |
| Error monitoring | Sentry | @sentry/nextjs |

#### Structured Logging Format

```typescript
// src/lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.secret",
      "*.email",
      "*.contactEmail",
    ],
    censor: "[REDACTED]",
  },
  // Browser-safe configuration for client-side use
  browser: {
    serialize: true,
  },
});

// Context-enriched child loggers
export function createActionLogger(actionName: string) {
  return logger.child({ action: actionName, layer: "server-action" });
}

export function createQueryLogger(queryName: string) {
  return logger.child({ query: queryName, layer: "database" });
}

export function createWebhookLogger(source: string) {
  return logger.child({ webhook: source, layer: "api" });
}
```

#### Log Levels

- `error`: Something broke. Needs human attention. Always logged.
- `warn`: Something degraded. Should be investigated. Always logged.
- `info`: Normal business events. Logged in production for audit.
- `debug`: Diagnostic detail. Development only.

#### Sensitive Data Redaction

The pino `redact` configuration above covers the common paths. Additionally:
- Never log raw SQL query parameters containing user data.
- Never log full request/response bodies -- only summaries.
- Never log Supabase tokens, API keys, or webhook secrets.
- Log user IDs (UUIDs), not email addresses.

### G. Error Monitoring

#### Recommended Stack

| Tool | Purpose | Priority |
|------|---------|----------|
| **Sentry** (`@sentry/nextjs`) | Error tracking, stack traces, breadcrumbs, performance | P0 -- install first |
| **Vercel Analytics** (built-in) | Web Vitals, page load times | P1 -- already available |
| **Axiom or Logtail** | Structured log aggregation, search, dashboards | P1 -- for operational visibility |
| **Uptime monitoring** (e.g., BetterStack) | Endpoint health, downtime alerts | P2 |

#### What to Track

- **Error rate** by route, by server action, by time window
- **Error type distribution** (validation, database, auth, network)
- **P50/P95/P99 latency** for server actions and page loads
- **Unhandled promise rejections** (Next.js catches these but they should be zero)
- **Database connection pool saturation**
- **Webhook success/failure rate**

#### Alerting Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| Error rate (any route) | > 5% of requests in 5 min | Slack notification |
| Database connection failures | > 3 in 1 min | Slack notification + PagerDuty |
| Webhook failures | > 50% in 15 min | Slack notification |
| P95 server action latency | > 3 seconds | Slack notification |
| Unhandled exceptions | Any | Sentry alert (immediate) |

#### Error Grouping and Deduplication

Sentry handles this natively. Configure:
- Group by error type + stacktrace fingerprint.
- Set `beforeSend` to strip PII from error context.
- Tag errors with: route, server action name, user role, environment.

### H. User-Facing Error States

#### Error Message Guidelines

| Scenario | Message | Tone |
|----------|---------|------|
| Validation failure | Specific: "Company name is required" | Direct |
| Save failed (network) | "Couldn't save your changes. Please try again." | Empathetic |
| Page load failed | "Something went wrong loading this page." | Neutral |
| Not found | "This engagement could not be found." | Clear |
| Auth expired | "Your session has expired. Please sign in again." | Informative |
| DB unavailable | "We're having trouble connecting. Please try again in a moment." | Reassuring |

**Rules:**
1. Never show raw error messages, stack traces, or error codes to users.
2. Always provide an actionable next step (retry button, link to dashboard, sign-in link).
3. Keep messages under 100 characters.

#### Retry Mechanisms

- **Inline retry**: For form submissions, show error with "Try again" button (already done in `quick-add-bar.tsx`).
- **Automatic retry**: For background operations (realtime sync, search), retry silently 2-3 times before showing a degraded state.
- **Page-level retry**: Error boundaries provide a `reset()` function that re-renders the route segment.

#### Fallback UI Components

Create reusable error/empty state components:

```
src/components/ui/error-state.tsx    -- "Something went wrong" with retry button
src/components/ui/empty-state.tsx    -- "No items yet" with action button (already exists implicitly)
src/components/ui/offline-banner.tsx -- "You appear to be offline" banner
```

#### Toast Notifications for Transient Errors

Currently, only `quick-add-bar.tsx` has a toast pattern. Standardize with a toast system:
- Success toasts: auto-dismiss after 2 seconds (already implemented).
- Error toasts: persist until dismissed, with retry button.
- Warning toasts: auto-dismiss after 4 seconds.

Consider installing `sonner` (lightweight, Next.js-compatible) or building a minimal toast context.

---

## Part 3: Specific Fixes Needed

### Priority: CRITICAL

#### 1. Add error boundaries for every route segment

**Files to create:**
- `src/app/error.tsx`
- `src/app/global-error.tsx`
- `src/app/(app)/error.tsx`

**Current behavior:** Any unhandled error shows the default Next.js error page.
**Recommended fix:** Create styled error boundary components with retry and fallback navigation.
**Impact:** Without these, a single rendering error crashes the entire page with no recovery path.

#### 2. Wrap all server action DB operations in try/catch

**File:** `src/app/actions.ts` (all 20+ exported functions)
**Lines:** Every function that calls `db.insert()`, `db.update()`, `db.delete()`, `db.select()`, `db.transaction()`
**Current behavior:** Raw Drizzle errors propagate to the client with potentially sensitive information (table names, column names, constraint violations).
**Recommended fix:** Wrap each function body in try/catch, return `ActionResult<T>`, log the real error, return a safe user-facing message.
**Priority:** CRITICAL -- information leakage risk.

#### 3. Fix unsafe null database client

**File:** `src/lib/db/index.ts` (lines 7-12)
**Current behavior:** When `DATABASE_URL` is missing, `db` is `null` cast to a Drizzle type. Any query call throws a cryptic TypeError.
**Recommended fix:** Use a `getDb()` function that throws a descriptive `DatabaseUnavailableError`, or return a proxy that throws on any method access.

#### 4. Fix unsafe Supabase client null cast

**File:** `src/lib/supabase/client.ts` (lines 6-8)
**Current behavior:** Returns `null` cast to the Supabase client type. Any method call will throw a cryptic TypeError.
**Recommended fix:** Return `null` explicitly and check at call sites, or throw a descriptive error.

#### 5. Fix Supabase server force unwraps

**File:** `src/lib/supabase/server.ts` (lines 8-9)
**Current behavior:** `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!` -- will crash at runtime if missing.
**Recommended fix:** Guard with explicit check and throw a descriptive error, or return null and handle at call sites.

### Priority: HIGH

#### 6. Silent optimistic update catches need rollback and notification

**File:** `src/components/client/client-detail-view.tsx` (lines 272, 491, 517, 548, 667)
**Current behavior:** Catch block says "Optimistic update already applied" but does not revert state or notify the user. The UI shows data that was never persisted.
**Recommended fix:** Revert optimistic state to previous value. Show a toast: "Failed to save. Please try again."

#### 7. Silent optimistic update catch in calendar

**File:** `src/app/(app)/calendar/calendar-page-client.tsx` (line 112)
**Current behavior:** Calendar event is added to UI but catch block ignores the failure silently.
**Recommended fix:** Remove the event from local state on failure. Show a toast.

#### 8. Silent marketing CRUD catches

**File:** `src/app/(app)/marketing/marketing-client.tsx` (lines 78, 96)
**Current behavior:** Server action failure is silently ignored while local state is updated.
**Recommended fix:** Revert local state on failure. Show error toast.

#### 9. Webhook handler needs DB error handling

**File:** `src/app/api/webhooks/calendly/route.ts` (lines 74-133)
**Current behavior:** Five DB operations with no try/catch. Any failure returns an unhandled 500.
**Recommended fix:** Wrap the DB operations in try/catch. Return a structured 500 response. Log the error. Calendly will retry.

#### 10. Add Zod validation to all server actions

**File:** `src/app/actions.ts`
**Current behavior:** Only `quickAdd` and `createEngagement` have manual validation. Other functions (`createTask`, `createInvoice`, `createExpense`, `createGoal`, `createMarketingPost`, `createDocument`, `createContact`, etc.) accept arbitrary input without validation.
**Recommended fix:** Install Zod. Define schemas. Validate at the top of every server action.

### Priority: MEDIUM

#### 11. Add logging infrastructure

**Files to create:** `src/lib/logger.ts`
**Dependency to add:** `pino` (or alternative)
**Current behavior:** Zero logging anywhere in the codebase. Errors are completely invisible.
**Recommended fix:** Create a structured logger. Add log statements to every catch block, every server action, and the webhook handler.

#### 12. Replace silent mock-data fallbacks with logged warnings

**Files:** All 12 server page files that catch and fall back to mock data.
**Current behavior:** `catch { // DB unavailable }` -- completely silent.
**Recommended fix:** Add `logger.warn("Database unavailable, using mock data", { page: "dashboard" })` in each catch block. This preserves the graceful degradation while making the condition visible in logs.

#### 13. Add error monitoring (Sentry)

**Dependency to add:** `@sentry/nextjs`
**Current behavior:** No error monitoring.
**Recommended fix:** Install and configure Sentry. Add `Sentry.captureException(error)` calls in error boundaries and catch blocks.

#### 14. Realtime provider should log connection errors

**File:** `src/lib/use-realtime.ts` (line 31-34)
**Current behavior:** Silently retries on `CHANNEL_ERROR` with no logging or user notification.
**Recommended fix:** Log the error. After 3 failed retries, show a subtle banner: "Live updates paused. Refresh to reconnect."

### Priority: LOW

#### 15. Command palette should show transient error state

**File:** `src/components/command-palette.tsx` (lines 107, 133)
**Current behavior:** On search failure, results are set to empty array with no indication of error.
**Recommended fix:** Show "Search unavailable" message instead of "No results."

#### 16. Pipeline board -- already correct but could add toast

**File:** `src/components/pipeline/pipeline-board.tsx` (lines 149-150)
**Current behavior:** Correctly reverts optimistic state on failure. Could additionally show a toast.
**Recommended fix:** Add a toast notification for awareness.

---

## Implementation Order

1. **Week 1:** Install Zod + pino. Create `logger.ts`, `action-result.ts`, `schemas.ts`. Refactor `actions.ts` to return `ActionResult` and validate with Zod. Add try/catch around all DB operations.
2. **Week 2:** Create error boundary files (`error.tsx`, `global-error.tsx`). Fix all 8 optimistic update catches to revert + notify. Fix unsafe null casts in `db/index.ts` and `supabase/client.ts`.
3. **Week 3:** Install Sentry. Add `Sentry.captureException()` in error boundaries and server action catch blocks. Add logging to all silent catch blocks. Fix webhook error handling.
4. **Week 4:** Add toast notification system. Replace remaining silent catches with logged warnings. Add realtime connection error handling. Polish user-facing error messages.
