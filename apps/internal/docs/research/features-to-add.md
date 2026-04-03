# STRVX Internal Tool — Feature Research

**Date:** 2026-03-30
**Scope:** Comprehensive feature roadmap for the STRVX agency CRM and operations dashboard

---

## Current State Summary

The tool today covers six areas across the sidebar: CRM (Dashboard, Pipeline, Clients, Contacts, Tasks), Projects (Projects, Calendar), Outreach (Outreach, Marketing), Finance (Finances, Invoices), Goals, and Knowledge (Assets, Docs, Templates, Toolbox).

**What exists and works:**
- Kanban pipeline board with drag-and-drop stage management (lead through closed_won/lost)
- Client/engagement detail views with timeline, next actions, and stage history
- Task board with Kanban columns, priority, due dates, and assignment
- Calendar with week/month views and event creation
- Outreach prospect management with stage tracking (cold/warm/hot/converted), touch logging, and industry segmentation
- Finances page with P&L overview, revenue by month/client, expense CRUD, pipeline forecast
- Invoice listing with status tracking (draft/sent/paid/overdue)
- Marketing post management across LinkedIn, Nextdoor, X
- Goals page with revenue milestones and team rewards
- Knowledge base with docs (TipTap editor), templates, asset/folder tree, and toolbox
- Supabase auth, Drizzle ORM on Postgres, real-time subscriptions, server actions
- Command palette (cmdk) for quick navigation

**What is notably missing:**
- No time tracking anywhere
- No email/Slack/calendar integrations (all manual entry)
- No automated reporting or client-facing views
- No AI-powered features despite STRVX being an AI agency
- Finances still partially mock data; no Stripe integration
- No analytics beyond basic pipeline counts and revenue charts
- No team workload or capacity visibility
- No recurring revenue (MRR) tracking beyond a hardcoded `$2,000` constant

---

## 1. Features That Would Transform the Daily Workflow

### 1.1 Time Tracking Per Project/Engagement

**What it does:** Built-in timer and manual time entry linked to projects, engagements, and tasks. Each cofounder starts/stops a timer or logs hours after the fact. Weekly timesheet view shows where hours went.

**Why it matters:** A 3-person agency needs to know where time goes — not for micromanagement, but for profitability analysis. Without this, you cannot calculate real cost per project, which means you cannot price future work accurately. It also feeds directly into invoice generation (billable hours) and capacity planning.

**Data model addition:**
```
time_entries: id, user_id, project_id?, engagement_id?, task_id?, description, duration_minutes, started_at, ended_at, billable (bool), billed_invoice_id?
```

**Implementation complexity:** Medium — new DB table, timer component (floating or in sidebar), timesheet page, integration points on project/task detail views.

**Priority:** Must-have. This is foundational for revenue, profitability, and invoicing features.

---

### 1.2 Client Communication Auto-Logging (Gmail Integration)

**What it does:** Connects to the team Gmail accounts and automatically logs emails sent to/from client contacts as interactions on the engagement timeline. Uses the existing `contacts.email` field to match. Surfaces email threads inline on the client detail page without leaving the tool.

**Why it matters:** Right now, every client interaction has to be manually logged as a "note" or "meeting" in the timeline. With three cofounders all emailing clients, things slip through cracks. Auto-logging means the engagement timeline becomes the single source of truth without extra effort.

**Technical approach:** Gmail API via OAuth2 — the Claude MCP tools already show Gmail integration capability. Periodic sync (every 5 min) pulls recent threads, matches sender/recipient against `contacts.email`, and creates `interactions` records with type `"email"`. Store Gmail thread IDs to avoid duplicates.

**Implementation complexity:** High — OAuth flow, background sync job (Supabase Edge Function or cron), email thread rendering, duplicate detection, privacy controls (which emails to log).

**Priority:** Must-have. The single highest-ROI integration for reducing manual work.

---

### 1.3 Slack Notifications for Pipeline and Task Events

**What it does:** Posts to a dedicated Slack channel (e.g., `#strvx-crm`) when key events happen: deal moves stages, new engagement created, task overdue, invoice paid, meeting in 30 minutes. Each cofounder can also get DMs for their own action items.

**Why it matters:** With 3 people wearing many hats, nobody is going to sit in the CRM all day refreshing the dashboard. Slack is where you already live. Push notifications into the existing workflow rather than requiring people to pull from a new tool.

**Technical approach:** Slack Incoming Webhooks (simplest) or Slack Bot (richer). Fire from server actions — when `changeStage()` runs, also call `notifySlack()`. The Supabase realtime subscriptions could also trigger notifications via a Supabase Edge Function listener.

**Implementation complexity:** Low — Slack webhook is ~20 lines of code per notification type. A Supabase database webhook listening to `engagements` and `next_actions` table changes can automate most of it.

**Priority:** Must-have. Highest value-to-effort ratio of any feature on this list.

---

### 1.4 Smart Daily Briefing

**What it does:** Every morning at 8 AM, each cofounder gets a personalized digest (Slack DM or email) containing: today's meetings, overdue actions, deals that haven't been touched in 7+ days (stale engagements query already exists in `queries.ts`), invoices coming due, and any stage changes from yesterday.

**Why it matters:** The dashboard already shows overdue actions and meetings today — but you have to open it. A push-based briefing means the first thing you see when you start your day is exactly what needs attention. For a 3-person team, this alone can prevent deals from going cold.

**Technical approach:** Supabase Edge Function on a cron schedule. Queries already exist (`getAtRiskItems`, overdue actions, stale engagements). Format as Slack blocks or email HTML. User preference for delivery channel stored in `users` table.

**Implementation complexity:** Medium — the queries exist, the formatting and scheduling are the new work.

**Priority:** Must-have.

---

### 1.5 Team Workload Visualization

**What it does:** A view (on the dashboard or a dedicated page) showing each cofounder's current load: active tasks by priority, upcoming meetings this week, hours logged (requires time tracking), and number of active engagements they own. Visual indicators for overloaded vs. underutilized.

**Why it matters:** When one person is drowning in deliverables while another has capacity, you need to see that at a glance — not discover it when something drops. With only 3 people, even one person being blocked cascades quickly.

**Data model:** No new tables. Aggregates from `tasks` (assignee_id), `next_actions` (owner_id), `calendar_events` (created_by), and `time_entries` (user_id) if built.

**Implementation complexity:** Low-Medium — pure frontend aggregation of existing data. The time tracking component makes it much more useful but isn't strictly required for v1.

**Priority:** Nice-to-have (becomes must-have once time tracking exists).

---

### 1.6 Quick Capture / Global Inbox

**What it does:** Extends the existing command palette (cmdk) to support quick capture: hit `Cmd+K`, type "note for Custos: discussed new auth flow", and it creates an interaction on the Custos engagement without navigating away. Same for tasks: "todo: send proposal to Dr. Bob by Friday" creates a task with due date parsed from natural language.

**Why it matters:** The quick-add bar exists but requires specific form fields. Natural language capture reduces friction to near-zero. When you're on a call and need to log something fast, every click matters.

**Technical approach:** Parse natural language input in the command palette. Match engagement names (fuzzy search against `engagements.name`), extract dates ("by Friday", "next week"), detect intent (note vs. task vs. meeting). Can be done with simple regex patterns initially, or with an LLM call for smarter parsing.

**Implementation complexity:** Medium — the command palette infrastructure exists. NLP parsing is the hard part.

**Priority:** Nice-to-have (high quality-of-life improvement).

---

## 2. Revenue & Growth Features

### 2.1 Recurring Revenue (MRR) Tracking

**What it does:** Replaces the hardcoded `const mrr = 2000` with actual tracking. Each engagement with `maintenance_opted_in = true` contributes its `maintenance_monthly_fee` to MRR. Dashboard shows MRR trend over time, churn (clients who dropped maintenance), and net revenue retention.

**Why it matters:** Maintenance contracts are STRVX's most valuable revenue — predictable, recurring, and high-margin. You need to know your real MRR, see it trend over months, and catch churn early (the `maintenance_next_checkin` field exists but isn't surfaced anywhere).

**Data model addition:**
```
mrr_snapshots: id, month (date), total_mrr, new_mrr, churned_mrr, expansion_mrr, engagement_count, snapshot_at
```
A monthly cron job snapshots current MRR from active maintenance engagements.

**Implementation complexity:** Low-Medium — the schema fields exist. Need a snapshot mechanism, a chart, and alerting when a maintenance client's check-in date passes without interaction.

**Priority:** Must-have. This is real money that's currently invisible.

---

### 2.2 Revenue Forecasting Based on Pipeline

**What it does:** Takes every active engagement's `deal_value * probability` and plots it against `expected_close_date` to produce a revenue forecast by month for the next 6-12 months. Overlays actual closed revenue to show forecast accuracy over time.

**Why it matters:** The pipeline forecast panel in Finances already shows weighted pipeline total. But it doesn't answer "what will our revenue look like in Q3?" — which is the question that drives hiring, tool purchases, and investment decisions.

**Technical approach:** The data already exists in `engagements` (deal_value, probability, expected_close_date). Group by month, sum weighted values. Store historical forecasts to compare against actuals.

**Implementation complexity:** Low — mostly a visualization exercise. The data is there.

**Priority:** Must-have.

---

### 2.3 Client Lifetime Value (CLV) Calculations

**What it does:** For each company, calculates total revenue across all engagements (project fees + maintenance revenue), total cost (time tracked * internal rate), and net profit. Ranks clients by lifetime value. Shows which client relationships are most valuable and which are underwater.

**Why it matters:** Not all clients are equal. A client who paid $50k for a project but required 600 hours of work at $150/hr internal cost is actually a loss. Knowing CLV helps STRVX decide which client relationships to invest in, which to upsell, and which to respectfully sunset.

**Data model:** Requires time tracking (section 1.1) to calculate cost side. Revenue side already available from invoices.

**Implementation complexity:** Medium — depends on time tracking being in place. The calculations themselves are straightforward aggregations.

**Priority:** Nice-to-have (becomes must-have at 10+ clients).

---

### 2.4 Profitability Per Project

**What it does:** On each project detail page, shows: total invoiced, total hours logged, effective hourly rate, budget consumed vs. remaining, and projected overrun/underrun based on current pace. Traffic-light indicator: green (on budget), yellow (75%+ consumed), red (over budget).

**Why it matters:** You are currently flying blind on project profitability. The `projects` table has no budget field and no link to time or cost data. This is how agencies die — they deliver great work but lose money on every project because scope creep goes untracked.

**Data model addition:** Add `budget` (numeric) and `budgetType` ("fixed" | "hourly") to `projects` table. Time entries provide the actual cost.

**Implementation complexity:** Medium — requires time tracking. UI is straightforward.

**Priority:** Must-have once time tracking exists.

---

### 2.5 Automated Invoice Generation from Milestones

**What it does:** When a project hits certain milestones (e.g., "discovery complete", "MVP delivered", "project handoff"), auto-generate a draft invoice with the correct line items and amounts based on the project's payment schedule. Notify the team for review before sending.

**Why it matters:** Manual invoice creation is error-prone and gets delayed. Late invoicing = late payment = cash flow problems. With only 3 people, nobody is a dedicated "billing person" — automation ensures invoices go out on time.

**Data model addition:**
```
project_milestones: id, project_id, name, invoice_amount, invoice_trigger (bool), completed_at
payment_schedules: id, engagement_id, milestone_name, amount, percentage, due_on_stage
```

**Technical approach:** When a project status changes or a milestone is marked complete, check if it has an invoice trigger. If yes, create a draft invoice using the existing `invoices` table with pre-filled line items.

**Implementation complexity:** Medium — new tables, milestone UI on project detail, trigger logic in server actions.

**Priority:** Nice-to-have (high value once there are 5+ active projects).

---

### 2.6 Stripe Integration for Invoice Payments

**What it does:** Generate a Stripe Payment Link for each invoice. Client clicks the link, pays with card or ACH. Payment status syncs back to update invoice status automatically. Dashboard shows real-time payment status.

**Why it matters:** Currently invoice status is manually updated. With Stripe, you get automatic payment tracking, payment reminders, and a professional payment experience for clients. ACH support is critical for B2B — lower fees and higher amounts.

**Technical approach:** Stripe Checkout Sessions or Payment Links API. Webhook listener (Next.js API route) to update invoice status on payment. Store `stripe_payment_intent_id` and `stripe_payment_link` on invoices table.

**Implementation complexity:** Medium — Stripe SDK integration, webhook handler, invoice table schema additions.

**Priority:** Must-have for scaling beyond 5 clients.

---

## 3. AI-Powered Features

### 3.1 AI Meeting Notes Summarization

**What it does:** After a meeting, paste the transcript (from Zoom AI companion, Otter.ai, or manual notes) into the meeting interaction. AI generates a structured summary: key decisions, action items, open questions, and next steps. Action items are auto-created as `next_actions` on the engagement.

**Why it matters:** STRVX builds AI products — using AI in your own workflow is table stakes. More practically, meeting notes are the #1 thing that falls through cracks. If the summary auto-generates tasks, nothing gets lost.

**Technical approach:** Claude API call (the Anthropic SDK is a natural fit). Input: raw transcript + engagement context (stage, recent interactions). Output: structured JSON with summary, action_items[], decisions[], questions[]. Parse and insert into DB.

**Implementation complexity:** Medium — API call is simple. The UX for paste-and-process, review-before-saving, and error handling takes more thought.

**Priority:** Must-have. This is the single most impactful AI feature and also serves as a showcase for what STRVX builds.

---

### 3.2 Smart Follow-Up Suggestions

**What it does:** When viewing an engagement, AI analyzes the timeline (interactions, stage, time since last contact, upcoming expected close date) and suggests the next best action. Examples: "It's been 5 days since the proposal was sent — suggest a check-in email", "Discovery call was 2 weeks ago with no follow-up — engagement at risk", "Client mentioned budget review in Q2 — set a reminder for April 1."

**Why it matters:** The "attention list" on the dashboard already flags overdue items. This goes further — it proactively suggests what to do, not just what's late. For a 3-person team juggling 10+ engagements, context-aware nudges prevent deals from going cold.

**Technical approach:** Lightweight prompt to Claude with engagement context (stage, timeline, deal value, days since last interaction). Could run on page load for client detail view, or batch-process nightly and store suggestions. Keep it simple — don't over-engineer.

**Implementation complexity:** Low-Medium — the engagement data is already loaded on the client detail page. One API call with a well-crafted prompt.

**Priority:** Must-have.

---

### 3.3 Automatic Task Creation from Meeting Notes

**What it does:** Tightly coupled with 3.1. When meeting notes are summarized, detected action items become `next_actions` or `tasks` with assigned owner (matched from team member names), estimated due dates, and linked engagement. User reviews and confirms before saving.

**Why it matters:** The gap between "we discussed it" and "someone is actually doing it" is where agency work dies. Auto-extracting tasks from meetings closes that gap.

**Technical approach:** Part of the meeting summarization pipeline. Claude output includes structured action items. UI shows a confirmation step where the user can edit/remove items before batch-inserting.

**Implementation complexity:** Low (incremental on top of 3.1).

**Priority:** Must-have (ship with 3.1).

---

### 3.4 Client Sentiment Analysis

**What it does:** Analyzes the tone and sentiment of client interactions over time. Flags when sentiment is trending negative (e.g., emails becoming shorter, more formal, or expressing frustration). Shows a sentiment trend line on the engagement detail page.

**Why it matters:** By the time a client explicitly says "we're unhappy," it's often too late. Sentiment analysis catches drift early — especially useful when multiple team members interact with the same client and nobody has the full picture.

**Technical approach:** Run sentiment analysis on interaction content when it's created. Store a sentiment score (-1 to 1) on each interaction. Aggregate for trend visualization. Can use Claude for nuanced analysis or a lighter model for cost efficiency.

**Data model addition:** Add `sentiment_score` (numeric) to `interactions` table.

**Implementation complexity:** Medium — scoring is easy, making it actionable (alerts, trend visualization) takes more work.

**Priority:** Future. More valuable at scale (10+ active clients).

---

### 3.5 Pipeline Stage Prediction

**What it does:** Based on historical patterns (how long deals typically spend in each stage, what interactions precede stage advancement, deal size patterns), predict the probability of an engagement closing and when. Show predicted close date and confidence alongside the user-entered values.

**Why it matters:** User-entered probability is often a guess. Data-driven prediction improves forecasting accuracy, which cascades into better revenue projections and resource planning.

**Technical approach:** Requires sufficient historical data (20+ closed engagements minimum). Use `stage_history` table to calculate average stage durations. Simple heuristic model initially (no ML needed): "deals at proposal stage with >$50k value close in avg 14 days with 65% probability." Graduate to ML later.

**Implementation complexity:** Medium — data collection happens naturally via stage_history. The prediction logic starts simple.

**Priority:** Future. Need more historical data first.

---

### 3.6 AI-Powered Proposal Drafting

**What it does:** Given an engagement's context (company industry, project scope from discovery notes, deal value, template selection), generate a first draft of a proposal document. Uses the templates in the Knowledge base as structure, fills in client-specific details from the CRM data.

**Why it matters:** Proposal writing is one of the most time-consuming tasks for a small agency. A solid first draft that the team edits is 10x faster than starting from blank. The templates page already exists but is static — this makes them dynamic.

**Technical approach:** Claude API with system prompt containing the selected template structure plus engagement context. Output goes into the docs editor (TipTap). User edits before finalizing.

**Implementation complexity:** Medium — integration between templates, engagement data, Claude API, and the docs editor.

**Priority:** Nice-to-have (high impact, but medium effort).

---

## 4. Integrations Worth Building

### 4.1 Google Calendar Bidirectional Sync

**What it does:** Calendar events created in the STRVX tool sync to Google Calendar, and external Google Calendar events (client meetings booked via Calendly, etc.) sync back into the tool. Events auto-link to engagements when client email matches a contact.

**Why it matters:** The calendar page exists but is isolated. Nobody is going to check two calendars. If client meetings from Google Calendar don't appear in the tool, the engagement timeline is incomplete and the "meetings today" dashboard metric is inaccurate.

**Technical approach:** Google Calendar API with OAuth2. Push: create Google Calendar events when `calendar_events` are created. Pull: periodic sync (every 5 min) imports new/updated events. Match attendee emails against `contacts.email` to auto-link engagements. Store `google_event_id` on `calendar_events` for dedup.

**Implementation complexity:** High — OAuth, bidirectional sync with conflict resolution, attendee matching.

**Priority:** Must-have. The calendar is useless without this.

---

### 4.2 Gmail Integration for Auto-Logging

Covered in detail in section 1.2. Reiterating here for completeness.

**Priority:** Must-have.

---

### 4.3 Slack Integration

Covered in detail in section 1.3. Reiterating here for completeness.

**Additional Slack capabilities worth building:**
- `/strvx pipeline` — Slack command returns current pipeline summary
- `/strvx client [name]` — quick lookup of engagement status from Slack
- Interactive buttons in Slack messages (e.g., "Mark task complete" directly from the notification)

**Priority:** Must-have.

---

### 4.4 Stripe Integration

Covered in detail in section 2.6. Reiterating here for completeness.

**Priority:** Must-have for scaling.

---

### 4.5 GitHub Integration for Project Progress

**What it does:** Links STRVX projects to GitHub repositories. Shows commit activity, open PRs, deployment status, and contributor stats on the project detail page. Auto-creates timeline events when PRs are merged or deployments succeed.

**Why it matters:** For an agency that builds software, GitHub is where the actual work happens. Without this link, project "progress" in the tool is subjective. With it, you can show clients real progress — commits, deployments, velocity.

**Technical approach:** GitHub App or personal access tokens. Webhook listener for push, PR, and deployment events. Store `github_repo_url` on `projects` table. GitHub webhook payloads create `interactions` or project timeline entries.

**Implementation complexity:** Medium — GitHub webhooks are well-documented. The mapping between GitHub repos and STRVX projects needs a clean UX.

**Priority:** Nice-to-have (becomes must-have when the client portal exists).

---

### 4.6 Apollo Integration Enhancement

**What it does:** The schema already has `apollo_contact_id`, `apollo_organization_id`, and an `apollo_sync_log` table. Build out the full integration: import prospects from Apollo searches, sync contact data, enrich existing contacts with Apollo data, and track outreach sequences.

**Why it matters:** The outreach page is sophisticated but currently uses mock data. Apollo is the prospecting engine — connecting it properly means the outreach pipeline fills automatically instead of manually.

**Technical approach:** Apollo API for people/organization search and enrichment. The `prospects` table already has `apollo_contact_id` and `apollo_organization_id` fields. Build a "Search & Import" flow in the outreach UI that queries Apollo and bulk-imports results.

**Implementation complexity:** Medium — API integration is straightforward. Deduplication and data quality are the challenges.

**Priority:** Must-have for outbound sales.

---

### 4.7 Calendly Integration

**What it does:** When a prospect or client books a meeting through STRVX's Calendly, auto-create a calendar event and link it to the correct engagement/prospect. For new bookings from unknown contacts, create a new lead.

**Why it matters:** Calendly is already used for booking (mentioned in STRVX accounts). Every booking is a signal of interest — capturing it automatically means no leads slip through because someone forgot to log the meeting.

**Technical approach:** Calendly webhooks fire on booking creation/cancellation. Match invitee email against contacts or prospects. Create calendar event and optionally a new engagement.

**Implementation complexity:** Low — Calendly webhooks are simple. Email matching logic already needed for Gmail integration.

**Priority:** Nice-to-have.

---

## 5. Analytics & Reporting Dashboard

### 5.1 Win Rate Analytics

**What it does:** Calculates and visualizes win rate (closed_won / (closed_won + closed_lost)) segmented by: source (referral, outreach, inbound), industry, deal size bracket, and time period. Shows trends over time.

**Why it matters:** Knowing your overall win rate is useful. Knowing that referral deals close at 80% while cold outreach closes at 15% changes how you allocate time. Knowing that deals over $100k have a 40% win rate while deals under $25k close at 70% changes pricing strategy.

**Data available:** `engagements` has `source`, `deal_value`, `stage` (closed_won/closed_lost). `companies` has `industry`. `stage_history` has timing data.

**Implementation complexity:** Low — pure aggregation queries and visualization. Data exists.

**Priority:** Must-have.

---

### 5.2 Pipeline Velocity Metrics

**What it does:** Measures average time spent in each pipeline stage, identifies bottlenecks (stages where deals stall), and tracks stage-to-stage conversion rates. Shows which stages have the highest dropout rate.

**Why it matters:** If deals consistently stall at "proposal" for 3 weeks, that's a process problem. Maybe proposals need to be simpler, or follow-up cadence needs to increase. You can't optimize what you can't measure.

**Data available:** `stage_history` table already tracks `entered_at` and `exited_at` for every stage transition. This is the perfect dataset.

**Implementation complexity:** Low — the data model was built for this. Just need the queries and visualization.

**Priority:** Must-have.

---

### 5.3 Revenue Per Team Member

**What it does:** Shows revenue attributed to each cofounder — deals they own (by `primary_contact_id` owner or a new `owner_id` on engagements), hours they've billed, and their effective hourly rate.

**Why it matters:** In a 3-person team where everyone does everything, it's easy to lose track of who's driving revenue vs. who's in delivery mode. This isn't about competition — it's about understanding capacity and ensuring sales doesn't stop when you're deep in a build phase.

**Data model:** Add `owner_id` (references users) to `engagements` table for clear deal ownership.

**Implementation complexity:** Low — one field addition plus aggregation queries.

**Priority:** Nice-to-have.

---

### 5.4 Outreach Conversion Funnel

**What it does:** Visualizes the outreach pipeline as a funnel: total prospects --> contacted --> responded --> meeting booked --> converted to engagement. Shows conversion rate at each step, segmented by channel (email, LinkedIn, phone, referral) and industry.

**Why it matters:** The outreach page tracks individual prospects. The funnel view shows the overall health of the outbound machine. If 200 cold emails yield 2 meetings, the messaging needs work. If 10 LinkedIn connections yield 5 meetings, double down on LinkedIn.

**Data available:** `prospects` has `stage` (cold/warm/hot/converted). `prospect_touches` has channel and direction. The data is there.

**Implementation complexity:** Low — aggregation and visualization.

**Priority:** Must-have.

---

### 5.5 Automated Weekly Report

**What it does:** Every Friday afternoon, generates a one-page weekly report: deals moved, revenue closed, new engagements, tasks completed, hours logged, outreach stats. Formatted as a clean PDF or Slack message. Can optionally be sent to an external stakeholder (e.g., an advisor or investor).

**Why it matters:** Forces a weekly reflection habit. Also creates an audit trail of agency progress that's useful for annual reviews, investor updates, or just looking back to see how far you've come.

**Technical approach:** Cron job (Friday 5 PM). Aggregate data from the past 7 days. Format as Slack blocks (immediate value) or generate PDF via a template (future).

**Implementation complexity:** Medium — data aggregation is straightforward. PDF generation adds complexity if needed.

**Priority:** Nice-to-have.

---

### 5.6 Client Health Score

**What it does:** A composite score per active engagement combining: recency of last interaction, task completion rate, sentiment trend (if 3.4 is built), payment timeliness, and stage progression speed. Displayed as a simple red/yellow/green indicator on the pipeline board and client list.

**Why it matters:** Replaces gut feel with data. When you glance at the pipeline, you immediately see which clients need attention — not just which are overdue, but which are trending poorly across multiple dimensions.

**Implementation complexity:** Medium — requires defining the scoring algorithm and weighting. Data mostly exists.

**Priority:** Nice-to-have (very useful once there are 8+ active engagements).

---

## 6. Client Portal

### 6.1 Should STRVX Build a Client-Facing Portal?

**Yes, but not yet.** Here's the reasoning:

**The case for building it:**
- Reduces back-and-forth communication (clients self-serve for status updates)
- Projects professionalism — clients see a branded portal instead of getting updates over email
- Creates a sticky touchpoint that reinforces the STRVX relationship
- Can showcase STRVX's engineering quality to clients (you're literally showing them your own product)
- Becomes a differentiator in proposals: "You'll have a dedicated client portal for your project"

**The case for waiting:**
- With fewer than 5 active clients, the overhead of building and maintaining a portal outweighs the communication reduction
- Requires authentication, permissions, and data isolation — non-trivial security surface
- Client-facing features need to be polished to a higher standard than internal tools

**Recommendation:** Build it when you have 5+ concurrent active clients, or when a high-value prospect explicitly asks about project visibility. In the meantime, the automated weekly report (5.5) gives clients visibility without a full portal build.

---

### 6.2 What Clients Would See

**Project Dashboard:**
- Current project status and stage (scoping/active/paused/completed)
- Milestone progress bar with completed/upcoming milestones
- Recent activity feed (filtered to client-safe content — no internal notes)
- Next planned deliverable and estimated date

**Deliverables & Files:**
- Shared documents (proposals, SOWs, design mockups)
- Links to staging/production environments
- Version history of key deliverables

**Invoices & Payments:**
- Invoice list with status (draft/sent/paid)
- Payment links (Stripe integration, section 2.6)
- Payment history

**Communication:**
- Threaded comments/messages (like a simplified Slack channel for the project)
- Meeting history with summaries (from AI meeting notes, section 3.1)
- Next scheduled meeting

**What clients would NOT see:**
- Internal discussions and notes
- Profitability metrics
- Time tracking details
- Pipeline/sales data
- Other clients' information

---

### 6.3 How It Reduces Communication

| Without Portal | With Portal |
|---|---|
| Client emails: "What's the status of my project?" | Client checks portal |
| Team sends invoice PDF via email | Client sees invoice in portal, pays via Stripe link |
| Client asks: "When is the next deliverable?" | Milestone timeline is always visible |
| Team sends meeting recap manually | AI summary auto-populates portal |
| Client asks for latest design mockup | Shared files always up to date |

**Estimated communication reduction:** 40-60% of routine status/update inquiries eliminated.

**Implementation complexity:** High — requires a separate auth system (magic links or simple password), data isolation layer, polished UI, and ongoing maintenance.

**Priority:** Future (target: when active client count exceeds 5).

---

## Priority Summary

### Must-Have (build in next 2-4 weeks)

| # | Feature | Complexity | Impact |
|---|---|---|---|
| 1.3 | Slack notifications for pipeline/task events | Low | Very High |
| 2.1 | MRR tracking (replace hardcoded $2k) | Low-Medium | High |
| 2.2 | Revenue forecasting by month | Low | High |
| 5.1 | Win rate analytics by source/industry | Low | High |
| 5.2 | Pipeline velocity metrics (stage_history analysis) | Low | High |
| 5.4 | Outreach conversion funnel | Low | High |
| 1.1 | Time tracking per project/engagement | Medium | Very High |
| 3.1 | AI meeting notes summarization + task extraction | Medium | Very High |
| 3.2 | Smart follow-up suggestions on engagement detail | Low-Medium | High |

### Must-Have (build in 1-2 months)

| # | Feature | Complexity | Impact |
|---|---|---|---|
| 1.2 | Gmail auto-logging of client communications | High | Very High |
| 1.4 | Smart daily briefing (Slack/email digest) | Medium | High |
| 4.1 | Google Calendar bidirectional sync | High | High |
| 4.6 | Apollo integration (full outreach pipeline) | Medium | High |
| 2.6 | Stripe integration for invoice payments | Medium | High |

### Nice-to-Have (build in 2-4 months)

| # | Feature | Complexity | Impact |
|---|---|---|---|
| 1.5 | Team workload visualization | Low-Medium | Medium |
| 1.6 | Quick capture / natural language inbox | Medium | Medium |
| 2.3 | Client lifetime value calculations | Medium | Medium |
| 2.4 | Profitability per project | Medium | High |
| 2.5 | Auto-invoice from milestones | Medium | Medium |
| 3.6 | AI proposal drafting | Medium | Medium |
| 4.5 | GitHub integration for project progress | Medium | Medium |
| 4.7 | Calendly integration | Low | Medium |
| 5.3 | Revenue per team member | Low | Medium |
| 5.5 | Automated weekly report | Medium | Medium |
| 5.6 | Client health score | Medium | Medium |

### Future (build when scale demands it)

| # | Feature | Complexity | Impact |
|---|---|---|---|
| 3.4 | Client sentiment analysis | Medium | Medium |
| 3.5 | Pipeline stage prediction | Medium | Medium |
| 6 | Client portal | High | High |

---

## Implementation Notes

**Quick wins to ship this week:**
1. **Slack webhook notifications** — can be added to existing server actions in `actions.ts` with ~50 lines of code per event type. Start with: stage change, new engagement, task overdue.
2. **MRR calculation** — replace `const mrr = 2000` in `finances-client.tsx` with a real query summing `maintenance_monthly_fee` from engagements where `maintenance_opted_in = true`.
3. **Pipeline velocity** — the `stage_history` table is already being populated. Write one aggregation query and one chart component.

**Architecture considerations:**
- Background jobs (email sync, calendar sync, daily briefing) should use Supabase Edge Functions with `pg_cron` or a lightweight task queue.
- AI features should use the Claude API via a server action wrapper to keep API keys server-side.
- The Stripe webhook handler should be a dedicated API route (`/api/webhooks/stripe`) with signature verification.
- All integrations should fail gracefully — if Gmail API is down, the CRM still works. Never block core workflows on external services.

**Data model additions summary (new tables):**
1. `time_entries` — time tracking
2. `mrr_snapshots` — monthly MRR snapshots
3. `project_milestones` — milestone-based invoicing
4. `integration_tokens` — OAuth tokens for Gmail, Google Calendar, Stripe, GitHub (encrypted)
5. `notification_preferences` — per-user notification channel preferences
6. `ai_suggestions` — cached follow-up suggestions per engagement

**Data model additions summary (new columns on existing tables):**
1. `engagements.owner_id` — deal ownership
2. `interactions.sentiment_score` — AI sentiment
3. `interactions.gmail_thread_id` — email dedup
4. `calendar_events.google_event_id` — calendar sync dedup
5. `invoices.stripe_payment_intent_id`, `invoices.stripe_payment_link` — Stripe
6. `projects.budget`, `projects.budget_type`, `projects.github_repo_url` — project enrichment
7. `users.notification_channel`, `users.slack_user_id` — notification preferences
