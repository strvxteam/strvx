# STRVX Internal Tool — Client Onboarding Flow

> Last updated: 2026-03-30
> Status: Design
> Stack: Next.js + Supabase + Drizzle ORM (PostgreSQL)

---

## Executive Summary

This document defines how a new client flows through the STRVX system from first contact to active project delivery. The onboarding flow maps directly onto the existing engagement stage model (`lead` -> `contacted` -> `discovery` -> `building_mvp` / `proposal` -> `negotiation` -> `build` -> `deliver` -> `maintain`) and connects every table in the schema — companies, contacts, engagements, interactions, next_actions, projects, tasks, calendar_events, invoices, and documents — into a single coherent lifecycle.

STRVX is a 3-person agency. The onboarding flow must be opinionated and automated enough that nobody drops a ball, but lightweight enough that it never feels like busywork. Every form, every automation, every reminder exists because skipping it has cost the team a deal or caused a project to start messy.

---

## 1. Onboarding Stages

### Stage Map

The engagement `stageEnum` already defines the full lifecycle. The onboarding flow covers the first five stages — everything before active build work begins.

```
LEAD ──> CONTACTED ──> DISCOVERY ──> PROPOSAL ──> NEGOTIATION ──> BUILD
 │           │             │             │              │
 │           │             │             │              └─ Contract signed
 │           │             │             └─ Proposal sent, under review
 │           │             └─ Discovery call completed
 │           └─ First outreach made
 └─ Raw inbound (Calendly, referral, Apollo, manual)
```

### 1.1 Lead (Stage: `lead`)

**Entry points:**
- Calendly webhook fires (already live) — auto-creates engagement at `lead` stage
- Apollo/LinkedIn import via outreach module — prospect converts to engagement
- Manual creation from pipeline board or quick-add bar
- Inbound email matched to unknown contact (future Gmail integration)

**Data collected at this stage:**

| Field | Source | Required |
|-------|--------|----------|
| Company name | Auto from Calendly / manual | Yes |
| Contact name | Auto from Calendly / manual | Yes |
| Contact email | Auto from Calendly / manual | Yes |
| Contact phone | Manual / Apollo enrichment | No |
| Contact role/title | Manual / Apollo enrichment | No |
| LinkedIn URL | Apollo enrichment / manual | No |
| Source (`engagement.source`) | Auto-tagged: "calendly", "apollo", "referral", "inbound", "outbound" | Yes |
| Deal value estimate | Manual | No |
| Industry (`company.industry`) | Manual / Apollo enrichment | No |
| Tags (`engagement.tags`) | Manual | No |

**Automated actions on lead creation:**
1. Create `companies` row (or match existing by name/domain)
2. Create `contacts` row linked to company (or match existing by email)
3. Create `engagements` row at stage `lead` with `stageEnteredAt = now()`
4. Create `stage_history` row recording entry into `lead`
5. Create automatic `next_actions` row: "Review lead and decide: qualify or disqualify" — due in 24 hours, assigned to whoever created it (or default owner)
6. If source is Calendly: create `calendar_events` row from the Calendly booking data with the Zoom link
7. If source is Calendly: create `interactions` row of type `note` recording the booking details and any form responses

### 1.2 Contacted (Stage: `contacted`)

**Trigger:** Team member makes first outreach or responds to inbound.

**Data collected:**

| Field | Source | Required |
|-------|--------|----------|
| Outreach channel | Logged via interaction | Yes |
| Outreach content/summary | Interaction note | Yes |
| Response received (y/n) | Manual update | No |

**Automated actions on stage transition:**
1. Update `engagement.stage` to `contacted`, reset `stageEnteredAt`
2. Close the `lead` stage_history row (`exitedAt = now()`), open new `contacted` row
3. Create `interactions` row of type `stage_change`
4. Create `next_actions`: "Follow up if no response in 48 hours" — due in 48 hours
5. If no response after 48 hours and no new interactions logged: surface stale-deal alert on dashboard

### 1.3 Discovery (Stage: `discovery`)

**Trigger:** Discovery call is scheduled or the lead responds positively and a call is booked.

**Data collected:**

| Field | Source | Required |
|-------|--------|----------|
| Discovery call date/time | Calendar event | Yes |
| Call notes (structured) | Interaction of type `meeting` | Yes |
| Project scope (free text) | Extracted from call notes | Yes |
| Budget range | Manual from call | No |
| Timeline expectations | Manual from call | No |
| Decision maker identified | Manual | No |
| Deal value (refined) | Updated on engagement | Yes |
| Expected close date | Updated on engagement | Yes |
| Probability | Updated on engagement | No |

**Automated actions on stage transition:**
1. Standard stage transition (update engagement, close/open stage_history, log stage_change interaction)
2. Create `calendar_events` row for the discovery call (if not already created by Calendly)
3. Pre-call: auto-generate briefing document (see Section 2)
4. Create `next_actions`: "Complete discovery call notes" — due day of call
5. Create `next_actions`: "Send follow-up email within 24 hours of call" — due 24h after scheduled call

### 1.4 Proposal (Stage: `proposal`)

**Trigger:** Discovery is complete, team decides to pursue, proposal is being drafted.

**Data collected:**

| Field | Source | Required |
|-------|--------|----------|
| Proposal document | Created in docs module | Yes |
| Proposal version | Document version tracking | Yes |
| Pricing breakdown | Structured in proposal | Yes |
| Scope of work | Structured in proposal | Yes |
| Timeline/milestones | Structured in proposal | Yes |
| Client feedback on proposal | Interaction notes | No |

**Automated actions on stage transition:**
1. Standard stage transition
2. Create proposal document from template in `documents` table (see Section 3)
3. Create `next_actions`: "Finalize and send proposal" — due in 3 business days
4. Create `next_actions`: "Follow up on proposal if no response in 5 business days" — due in 5 business days after proposal sent

### 1.5 Negotiation (Stage: `negotiation`)

**Trigger:** Client has received the proposal and is discussing terms/scope/pricing.

**Data collected:**

| Field | Source | Required |
|-------|--------|----------|
| Negotiation notes | Interactions | Yes |
| Revised deal value | Updated on engagement | If changed |
| Contract document | Created in docs module | Yes |
| Signed contract | Uploaded to assets | Yes |

**Automated actions on stage transition:**
1. Standard stage transition
2. Create `next_actions`: "Prepare contract based on agreed terms" — due in 2 business days
3. If deal value changed: log interaction noting the change and reason

### 1.6 Transition to Build (Stage: `build`)

**Trigger:** Contract is signed, payment terms are agreed, project is greenlit.

This is the handoff from onboarding to active project work. See Section 4 for the full project kickoff automation.

**Automated actions on stage transition:**
1. Standard stage transition
2. Auto-create `projects` row linked to engagement (see Section 4)
3. Auto-generate initial task list from project template
4. Create kickoff `calendar_events`
5. Create first `invoices` row (if deposit is required per contract)
6. Mark engagement as `closed_won` equivalent for pipeline metrics (engagement stays at `build` — `closed_won` is only used when the engagement fully completes)

---

## 2. Discovery Call Workflow

### 2.1 Pre-Call: Auto-Generated Briefing

When an engagement enters the `discovery` stage or a calendar event is created with an `engagementId`, the system generates a briefing document. This is a `documents` row in the `general` folder with a predictable title pattern: `"[Company] — Discovery Briefing"`.

**Briefing contents (auto-populated from existing data):**

```
# Discovery Briefing: [Company Name]
Prepared: [Date]
Engagement: [Engagement Name]

## Contact
- Name: [Contact Name]
- Role: [Contact Role]
- Email: [Contact Email]
- Phone: [Contact Phone]
- LinkedIn: [LinkedIn URL]

## Company
- Name: [Company Name]
- Industry: [Industry]
- Source: [How they found us]
- Apollo data: [Company size, domain, etc. if available]

## Timeline
- Lead created: [Date]
- First contact: [Date]
- Days in pipeline: [N]

## Previous Interactions
[Reverse-chronological list of all interactions on this engagement]

## Outreach History (if converted from prospect)
[Touch history from prospect_touches if prospect.contactId matches]

## Prepared Questions
1. What problem are you trying to solve?
2. What does success look like for this project?
3. What is your timeline?
4. Who are the stakeholders and decision makers?
5. What is your budget range?
6. Have you worked with agencies/consultants before?
7. What does your current tech stack look like?
8. Are there any hard constraints (compliance, platform, etc.)?
```

**Implementation:** Server action triggered on stage change to `discovery` or on calendar event creation. Queries all related tables and assembles the markdown. Stores as a `documents` row linked via a new `engagementId` column on documents (schema addition needed) or via a naming convention.

### 2.2 During Call: Structured Note-Taking Template

When the user opens the engagement detail view during a scheduled discovery call (detected by checking `calendar_events` for today), the UI surfaces a "Start Discovery Notes" button. Clicking it opens a pre-filled interaction editor with this template:

```markdown
## Discovery Call Notes — [Company Name]
Date: [Auto-filled]
Attendees: [Auto-filled from calendar event]

### Problem Statement
[What problem is the client trying to solve?]

### Current State
[What exists today? What tools/processes are they using?]

### Desired Outcome
[What does success look like? Measurable goals?]

### Scope Discussion
[What did we discuss building? Features, platforms, integrations?]

### Timeline & Urgency
[When do they need this? What's driving the deadline?]

### Budget
[Range discussed. Payment preferences. Deposit expectations.]

### Decision Process
[Who decides? How many stakeholders? What's the approval process?]

### Technical Constraints
[Existing stack, compliance requirements, platform requirements]

### Competition
[Are they talking to other agencies? What alternatives are they considering?]

### Red Flags
[Anything concerning: scope creep signals, unrealistic expectations, budget mismatch]

### Next Steps
[What did we agree to do next?]

### STRVX Fit Score: [1-10]
[Gut assessment of whether this is a good fit for our team and capabilities]
```

This is saved as an `interactions` row of type `meeting` with `scheduledAt` matching the calendar event. The structured markdown is stored in `interactions.content`.

### 2.3 Post-Call: Automated Follow-Up

After a discovery call interaction is saved (type `meeting`, engagement in `discovery` stage), the system triggers these automations:

1. **Parse action items:** Scan the "Next Steps" section of the notes. For each line item, create a `next_actions` row with:
   - Description from the line item text
   - Owner: the current user (default) or parsed from text if a name is mentioned
   - Due date: 3 business days from now (default) or parsed from text
   - Priority: `normal` (default) or `high` if the note contains urgency keywords
   - `sourceInteractionId` linked to the meeting interaction

2. **Update engagement fields:**
   - If a deal value is mentioned in the Budget section, prompt to update `engagement.dealValue`
   - If a timeline is mentioned, prompt to update `engagement.expectedCloseDate`
   - Update `engagement.probability` based on the fit score (score / 10)

3. **Schedule follow-up:**
   - Create `next_actions`: "Send discovery follow-up email with summary" — due tomorrow, priority `high`
   - Create `calendar_events` for the next meeting if one was discussed

4. **Stage advancement prompt:**
   - If fit score >= 7: suggest advancing to `proposal` stage
   - If fit score <= 3: suggest moving to `closed_lost` with a reason
   - If fit score 4-6: suggest staying in `discovery` with a follow-up call

---

## 3. Proposal Generation

### 3.1 Template System

Proposals are built from templates stored in the `documents` table with `folder = 'templates/proposals'`. The template system uses variable placeholders that are substituted at generation time.

**Template variables:**

| Variable | Source |
|----------|--------|
| `{{company_name}}` | `companies.name` |
| `{{contact_name}}` | `contacts.name` |
| `{{contact_email}}` | `contacts.email` |
| `{{engagement_name}}` | `engagements.name` |
| `{{deal_value}}` | `engagements.dealValue` |
| `{{expected_close_date}}` | `engagements.expectedCloseDate` |
| `{{today_date}}` | Current date |
| `{{proposal_number}}` | Auto-incremented |
| `{{scope_summary}}` | Extracted from discovery notes |
| `{{timeline_estimate}}` | Manual or from discovery notes |
| `{{payment_terms}}` | From template default or manual |

**Standard proposal templates:**

1. **Full-Service Build** — end-to-end product development (design, build, deploy, maintain)
2. **MVP Sprint** — rapid 4-8 week build with defined scope
3. **AI Integration** — adding AI capabilities to existing product
4. **Consulting / Strategy** — advisory engagement, no build work
5. **Maintenance Retainer** — ongoing support and maintenance contract

Each template includes sections for: executive summary, scope of work, deliverables, timeline with milestones, pricing breakdown, payment terms, team and approach, terms and conditions.

### 3.2 Proposal Generation Flow

**Step 1: Select template**
From the engagement detail view, click "Generate Proposal." A modal shows available templates with descriptions. Select one.

**Step 2: Variable substitution**
The system auto-fills all variables from the engagement, company, and contact data. The user reviews and can edit any field. Fields that could not be auto-filled are highlighted.

**Step 3: Customize content**
The proposal opens in the TipTap editor (already exists in the docs module). The user customizes scope, pricing, timeline, and any template sections. The editor shows a split view: template structure on the left, editable content on the right.

**Step 4: Internal review**
Before sending, the proposal can be marked "ready for review." Other team members see it flagged on the dashboard. Approval is logged as an interaction.

**Step 5: Export and send**
Export options:
- PDF generation (server-side via puppeteer or react-pdf)
- Google Docs export (future, via Google Workspace integration)
- Direct link (hosted proposal page with read-only view and analytics)

### 3.3 Version Tracking

Every significant edit to a proposal creates a version snapshot. Implementation approach:

**Schema addition:**
```
proposal_versions: id, document_id, version_number (int), content (text),
                   created_by (uuid -> users), created_at, change_summary (text)
```

- Version 1 is the initial generation from template
- Each subsequent save that the user marks as a "new version" (or auto-detected if content diff exceeds a threshold) creates a new version row
- The engagement detail view shows a version timeline: "v1 (generated) -> v2 (pricing updated) -> v3 (scope revised after client feedback) -> v4 (final)"
- Any version can be restored or compared side-by-side

### 3.4 Client Review and Approval Flow

**Option A: Hosted proposal page (recommended for v1)**
Generate a unique, expiring URL (`/proposal/[token]`) that shows the proposal in a clean, branded read-only view. The page includes:
- Full proposal content rendered from markdown/HTML
- "Approve" and "Request Changes" buttons
- A comment box for feedback
- View tracking: log when the client opens the link, how long they spend, which sections they scroll through (lightweight analytics via a simple beacon)

When the client clicks "Approve":
- Create `interactions` row of type `note`: "Client approved proposal v[N]"
- Advance engagement to `negotiation` stage
- Create `next_actions`: "Prepare contract" — due in 2 business days

When the client clicks "Request Changes":
- Create `interactions` row with the client's feedback
- Create `next_actions`: "Address client feedback on proposal" — due in 2 business days
- Proposal stays in current version; team revises and bumps version

**Option B: E-signature integration (future)**
For contract signing (not proposal approval), integrate with DocuSign or PandaDoc:
- Generate signing envelope from the contract document
- Embed signing ceremony or send via email
- Webhook on completion updates engagement stage and logs interaction
- Store signed document in `documents` with `folder = 'contracts'`

This is a Phase 2 integration. For v1, contracts are handled manually (PDF sign, email back, uploaded to assets).

---

## 4. Project Kickoff

### 4.1 Auto-Create Project from Engagement

When an engagement transitions to `build` stage, the system runs the kickoff automation:

**Step 1: Create project**
```
projects row:
  name: engagement.name (editable)
  description: "Project for [company.name] — [engagement.name]"
  status: "scoping"
  client: company.name
  engagementId: engagement.id
  startDate: today
  endDate: engagement.expectedCloseDate (if set, otherwise null)
  team: [current user] (editable)
```

**Step 2: Create project members**
```
project_members rows:
  - projectId, userId: creator, role: "lead"
  - (Additional members added manually or from a team template)
```

**Step 3: Generate initial task list from template**

Task templates are stored as JSON in the `documents` table with `folder = 'templates/project-tasks'`. Each template is a list of task objects:

```json
{
  "templateName": "Full-Service Build",
  "phases": [
    {
      "name": "Setup",
      "tasks": [
        { "title": "Create project repository", "priority": "high", "offsetDays": 0 },
        { "title": "Set up development environment", "priority": "high", "offsetDays": 1 },
        { "title": "Define technical architecture", "priority": "high", "offsetDays": 2 },
        { "title": "Create design system foundations", "priority": "normal", "offsetDays": 3 }
      ]
    },
    {
      "name": "Discovery & Design",
      "tasks": [
        { "title": "User research and requirements doc", "priority": "high", "offsetDays": 3 },
        { "title": "Wireframes and user flows", "priority": "high", "offsetDays": 5 },
        { "title": "High-fidelity designs", "priority": "normal", "offsetDays": 8 },
        { "title": "Client design review", "priority": "high", "offsetDays": 10 }
      ]
    },
    {
      "name": "Build",
      "tasks": [
        { "title": "Core feature implementation — Sprint 1", "priority": "high", "offsetDays": 12 },
        { "title": "Core feature implementation — Sprint 2", "priority": "high", "offsetDays": 19 },
        { "title": "Integration and API work", "priority": "normal", "offsetDays": 19 },
        { "title": "Internal QA", "priority": "high", "offsetDays": 26 }
      ]
    },
    {
      "name": "Launch",
      "tasks": [
        { "title": "Client UAT", "priority": "high", "offsetDays": 28 },
        { "title": "Bug fixes from UAT", "priority": "high", "offsetDays": 30 },
        { "title": "Production deployment", "priority": "urgent", "offsetDays": 33 },
        { "title": "Post-launch monitoring", "priority": "high", "offsetDays": 34 },
        { "title": "Handoff documentation", "priority": "normal", "offsetDays": 35 }
      ]
    }
  ]
}
```

Each task is created as a `tasks` row with:
- `projectId` and `engagementId` linked
- `dueDate` calculated from `project.startDate + offsetDays`
- `assigneeId` left null (assigned during kickoff meeting)
- `status: "todo"`

### 4.2 Schedule Kickoff Meeting

Auto-create a `calendar_events` row:
```
title: "[Company] — Project Kickoff"
type: "client"
date: next available slot (or manual selection)
startHour: 10
durationHours: 1
client: company.name
engagementId: engagement.id
projectId: project.id
createdBy: current user
```

If Calendly integration is active, generate a Calendly link for the client to book the kickoff slot.

### 4.3 Set Up Communication Channels

This is a manual checklist surfaced as `next_actions` items on the engagement, auto-created at kickoff:

1. "Create shared Slack channel with [Company]" — priority `high`, due day 1
2. "Send project welcome email with timeline and team intro" — priority `high`, due day 1
3. "Share project folder/drive access with client" — priority `normal`, due day 2
4. "Schedule recurring weekly check-in" — priority `normal`, due day 2
5. "Set up staging environment and share access" — priority `normal`, due day 3

### 4.4 Create Project Folder Structure

In the `documents` table, create a folder hierarchy for the project:

```
projects/[company-slug]/
  overview.md          — Project brief, goals, team
  architecture.md      — Technical architecture decisions
  meeting-notes/       — Subfolder for ongoing meeting notes
  deliverables/        — Client-facing deliverables
```

The `assets` module (file/folder tree) should also create a corresponding folder structure for binary assets (designs, exports, etc.). This maps to the existing `documents.folder` field using a convention like `projects/[slug]/*`.

### 4.5 Financial Setup

On project kickoff:
1. If the contract specifies a deposit: create an `invoices` row with status `draft`
   - `invoiceNumber`: auto-generated (next sequential number)
   - `engagementId`: linked
   - `clientName`: from company
   - `amount`: deposit amount from deal value or contract terms
   - `status`: "draft" (team reviews before sending)
   - `lineItems`: `[{ description: "Project deposit — [engagement name]", amount: deposit_amount }]`

2. Create recurring invoice schedule as `next_actions`:
   - "Send milestone 1 invoice" — due at milestone date
   - "Send milestone 2 invoice" — due at milestone date
   - etc.

---

## 5. Client Communication Dashboard

### 5.1 Single-Pane View

The engagement detail page (`/clients/[id]`) is the communication dashboard. It already shows timeline and next actions. The onboarding flow enriches this with additional sections, turning it into a complete client communication hub.

**Proposed layout for `/clients/[id]`:**

```
┌──────────────────────────────────────────────────────────────┐
│  [Company Name] — [Engagement Name]          [Stage Badge]   │
│  Contact: [Name] · [Email] · [Phone]         [Deal Value]   │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                  │
│  SIDEBAR   │  MAIN CONTENT (tabbed)                          │
│            │                                                  │
│  Stage     │  ┌─────────────────────────────────────────┐    │
│  Progress  │  │ Timeline │ Actions │ Emails │ Meetings │    │
│  ────────  │  │  Docs   │ Invoices │ Activity          │    │
│  Lead ✓    │  └─────────────────────────────────────────┘    │
│  Contacted │                                                  │
│  Discovery │  [Active tab content]                           │
│  > Proposal│                                                  │
│  Negotiat. │                                                  │
│  Build     │                                                  │
│  Deliver   │                                                  │
│  Maintain  │                                                  │
│            │                                                  │
│  ────────  │                                                  │
│  Quick     │                                                  │
│  Stats     │                                                  │
│  ────────  │                                                  │
│  Days in   │                                                  │
│  stage: 4  │                                                  │
│  Total     │                                                  │
│  days: 12  │                                                  │
│  Touches:8 │                                                  │
│  Actions:3 │                                                  │
│            │                                                  │
├────────────┴─────────────────────────────────────────────────┤
│  Quick Add: [Note] [Meeting] [Action] [Email Log] [Document]│
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Tab Breakdown

**Timeline tab (existing, enhanced):**
- All interactions in reverse-chronological order
- Grouped by date
- Stage change events shown as full-width banners
- Meeting interactions show a collapsible structured view (parsed from markdown template)
- Email interactions (future) show subject, snippet, and link to full thread

**Actions tab (existing, enhanced):**
- Active next_actions sorted by due date
- Overdue items highlighted in red
- Completed items in a collapsible "Done" section
- Each action shows source interaction link if available
- Bulk complete/reassign

**Emails tab (future — requires Gmail integration):**
- Email threads matched to this engagement's contacts
- Grouped by thread
- Each thread shows: subject, participants, last message date, snippet
- Click to expand full thread inline
- "Log to timeline" button for important emails
- Unmatched emails queue (emails from this contact that the system could not auto-match)

**Meetings tab:**
- Past and upcoming calendar events linked to this engagement
- Each meeting shows: date, title, attendees, notes (if available)
- "Add Notes" button opens the structured note template
- Recurring meetings shown with cadence badge

**Docs tab:**
- Documents linked to this engagement (via `engagementId` or folder convention)
- Proposals with version history
- Contracts
- Meeting notes
- Quick-create buttons for each document type

**Invoices tab:**
- Invoices linked to this engagement
- Status badges (draft, sent, paid, overdue)
- Running total: invoiced, paid, outstanding
- Quick-create invoice button

**Activity tab:**
- Unified feed combining all of the above
- Filterable by type: notes, meetings, stage changes, emails, documents, invoices
- Searchable
- Exportable (for client-facing reports)

### 5.3 Communication Metrics

Displayed in the sidebar or as a header stat bar:

- **Days in current stage:** calculated from `engagement.stageEnteredAt`
- **Total days in pipeline:** calculated from `engagement.createdAt`
- **Stage velocity:** average days per completed stage (from `stage_history`)
- **Total interactions:** count of `interactions` for this engagement
- **Last touch:** date of most recent interaction
- **Days since last touch:** calculated, highlighted red if > 7
- **Open actions:** count of incomplete `next_actions`
- **Overdue actions:** count of incomplete actions past due date
- **Response time:** average time between client email and team response (future, requires Gmail)

---

## 6. Automated Reminders and Follow-ups

### 6.1 Stale Deal Alerts

A deal is "stale" when it sits in a stage too long without activity. Staleness thresholds differ by stage:

| Stage | Stale After | Alert Location |
|-------|-------------|----------------|
| `lead` | 48 hours with no interaction | Dashboard + notification |
| `contacted` | 5 days with no response | Dashboard + notification |
| `discovery` | 7 days after last interaction | Dashboard + notification |
| `proposal` | 5 days after proposal sent | Dashboard + notification |
| `negotiation` | 10 days after last interaction | Dashboard + notification |

**Detection logic:**
Query runs on page load (or via Supabase Edge Function cron every hour):
```sql
SELECT e.* FROM engagements e
WHERE e.stage IN ('lead', 'contacted', 'discovery', 'proposal', 'negotiation')
  AND e.archived_at IS NULL
  AND (
    SELECT MAX(i.created_at) FROM interactions i WHERE i.engagement_id = e.id
  ) < NOW() - INTERVAL '[threshold for stage]'
```

**Display:**
- Dashboard: "Stale Deals" card showing count and list, sorted by stalest first
- Pipeline board: orange border on stale engagement cards
- Engagement detail: banner at top: "This deal has been inactive for [N] days"

### 6.2 Follow-up Scheduling

Follow-ups are modeled as `next_actions` with specific patterns:

**Auto-generated follow-ups:**
- After every meeting interaction: "Send follow-up email" — due next business day
- After sending a proposal: "Check in on proposal" — due in 5 business days
- After stage change: stage-specific follow-up (see Section 1)
- After contract sent: "Confirm contract received" — due in 2 business days

**Follow-up cadence rules:**
- Never more than one auto-generated follow-up per engagement at a time
- If a manual interaction is logged, the auto-follow-up is pushed forward
- If a follow-up is completed, the next one in the cadence is auto-created
- Cadence can be paused (e.g., "client is on vacation until [date]")

### 6.3 Check-in Cadence Management

For active projects (stages `build`, `deliver`, `maintain`), the system enforces a check-in cadence:

| Stage | Default Cadence |
|-------|-----------------|
| `build` | Weekly client check-in |
| `deliver` | Bi-weekly check-in |
| `maintain` | Monthly check-in (uses `maintenance_next_checkin` field) |

**Implementation:**
- When engagement enters `build`: create recurring `next_actions` "Weekly client check-in" with rolling due dates
- When check-in is completed (action marked done): auto-create the next one at the cadence interval
- If a check-in is overdue: surface on dashboard and in engagement detail
- For `maintain` stage: use the existing `maintenanceNextCheckin` field to track the next check-in date

### 6.4 Milestone Notifications

Project milestones are derived from tasks with specific tags or from the task template phases:

- When all tasks in a phase are completed: notify team and create interaction "Phase [N] complete"
- When a milestone due date is approaching (3 days out): surface on dashboard
- When a milestone is overdue: escalate visibility (red badge on sidebar, dashboard alert)
- When the project end date is approaching: create "Prepare deliverables and handoff documentation" action

---

## 7. UI/UX Design for Onboarding

### 7.1 New Engagement Creation: Wizard vs. Progressive Disclosure

**Recommendation: Progressive disclosure with a quick-capture fallback.**

The current engagement creation flow (via `createEngagement` server action) collects company name, engagement name, contact name, optional email, optional deal value, and stage. This is good for quick capture but insufficient for a complete onboarding flow.

**Quick-Capture Mode (default):**
A lightweight modal triggered from the pipeline board, dashboard, or quick-add bar. Collects the minimum:
- Company name (with autocomplete against existing companies)
- Engagement name
- Contact name (with autocomplete against existing contacts at that company)
- Source (dropdown: Calendly, Referral, Outbound, Inbound, Apollo)

Everything else is optional and can be filled in later. The engagement is created at `lead` stage. The idea: capture the lead in 10 seconds, enrich later.

**Full Onboarding Wizard (opt-in):**
Accessible from the engagement detail view via a "Complete Onboarding" button, or triggered when advancing past `discovery` stage without sufficient data.

```
Step 1: Company & Contact (pre-filled if quick-captured)
  - Company name, industry, website/domain
  - Primary contact: name, email, phone, role, LinkedIn
  - Additional contacts (add more)

Step 2: Engagement Details
  - Engagement name (descriptive project name)
  - Source and referral details
  - Deal value estimate
  - Expected close date
  - Tags

Step 3: Discovery Summary (shown only if in discovery+ stage)
  - Project scope (free text or structured from call notes)
  - Budget range
  - Timeline expectations
  - Decision maker
  - Fit score

Step 4: Review & Confirm
  - Summary of all entered data
  - "Create and advance to [next stage]" button
  - "Save as draft at current stage" button
```

Each step shows a progress indicator. Steps can be skipped and returned to. Data is saved as the user progresses (not just on final submit).

### 7.2 Required vs. Optional Fields

The system should enforce data quality without blocking fast lead capture. The approach: **required fields escalate as the engagement advances.**

| Stage | Required to Enter | Required to Advance Past |
|-------|-------------------|--------------------------|
| `lead` | Company name, engagement name | Contact name, contact email |
| `contacted` | — | At least one interaction logged |
| `discovery` | — | Discovery call notes (meeting interaction), deal value |
| `proposal` | — | Proposal document created |
| `negotiation` | — | — |
| `build` | — | Project created, contract uploaded or referenced |

If a user tries to advance an engagement but required fields are missing, the stage change is blocked with a clear message: "To move to [Stage], please complete: [list of missing items]." The engagement detail view shows these as a checklist at the top of the page when the engagement is within two stages of the requirement.

### 7.3 Pipeline Board Enhancements for Onboarding

The existing Kanban pipeline board should surface onboarding health at a glance:

**Card enhancements:**
- Completeness indicator: small progress ring showing what percentage of stage requirements are met
- Last activity timestamp: "3d ago" in muted text
- Stale indicator: orange left border if stale (per thresholds in Section 6.1)
- Next action preview: first upcoming action shown below the deal value
- Overdue action count: red badge if any actions are overdue

**Column enhancements:**
- Column header shows: count of engagements, total deal value in column
- "Add new" button at the bottom of each column (quick-capture, pre-set to that stage)
- Column-level health: "2 stale deals" warning under the header

### 7.4 Bulk Import from Apollo/LinkedIn

The outreach module already has prospect management with Apollo integration. The onboarding flow connects to this via prospect conversion:

**Conversion flow:**
1. In the outreach module, a prospect at stage `hot` shows a "Convert to Engagement" button
2. Clicking it opens a pre-filled quick-capture modal:
   - Company name: from `prospects.companyName`
   - Contact name: from `prospects.firstName + lastName`
   - Contact email: from `prospects.email`
   - Source: "apollo" or "linkedin" based on prospect source
   - LinkedIn URL: from `prospects.linkedinUrl`
3. On creation:
   - Create company, contact, and engagement (reuse existing if matched)
   - Set `prospects.stage` to `converted` and `prospects.convertedAt` to now
   - Set `prospects.companyId` and `prospects.contactId` to the newly created/matched records
   - Log the conversion as an interaction on the new engagement

**Bulk conversion:**
- Multi-select prospects in the outreach table
- "Convert Selected" action creates engagements for each
- Matched companies/contacts are deduplicated by name/email
- A summary modal shows what was created: "Created 5 engagements, 3 new companies, 5 new contacts"

**Bulk import from CSV/Apollo export:**
- The outreach module already handles Apollo data via `apolloSyncLog`
- For direct import: upload CSV with columns mapped to prospect fields
- Preview table shows parsed data with validation (missing required fields highlighted)
- Import creates `prospects` rows, which can then be individually or bulk-converted to engagements

---

## 8. Schema Additions Required

The onboarding flow requires minimal schema changes because the existing model is well-structured. The following additions are needed:

### 8.1 New Columns

```sql
-- Link documents to engagements for proposal/contract tracking
ALTER TABLE documents ADD COLUMN engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL;

-- Link documents to projects
ALTER TABLE documents ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Track proposal-specific metadata
ALTER TABLE documents ADD COLUMN document_type TEXT DEFAULT 'general';
-- Values: 'general', 'proposal', 'contract', 'meeting_notes', 'briefing'

-- Track document versions
ALTER TABLE documents ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE documents ADD COLUMN parent_document_id UUID REFERENCES documents(id);
```

### 8.2 New Tables

```sql
-- Proposal versions (full content snapshots)
CREATE TABLE proposal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Onboarding checklists (track completion of stage requirements)
CREATE TABLE onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_label TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(engagement_id, stage, item_key)
);

-- Client-facing proposal links (for hosted proposal pages)
CREATE TABLE proposal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  approved_at TIMESTAMPTZ,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project task templates (structured JSON)
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.3 New Enum Values

No new enum values needed. The existing `stageEnum` and `interactionTypeEnum` cover all onboarding stages and interaction types. If discovery call notes need a distinct type, the `meeting` type suffices since `scheduledAt` distinguishes meetings from ad-hoc notes.

---

## 9. Implementation Priority

### Phase 1: Foundation (ship in 1-2 weeks)
1. Stage transition automations: auto-create `next_actions` and `stage_history` rows on every stage change
2. Stale deal detection and dashboard alerts
3. Discovery call note template (structured markdown in interaction editor)
4. Required-field enforcement on stage advancement
5. Pipeline board card enhancements (staleness, last activity, next action)

### Phase 2: Proposals and Documents (ship in 2-3 weeks)
1. Schema additions: `engagement_id` and `document_type` on documents
2. Proposal template system (variable substitution, template selection)
3. Proposal version tracking
4. Project kickoff automation (auto-create project, tasks, calendar event)
5. Enhanced engagement detail view with tabbed layout

### Phase 3: Communication and Intelligence (ship in 3-4 weeks)
1. Hosted proposal pages with view tracking
2. Auto-generated discovery briefings
3. Post-call action item extraction
4. Follow-up cadence management
5. Prospect-to-engagement conversion flow
6. Bulk import/conversion

### Phase 4: Integrations (after Phase 3, as integrations roadmap dictates)
1. Gmail auto-logging (emails tab on engagement detail)
2. E-signature integration for contracts
3. Slack channel creation automation
4. Calendar sync for recurring check-ins

---

## 10. Metrics to Track

The onboarding flow should be measurable. These metrics determine whether it is working:

| Metric | Target | How Measured |
|--------|--------|--------------|
| Lead-to-discovery conversion rate | > 60% | Stage history: leads that reached discovery / total leads |
| Discovery-to-proposal rate | > 50% | Stage history |
| Proposal-to-close rate | > 40% | Stage history |
| Average time in lead stage | < 3 days | Stage history `enteredAt` to `exitedAt` |
| Average time in discovery stage | < 10 days | Stage history |
| Average time lead-to-build | < 30 days | Stage history first `lead` entry to `build` entry |
| Stale deal count | 0 | Stale deal query |
| Overdue action count | 0 | next_actions where due_date < today and not completed |
| Data completeness at proposal stage | 100% | Onboarding checklist completion rate |
| Proposals sent per month | Trending up | Document count where type = proposal |
| Discovery notes completion rate | 100% | Engagements that passed discovery with a meeting interaction / total |
