# STRVX Internal Tool — Integrations Roadmap

> Last updated: 2026-03-30
> Status: Planning
> Stack: Next.js + Supabase + Drizzle ORM (PostgreSQL)

---

## Executive Summary

STRVX is a 3-person agency. Every integration must pass a single test: **does this save us more time than it costs to build and maintain?** We are not building a generic CRM platform — we are building an opinionated command center that eliminates context-switching for a small, high-output team.

The schema already models engagements with full pipeline stages, contacts with Apollo IDs, prospect touches across channels, calendar events with Zoom links, invoices, expenses, tasks, projects, and marketing posts. The Calendly webhook is live and creates leads automatically. The foundation is strong — what follows is the plan to wire it into the tools we actually use every day.

This document is organized into three phases:

| Phase | Timeline | Theme |
|-------|----------|-------|
| **Phase 1** | Now | Revenue pipeline automation — close deals faster, get paid faster |
| **Phase 2** | After Phase 1 ships | Operational intelligence — know everything without asking |
| **Phase 3** | When scale demands | AI leverage — multiply output per person |

---

## 1. Google Workspace

### 1A. Gmail — Auto-Log Emails to Engagement Timeline

**What it does:**
Monitors the team Gmail inbox (or connected individual accounts) and automatically logs emails to the correct engagement timeline. When an email arrives from a known contact (matched by `contacts.email`), it creates an `interactions` record of type `"note"` with the email subject and snippet, linked to the engagement via `contacts.companyId -> engagements.companyId`.

**Why it matters for a 3-person agency:**
The engagement timeline is only useful if it is complete. Right now, every email touchpoint requires someone to manually log a note. Nobody does this consistently. The timeline becomes unreliable, and you lose the single source of truth. Auto-logging emails makes the timeline trustworthy by default — no discipline required.

**Technical approach:**
- Use the **Gmail API** with OAuth 2.0 (Google Workspace account). Push notifications via `watch()` + Pub/Sub are the right pattern — Gmail pushes a notification to a Cloud Pub/Sub topic, which triggers a webhook to our API route. No polling.
- Alternatively, for a simpler v1: use the Gmail API `history.list` endpoint on a 5-minute cron (Supabase Edge Function or Vercel Cron) to fetch new messages since the last sync. Store `historyId` in a `sync_state` table.
- Match sender/recipient email against `contacts.email` and `prospects.email`. If matched, create an `interactions` row. If no match, queue for review (show in a "unmatched emails" sidebar).
- Store the Gmail `messageId` on the interaction record for deduplication and deep-linking back to Gmail.

**Build vs. buy:**
Build. The Gmail API is well-documented, the matching logic is STRVX-specific, and third-party email logging tools (Streak, Copper) are designed for generic CRMs, not our schema. The core sync is ~200 lines of code.

**Effort:** Medium (3-5 days). OAuth setup is the longest part.
**Priority:** Phase 1. This is the highest-value integration after Calendly because it makes the engagement timeline reliable.

**Schema impact:**
- Add `gmail_message_id` (text, nullable) to `interactions` table
- Add `gmail_thread_id` (text, nullable) to `interactions` table
- Create `integration_sync_state` table (see Section 7)

---

### 1B. Google Calendar — Bidirectional Sync

**What it does:**
Two-way sync between the `calendar_events` table and Google Calendar. Events created in the STRVX dashboard appear on Google Calendar (so they show on phones, get reminders). Events created in Google Calendar appear in the dashboard (so the weekly view is complete). Changes propagate both directions.

**Why it matters:**
The dashboard already has a `calendarEvents` table with `title`, `date`, `startHour`, `durationHours`, `zoomLink`, and engagement/project references. But if team members still check Google Calendar for scheduling, and the dashboard calendar is a separate, incomplete view, nobody will use the dashboard calendar. Bidirectional sync makes the dashboard calendar the only calendar anyone needs to look at.

**Technical approach:**
- Google Calendar API with OAuth 2.0. Use `events.watch()` for push notifications (same Pub/Sub pattern as Gmail).
- On **STRVX -> Google**: When a `calendarEvents` row is inserted/updated, push to Google Calendar via the API. Store the `googleEventId` on the row for future updates.
- On **Google -> STRVX**: When a push notification arrives, fetch the changed event, upsert into `calendarEvents`. Match attendee emails against `contacts.email` to auto-link to engagements.
- Conflict resolution: last-write-wins with a `syncedAt` timestamp. For a 3-person team, conflicts are rare enough that this is sufficient.

**Build vs. buy:**
Build. Calendar sync libraries exist (e.g., Nylas) but add $15+/user/month and abstract away control we need for engagement linking.

**Effort:** Medium-High (5-7 days). Bidirectional sync has subtle edge cases (recurring events, timezone handling, deletion propagation).
**Priority:** Phase 2. Valuable, but the dashboard calendar is usable standalone. Gmail sync is higher leverage.

**Schema impact:**
- Add `google_event_id` (text, nullable) to `calendar_events`
- Add `synced_at` (timestamp, nullable) to `calendar_events`

---

### 1C. Google Drive — Auto-Create Project Folders

**What it does:**
When a new `projects` record is created (or an engagement moves to the "build" stage), automatically create a Google Drive folder with a standard structure (e.g., `/STRVX Clients/{Company Name}/{Project Name}/` with subfolders for Contracts, Deliverables, Assets). Store the folder link on the project record. Surface the link in the dashboard so anyone can jump to the project folder in one click.

**Why it matters:**
Folder creation is a 2-minute task that gets skipped or done inconsistently. When someone needs a client file months later, they waste 10 minutes hunting. Automated folder structure with a consistent naming convention eliminates this permanently.

**Technical approach:**
- Google Drive API with a service account (simpler than per-user OAuth for shared Drive folders).
- Trigger on engagement stage change to "build" or project creation.
- Create folder hierarchy, apply standard permissions (share with team), store the `driveUrl` on the `projects` row.
- Optional: also upload generated documents (proposals, invoices) to the correct folder.

**Build vs. buy:**
Build. This is a straightforward API call — maybe 100 lines of code. No third-party tool needed.

**Effort:** Low (1-2 days).
**Priority:** Phase 2. Nice quality-of-life improvement, not revenue-critical.

**Schema impact:**
- Add `drive_folder_url` (text, nullable) to `projects`
- Add `drive_folder_id` (text, nullable) to `projects`

---

## 2. Communication

### 2A. Slack — Notifications and Deal Alerts

**What it does:**
Sends real-time notifications to designated Slack channels when important events happen in the dashboard:
- New lead created (via Calendly webhook or manual entry)
- Engagement stage changes (especially "proposal" -> "negotiation" and "closed_won")
- Invoice overdue
- Task assigned or due today
- Prospect converted to engagement

Optionally: a daily digest message in a `#pipeline` channel with pipeline stats (total deal value, deals by stage, overdue actions).

**Why it matters:**
A 3-person team lives in Slack. If a new lead comes in from Calendly at 2 AM, nobody will notice until they open the dashboard. A Slack ping in `#deals` means the team knows immediately. Stage change alerts create shared awareness — everyone knows when a deal moves forward or closes without checking the dashboard.

**Technical approach:**
- **Slack Incoming Webhooks** for the initial version. No OAuth needed — just a webhook URL per channel. Fire-and-forget POST requests from our API routes whenever a relevant event occurs.
- Use Slack Block Kit for rich formatting (engagement name, company, deal value, stage badge, action buttons linking back to the dashboard).
- For the daily digest: Vercel Cron job at 9 AM that queries pipeline stats and sends a formatted Slack message.
- Future upgrade: Slack App with OAuth for bidirectional interaction (slash commands like `/strvx pipeline` to query from Slack).

**Build vs. buy:**
Build. Incoming webhooks are literally one HTTP POST. Block Kit formatting is the only real work.

**Effort:** Low (1-2 days for outbound notifications). Medium (3-4 days if adding slash commands and interactive buttons).
**Priority:** Phase 1. Extremely high value-to-effort ratio. This should ship immediately after Gmail sync.

**Schema impact:** None (outbound only). Add a `notification_preferences` table later if you want per-user controls.

---

### 2B. Zoom — Meeting Links and Transcripts

**What it does:**
Two capabilities:
1. **Auto-generate Zoom links**: When a `calendarEvents` row is created with type `"meeting"`, auto-create a Zoom meeting and populate the `zoomLink` field. (The schema already has this column.)
2. **Post-meeting transcripts**: After a Zoom meeting ends, pull the transcript/recording via the Zoom API, summarize it (see Section 6 — AI), and log the summary as an `interactions` record on the linked engagement.

**Why it matters:**
Zoom link generation is minor convenience. The real value is post-meeting transcripts auto-logged to the engagement timeline. Meeting outcomes and action items get lost in memory. A summarized transcript on the timeline means anyone on the team can catch up on a client meeting they missed in 30 seconds.

**Technical approach:**
- Zoom Server-to-Server OAuth app (no per-user auth needed for a single-workspace tool).
- Meeting creation: `POST /users/{userId}/meetings` when calendar events are created.
- Transcripts: Register a Zoom webhook for `recording.completed`. Download the transcript, run through AI summarizer (Section 6), save as an interaction.
- Link Zoom meetings to engagements via the `calendarEvents.engagementId` FK.

**Build vs. buy:**
Build the link generation (trivial). For transcripts, consider **Otter.ai** or **Fireflies.ai** for the transcription piece if you don't want to manage recording downloads — but the summarization and engagement linking must be custom.

**Effort:** Low (1 day for link generation). Medium (3-4 days for transcript pipeline).
**Priority:** Phase 2 (link generation), Phase 3 (transcripts — depends on AI summarizer).

**Schema impact:**
- Add `zoom_meeting_id` (text, nullable) to `calendar_events`

---

## 3. Financial

### 3A. Stripe — Invoice Payments

**What it does:**
Connects the `invoices` table to Stripe for payment processing. When an invoice status changes to "sent", generate a Stripe Payment Link (or hosted invoice) and attach the URL. When the client pays, a Stripe webhook updates `invoices.status` to "paid" and sets `invoices.paidDate`. The dashboard shows real-time payment status without anyone checking Stripe manually.

**Why it matters:**
Cash flow is existential for a small agency. Invoices that sit in "sent" status with no visibility into whether the client opened or paid them create anxiety and delayed follow-up. Stripe integration means: one-click payment for clients, automatic status updates, and the financial dashboard reflects reality.

**Technical approach:**
- **Stripe Checkout / Payment Links**: Simpler than full Stripe Invoicing. Generate a Payment Link per invoice with metadata (`invoice_id`). Store the link on the invoice record.
- **Stripe Webhooks**: Listen for `checkout.session.completed` and `payment_intent.succeeded`. Match back to the invoice via metadata. Update status and `paidDate`.
- Map `invoices.lineItems` (jsonb) to Stripe line items for the checkout page.
- For recurring maintenance fees (`engagements.maintenanceMonthlyFee`): create Stripe Subscriptions.

**Build vs. buy:**
Build. Stripe's API is best-in-class. No intermediary needed.

**Effort:** Medium (3-5 days). Stripe's API is clean, but handling edge cases (partial payments, refunds, failed payments, subscription lifecycle) takes time.
**Priority:** Phase 1. Getting paid is the most important business process. This is the #1 financial integration.

**Schema impact:**
- Add `stripe_payment_link` (text, nullable) to `invoices`
- Add `stripe_checkout_session_id` (text, nullable) to `invoices`
- Add `stripe_customer_id` (text, nullable) to `companies`
- Add `stripe_subscription_id` (text, nullable) to `engagements` (for maintenance billing)

---

### 3B. QuickBooks or Xero — Accounting Sync

**What it does:**
Syncs invoices and expenses from the STRVX dashboard to QuickBooks Online (or Xero) for proper accounting, tax reporting, and financial statements. When an invoice is created/paid in the dashboard, push it to QBO as an invoice/payment. When an expense is logged, push it as an expense/bill. Optionally pull bank transactions back for reconciliation.

**Why it matters:**
A 3-person agency still needs books. If invoices and expenses live only in the dashboard, someone has to manually re-enter them in accounting software (or an accountant has to). Double data entry is a waste. The dashboard should be the single entry point, with accounting software as the downstream system of record for compliance.

**Technical approach:**
- **QuickBooks Online API** (more common in the US) or **Xero API** (better internationally). Both use OAuth 2.0.
- One-directional sync: STRVX -> QBO/Xero. The dashboard is the source of truth for client-facing data; accounting software is the source of truth for tax filings.
- Map `invoices` -> QBO Invoices, `expenses` -> QBO Expenses, `companies` -> QBO Customers.
- Sync on create/update via API calls from the dashboard mutation handlers.
- Store the external ID (`qbo_invoice_id`, etc.) on our records for idempotency and linking.

**Build vs. buy:**
Build the sync adapter. The QBO/Xero APIs are well-documented but quirky (token refresh, rate limits, entity mapping). Budget extra time for OAuth token management — QBO tokens expire every hour and must be refreshed.

Alternatively, **Rutter** or **Merge.dev** offer unified accounting APIs that abstract QBO/Xero/FreshBooks behind one interface. Cost is ~$100-300/month. Worth evaluating if you want to support multiple accounting platforms without maintaining two integrations.

**Effort:** High (7-10 days). Accounting APIs have more edge cases than any other category (chart of accounts mapping, tax codes, multi-currency, etc.).
**Priority:** Phase 2. Important but not urgent — manual entry works until volume makes it painful. Stripe comes first.

**Schema impact:**
- Add `qbo_invoice_id` (text, nullable) to `invoices`
- Add `qbo_expense_id` (text, nullable) to `expenses`
- Add `qbo_customer_id` (text, nullable) to `companies`

---

## 4. Sales

### 4A. Apollo.io — Prospect Enrichment (Partially Built)

**What it does:**
The schema already has `apolloContactId` on `contacts` and `prospects`, `apolloOrganizationId` on `companies` and `prospects`, and a full `apolloSyncLog` table. The `prospects` table has `companyDomain`, `companySize`, `location`, `title` — all Apollo-enrichable fields. The `touchChannelEnum` includes `"apollo"`.

This integration deepens what's already there:
1. **Search and import**: Search Apollo's database by industry/title/location from the prospects UI. Import results directly into the `prospects` table.
2. **Enrichment**: For manually-added prospects or Calendly leads, call Apollo's enrichment API to fill in title, company size, LinkedIn URL, and other firmographic data.
3. **Sequence sync**: If using Apollo sequences for outreach, sync email open/reply events back as `prospectTouches`.

**Why it matters:**
Cold outreach is a numbers game with a quality multiplier. Apollo gives you the numbers (volume of prospects). Enrichment gives you the quality (you know who you're emailing). Having this inside the dashboard instead of tab-switching to Apollo means the sales pipeline is one continuous flow from prospect -> touch -> warm -> converted -> engagement.

**Technical approach:**
- Apollo REST API. API key auth (simpler than OAuth).
- **Search endpoint**: `POST /v1/mixed_people/search` with filters (title, industry, location, company size). Map results to `prospects` table fields.
- **Enrichment endpoint**: `POST /v1/people/match` with email. Update prospect/contact with returned data.
- **Bulk operations**: Apollo's bulk endpoints for importing lists. Rate limit to 100 req/min on the Basic plan.
- Log all sync operations to `apolloSyncLog` (already in schema).

**Build vs. buy:**
Build. The schema is already designed for this. Apollo's API is the data source; the integration is straightforward CRUD mapping.

**Effort:** Medium (3-5 days). The search/import UI is the main work — the API calls themselves are simple.
**Priority:** Phase 1. The schema is ready, the prospect pipeline exists, and this directly drives revenue.

**Schema impact:** Minimal — the schema already has the right columns. Possibly add:
- `apollo_enriched_at` (timestamp, nullable) to `prospects` and `contacts`

---

### 4B. LinkedIn — Profile Enrichment and Activity Tracking

**What it does:**
The schema has `linkedinUrl` on both `contacts` and `prospects`. This integration:
1. **Profile preview**: When viewing a contact/prospect with a LinkedIn URL, show an embedded preview (photo, headline, recent activity) pulled from LinkedIn.
2. **Connection tracking**: Log LinkedIn connection requests and messages as `prospectTouches` with channel `"linkedin"`.
3. **Enrichment fallback**: For prospects without Apollo data, scrape public LinkedIn profiles for title, company, and location.

**Why it matters:**
LinkedIn is the primary channel for agency business development. Having LinkedIn context visible in the dashboard without switching tabs saves time and keeps outreach organized.

**Technical approach:**
- LinkedIn's official API is extremely restricted (requires Marketing Developer Platform partnership). **Do not rely on it.**
- **Realistic approach**: Use LinkedIn URLs as deep links (click to open in LinkedIn). For enrichment, use Apollo (which aggregates LinkedIn data). For activity tracking, log manually via the `prospectTouches` table or use a browser extension that posts to a STRVX webhook.
- **Stretch**: Integrate with a tool like **Phantombuster** or **Apify** for LinkedIn data extraction (scraping). Be aware of LinkedIn's ToS — this is a gray area.

**Build vs. buy:**
Buy/hybrid. LinkedIn's API restrictions make direct integration impractical. Use Apollo for data, manual logging for touches, and consider a third-party scraping tool only if volume justifies the risk.

**Effort:** Low (1 day for deep links + manual logging). High (5+ days for scraping pipeline, with ongoing maintenance risk).
**Priority:** Phase 3. Apollo covers the enrichment use case. LinkedIn deep links are trivial and should be in Phase 1 as part of the UI, not as a separate integration.

**Schema impact:** None needed — `linkedin_url` already exists on both tables.

---

### 4C. Calendly — Webhook Enhancement (Already Built)

**What it does:**
The Calendly webhook at `/api/webhooks/calendly/route.ts` is already live. It handles `invitee.created` events: creates a company, contact, and engagement (stage: "lead") with an interaction record. Signature verification is implemented.

**What to improve:**
1. **Handle `invitee.canceled`**: Update the interaction or add a cancellation note.
2. **Handle rescheduling**: `invitee.created` fires again for reschedules — detect and update rather than duplicate.
3. **Smarter company matching**: Currently uses `"LastName (via Calendly)"` as company name. Instead, check if a company with a matching domain (extract from email) already exists before creating a new one.
4. **Pre-populate calendar event**: Create a `calendarEvents` row (not just an interaction) so the meeting shows on the calendar view.
5. **Link to existing prospects**: If the invitee email matches a `prospects.email`, update the prospect stage to `"warm"` and link via `prospects.contactId`.

**Build vs. buy:**
Build. It's already built — these are enhancements to existing code.

**Effort:** Low (1-2 days for all improvements).
**Priority:** Phase 1. Quick wins on existing infrastructure.

**Schema impact:** None.

---

## 5. Development

### 5A. GitHub — Project Progress Tracking

**What it does:**
Connects STRVX client projects to their GitHub repositories. Surfaces in the dashboard:
- Open PRs and their review status
- Commit activity (last commit date, frequency)
- Open issues count
- Milestone progress (% complete)
- Deploy status (if using GitHub Actions)

Links this data to the `projects` table so when viewing a project in the dashboard, you see live dev progress without opening GitHub.

**Why it matters:**
Client projects are the product. Knowing whether a project is actively being developed, stuck in review, or idle — without opening GitHub — helps the team prioritize and gives accurate status for client check-ins. When a client asks "how's the project going?", the answer is on the dashboard.

**Technical approach:**
- **GitHub App** (preferred over personal access tokens for org-level access and webhook support).
- **Webhooks**: Register for `push`, `pull_request`, `issues`, `deployment_status` events. Process and store relevant data.
- **REST/GraphQL API**: On-demand queries for PR list, milestone progress, commit history.
- Store `github_repo` (e.g., `strvx/client-project`) on the `projects` table. Use it as the lookup key.
- Display as a "Dev Status" card on the project detail page.

**Build vs. buy:**
Build. GitHub's API is excellent. The display is custom to our project model.

**Effort:** Medium (3-5 days). GitHub App setup, webhook handling, and a good UI for the data.
**Priority:** Phase 2. Useful for operational awareness, but not revenue-critical.

**Schema impact:**
- Add `github_repo` (text, nullable) to `projects`
- Add `github_app_installation_id` (integer, nullable) to a global config table
- Create `github_events` table (id, project_id, event_type, payload jsonb, created_at) for raw event storage

---

### 5B. Vercel — Deploy Status

**What it does:**
Shows deploy status for each project in the dashboard. When a deployment succeeds or fails, update the project status and show a badge. Optionally: trigger a Slack notification on deploy failure.

**Why it matters:**
Deploy failures on client projects need immediate attention. If a deploy breaks at 11 PM and nobody notices until the client emails, that's a bad look. A deploy status badge in the dashboard (and a Slack ping) means the team knows instantly.

**Technical approach:**
- **Vercel Webhooks** (Integration webhooks): Register for `deployment.created`, `deployment.succeeded`, `deployment.error` events.
- Match the Vercel project to a `projects` row via project name or a stored `vercel_project_id`.
- Update a `deploy_status` field on the project record and display as a badge.
- Combine with Slack notifications (Section 2A) for failures.

**Build vs. buy:**
Build. Vercel's webhook system is simple and well-documented.

**Effort:** Low (1-2 days).
**Priority:** Phase 2. Pairs naturally with GitHub integration.

**Schema impact:**
- Add `vercel_project_id` (text, nullable) to `projects`
- Add `deploy_status` (text, nullable) to `projects` — values like "deployed", "building", "failed"
- Add `last_deploy_at` (timestamp, nullable) to `projects`
- Add `deploy_url` (text, nullable) to `projects`

---

## 6. AI / Automation

### 6A. OpenAI / Claude API — Intelligent Assistants

**What it does:**
AI-powered features layered on top of dashboard data:

1. **Meeting summary generator**: Takes a Zoom transcript (Section 2B) or manual meeting notes and generates a structured summary with key decisions, action items, and follow-ups. Auto-creates `nextActions` rows from extracted action items.

2. **Email draft composer**: Given an engagement context (stage, last interaction, deal value), generate a contextually appropriate email draft. "Draft a follow-up email for the Acme proposal we sent last week" — the AI has full context from the engagement timeline.

3. **Engagement insights**: Analyze an engagement's timeline to surface patterns: "This deal has been in negotiation for 3 weeks with no activity — suggest a nudge email?" or "Similar deals at this stage have a 40% close rate."

4. **Prospect outreach personalization**: Given a prospect's Apollo data (title, company, industry), generate a personalized cold email referencing their specific context.

5. **Weekly briefing**: Auto-generate a Monday morning briefing summarizing: pipeline changes, upcoming meetings, overdue tasks, revenue collected, and suggested priorities for the week.

**Why it matters:**
A 3-person agency cannot hire a sales ops person, a meeting note-taker, or a marketing copywriter. AI fills these roles for pennies. The key insight is that AI is dramatically more useful when it has context — and the STRVX dashboard has all the context. Generic AI tools (ChatGPT in a browser tab) lack this context. Dashboard-integrated AI is 10x more useful.

**Technical approach:**
- **Claude API** (Anthropic) for text generation — better at structured output, longer context windows, and nuanced writing.
- Create a `lib/ai/` module with provider-agnostic functions: `summarizeMeeting(transcript)`, `draftEmail(engagement, prompt)`, `generateBriefing(dateRange)`.
- Use **structured output** (JSON mode / tool use) for action item extraction.
- Serve via Next.js Server Actions or API routes. Stream responses for better UX.
- Budget: ~$20-50/month at agency scale (a few hundred API calls/month).
- **Prompt management**: Store prompt templates in the codebase (not the DB) for version control. Include engagement context as system prompts.

**Build vs. buy:**
Build. The value is in the context injection (engagement data, timeline, prospect info). No off-the-shelf tool can do this. The AI API calls themselves are simple; the hard part is designing the right prompts and context windows.

**Effort:** Medium per feature (2-3 days each). Start with meeting summaries (highest standalone value), then email drafts, then weekly briefing.
**Priority:** Phase 3 for meeting summaries and email drafts. Phase 3 for insights and briefing. But start with a simple "summarize this" button in Phase 2 as a proof of concept.

**Schema impact:**
- Add `ai_summary` (text, nullable) to `interactions` (for meeting summaries)
- Create `ai_generations` table for audit trail (id, type, input_context jsonb, output text, model text, tokens_used integer, created_at)

---

### 6B. Zapier / n8n — Catch-All Automation

**What it does:**
For integrations that don't justify custom code, use Zapier (hosted) or n8n (self-hosted) as a glue layer. Examples:
- When an invoice is marked "paid" in Stripe, send a thank-you email via Gmail
- When a prospect replies to a cold email, move them from "cold" to "warm"
- Cross-post marketing content from `marketingPosts` to LinkedIn/Twitter
- Sync form submissions from client websites to the prospect pipeline

**Why it matters:**
Not every automation justifies a custom API route. Zapier/n8n handles the long tail of "when X happens, do Y" workflows that are too minor to build but too tedious to do manually.

**Technical approach:**
- **Expose STRVX data via webhooks**: Create a generic webhook endpoint that Zapier/n8n can subscribe to. Emit events for key state changes (engagement stage change, invoice status change, task completion).
- **Expose STRVX API for inbound**: Create authenticated API endpoints that Zapier/n8n can call to create/update records (e.g., create a prospect from a Typeform submission).
- **n8n self-hosted** (recommended over Zapier for cost at scale): Deploy on a cheap VPS. Unlimited workflows, no per-task pricing.

**Build vs. buy:**
Buy (n8n is free self-hosted). The STRVX side is just exposing API endpoints and webhook events — work that benefits all other integrations too.

**Effort:** Low for the STRVX side (2-3 days to build event emission and API endpoints). Ongoing for individual workflows.
**Priority:** Phase 2. Build the event/API layer early so it's available for all integrations.

**Schema impact:**
- Create `webhook_subscriptions` table (id, url, events text[], secret text, active boolean, created_at)
- Create `webhook_deliveries` table (id, subscription_id, event text, payload jsonb, status text, response_code integer, created_at)

---

## 7. Integration Architecture

All integrations share common infrastructure. Build this foundation before (or alongside) Phase 1 integrations.

### 7A. OAuth Token Management

**Problem:** Gmail, Google Calendar, Google Drive, Stripe, QuickBooks, Zoom, and GitHub all require OAuth tokens. Tokens expire. Refresh tokens can be revoked. A single broken token silently breaks an entire integration.

**Design:**

```
integration_tokens
├── id (uuid, PK)
├── provider (text) — "google", "stripe", "zoom", "github", "quickbooks"
├── user_id (uuid, FK -> users) — nullable for service-level tokens
├── access_token (text, encrypted)
├── refresh_token (text, encrypted)
├── token_type (text)
├── scopes (text[])
├── expires_at (timestamp)
├── last_refreshed_at (timestamp)
├── status (text) — "active", "expired", "revoked", "error"
├── error_message (text)
├── created_at (timestamp)
└── updated_at (timestamp)
```

**Key decisions:**
- **Encrypt tokens at rest** using Supabase Vault or application-level encryption (AES-256-GCM with a key from environment variables). Never store OAuth tokens in plaintext.
- **Proactive refresh**: A background job checks tokens expiring in the next 10 minutes and refreshes them. Don't wait for a 401 to discover expiration.
- **Health dashboard**: Show integration status on the Settings page — green/yellow/red per provider. Yellow = token expiring soon. Red = token invalid.
- **Re-auth flow**: When a token is revoked or refresh fails, surface a "reconnect" button in the UI that kicks off the OAuth flow again.

### 7B. Webhook Patterns

**Problem:** Calendly already uses a webhook. Gmail, Stripe, Zoom, GitHub, and Vercel will add more. Each has different signature verification, payload formats, and retry behavior.

**Design:**

Create a unified webhook infrastructure:

```
/api/webhooks/
├── calendly/route.ts    (already exists)
├── stripe/route.ts
├── gmail/route.ts
├── zoom/route.ts
├── github/route.ts
├── vercel/route.ts
└── _lib/
    ├── verify.ts         — signature verification per provider
    ├── parse.ts          — normalize payloads to internal events
    └── dispatch.ts       — route events to handlers
```

**Patterns to implement:**
1. **Signature verification**: Each provider has a different scheme (HMAC-SHA256, RSA, etc.). Centralize in `verify.ts` with a provider-specific strategy.
2. **Idempotency**: Store processed webhook IDs in a `webhook_events` table. Check before processing. The Calendly webhook already does a form of this (checking for URI in content), but it should use a dedicated table.
3. **Async processing**: Return 200 immediately, then process asynchronously. Use Supabase Edge Functions or a simple job queue (pg-boss on Supabase's Postgres). Providers retry on non-2xx responses, so fast acknowledgment prevents duplicate deliveries.
4. **Dead letter queue**: Failed webhook processing goes to a `webhook_failures` table for manual review and replay.

```
webhook_events
├── id (uuid, PK)
├── provider (text)
├── external_id (text) — provider's event ID
├── event_type (text) — normalized event name
├── payload (jsonb)
├── status (text) — "received", "processing", "completed", "failed"
├── error_message (text)
├── attempts (integer)
├── processed_at (timestamp)
├── created_at (timestamp)
└── UNIQUE(provider, external_id)
```

### 7C. Integration Adapter Pattern

**Problem:** Each integration has different API clients, auth mechanisms, rate limits, and error handling. Without a pattern, the codebase becomes a tangle of provider-specific code scattered across API routes.

**Design:**

```typescript
// lib/integrations/types.ts
interface IntegrationAdapter<TConfig = unknown> {
  provider: string;
  healthCheck(): Promise<IntegrationHealth>;
  sync(direction: "push" | "pull" | "both"): Promise<SyncResult>;
  handleWebhook(event: WebhookEvent): Promise<void>;
}

// lib/integrations/google/gmail.ts
class GmailAdapter implements IntegrationAdapter { ... }

// lib/integrations/stripe/stripe.ts
class StripeAdapter implements IntegrationAdapter { ... }

// lib/integrations/registry.ts
const integrations = new Map<string, IntegrationAdapter>();
integrations.set("gmail", new GmailAdapter());
integrations.set("stripe", new StripeAdapter());
```

**Benefits:**
- Consistent error handling and logging across all integrations
- Easy to add new integrations — implement the interface, register, done
- Health check dashboard queries all adapters uniformly
- Sync operations can be triggered from a single "sync all" button or cron job

### 7D. Health Monitoring and Sync State

**Design:**

```
integration_sync_state
├── id (uuid, PK)
├── provider (text)
├── resource_type (text) — "emails", "calendar_events", "invoices"
├── last_sync_at (timestamp)
├── last_sync_cursor (text) — provider-specific cursor (historyId, syncToken, etc.)
├── last_sync_status (text) — "success", "partial", "failed"
├── last_error (text)
├── records_synced (integer)
├── next_sync_at (timestamp)
├── created_at (timestamp)
└── updated_at (timestamp)
```

**Monitoring approach:**
- Each adapter reports health via `healthCheck()`: token valid, API reachable, last sync recent.
- A `/settings/integrations` page in the dashboard shows all integrations with status indicators.
- If any integration is unhealthy for >1 hour, fire a Slack notification (Section 2A) to `#ops`.
- Weekly sync stats: how many records synced, any failures, data freshness per integration.

---

## Implementation Priority Matrix

| Integration | Revenue Impact | Effort | Dependencies | Phase |
|---|---|---|---|---|
| Slack notifications | High (awareness) | Low (1-2 days) | None | **1** |
| Apollo enrichment | High (pipeline) | Medium (3-5 days) | None | **1** |
| Calendly improvements | Medium (lead quality) | Low (1-2 days) | None | **1** |
| Stripe payments | Critical (cash flow) | Medium (3-5 days) | None | **1** |
| Gmail auto-logging | High (timeline trust) | Medium (3-5 days) | OAuth infra | **1** |
| Integration infra (OAuth, webhooks, adapters) | Foundation | Medium (3-5 days) | None | **1** |
| Google Calendar sync | Medium (scheduling) | Medium-High (5-7 days) | OAuth infra | **2** |
| Google Drive folders | Low (organization) | Low (1-2 days) | OAuth infra | **2** |
| GitHub project tracking | Medium (operations) | Medium (3-5 days) | None | **2** |
| Vercel deploy status | Medium (operations) | Low (1-2 days) | None | **2** |
| n8n / webhook API layer | Medium (extensibility) | Low-Medium (2-3 days) | Webhook infra | **2** |
| QuickBooks/Xero accounting | Medium (compliance) | High (7-10 days) | OAuth infra, Stripe | **2** |
| AI meeting summaries | High (productivity) | Medium (2-3 days) | Zoom transcripts | **3** |
| AI email drafts | Medium (productivity) | Medium (2-3 days) | Gmail integration | **3** |
| AI weekly briefing | Medium (awareness) | Medium (2-3 days) | All Phase 1-2 data | **3** |
| Zoom transcripts | Medium (knowledge) | Medium (3-4 days) | AI summarizer | **3** |
| LinkedIn enrichment | Low (Apollo covers it) | Varies | Apollo | **3** |

---

## Phase 1 Estimated Total: 15-22 days

**Deliverables:**
1. Integration infrastructure (OAuth table, webhook event table, adapter pattern, sync state table)
2. Slack notifications for deal events, new leads, overdue invoices
3. Apollo search/import/enrichment in the prospects UI
4. Calendly webhook improvements (smarter matching, calendar event creation, prospect linking)
5. Stripe checkout integration for invoice payments
6. Gmail auto-logging to engagement timeline

**Outcome:** The dashboard becomes the single pane of glass for revenue operations. Leads flow in automatically (Calendly), get enriched (Apollo), progress through the pipeline with full email history (Gmail), close with payment tracking (Stripe), and the whole team stays aware (Slack).

## Phase 2 Estimated Total: 18-28 days

**Deliverables:**
1. Google Calendar bidirectional sync
2. Google Drive auto-folder creation
3. GitHub project progress cards
4. Vercel deploy status badges
5. n8n self-hosted + webhook/API layer for catch-all automation
6. QuickBooks or Xero accounting sync

**Outcome:** The dashboard becomes the operational command center. Scheduling, project status, deploy health, and financial books are all visible and synchronized.

## Phase 3 Estimated Total: 12-18 days

**Deliverables:**
1. AI meeting summarizer (Zoom transcript -> structured summary -> timeline)
2. AI email draft composer with engagement context
3. AI weekly briefing generator
4. Zoom meeting link auto-generation
5. LinkedIn deep links and optional enrichment pipeline

**Outcome:** The dashboard starts working for you. AI handles the cognitive overhead of summarizing, drafting, and briefing — freeing the team to focus on building and selling.

---

## Appendix: Schema Migration Summary

All new columns and tables required across all phases:

**New columns on existing tables:**
- `interactions`: `gmail_message_id`, `gmail_thread_id`, `ai_summary`
- `calendar_events`: `google_event_id`, `synced_at`, `zoom_meeting_id`
- `projects`: `drive_folder_url`, `drive_folder_id`, `github_repo`, `vercel_project_id`, `deploy_status`, `last_deploy_at`, `deploy_url`
- `invoices`: `stripe_payment_link`, `stripe_checkout_session_id`
- `companies`: `stripe_customer_id`, `qbo_customer_id`
- `engagements`: `stripe_subscription_id`
- `expenses`: `qbo_expense_id`
- `prospects`: `apollo_enriched_at`
- `contacts`: `apollo_enriched_at`

**New tables:**
- `integration_tokens` — OAuth token storage (encrypted)
- `integration_sync_state` — per-provider sync cursors and status
- `webhook_events` — idempotent webhook processing log
- `webhook_subscriptions` — outbound webhook subscriptions (for n8n/Zapier)
- `webhook_deliveries` — outbound webhook delivery log
- `ai_generations` — AI usage audit trail
- `github_events` — raw GitHub webhook event storage
