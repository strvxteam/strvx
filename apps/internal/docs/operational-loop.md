# Operational Loop

End-to-end workflow from lead intake through delivery and finance.

---

## 1. Lead Intake

Two entry paths feed the CRM:

**A. Calendly Webhook (automatic)**
`POST /api/webhooks/calendly` handles `invitee.created` events. On a new booking it:
1. Checks for an existing contact by email (dedup).
2. If new: creates a **company**, **contact**, and **engagement** (stage = `lead`) in one pass, plus an initial `meeting` interaction and `stage_history` entry.
3. If the contact already exists, no duplicate records are created.

**B. Manual Creation (form)**
The `createEngagement` server action (called from the pipeline/dashboard create-engagement form) runs a transaction that:
1. Inserts a **company**.
2. Optionally inserts a **contact** linked to that company.
3. Creates the **engagement** at a chosen stage (default `discovery`), records **stage_history**, and logs a `note` interaction.

**Screens:** `/dashboard`, `/pipeline` (both surface the create-engagement form)

---

## 2. Outreach

Pre-pipeline prospecting for cold leads.

| Step | What happens | Data |
|------|-------------|------|
| Define verticals | Create **industries** (slug, name, icon, color) | `industries` table |
| Add prospects | Manual entry or Apollo import into an industry | `prospects` table (indexed by `industry_slug`) |
| Log touches | Record every email, LinkedIn message, phone call, or referral | `prospect_touches` table (channel enum) |
| Advance stage | Move prospect through `cold` -> `warm` -> `hot` | `changeProspectStage` action |
| Convert | `convertProspect` action runs a transaction: marks prospect `converted`, creates **company + contact + engagement** (stage `lead`), links IDs back to the prospect, and logs a `note` interaction | Bridges outreach -> pipeline |

**Screen:** `/outreach` -- industry tabs, prospect cards, touch log drawer, convert button

---

## 3. Pipeline

Visual Kanban of engagement stages.

```
lead -> contacted -> discovery -> building_mvp -> proposal -> negotiation -> build -> deliver -> maintain -> closed_won / closed_lost
```

The `changeStage` action wraps a transaction:
1. Updates `engagements.stage` and `stage_entered_at`.
2. Closes the previous `stage_history` entry (`exited_at`).
3. Opens a new `stage_history` entry.
4. Logs a `stage_change` interaction on the timeline.

`getPipelineEngagements` powers the board, joining companies, contacts, and the nearest pending action due date.

**Screen:** `/pipeline` -- drag-and-drop Kanban board grouped by stage, with deal value and next-action badges

---

## 4. Client Management

Detail view for a single engagement.

| Section | Data source | Actions |
|---------|------------|---------|
| Header & details | `getEngagement` (engagement + company + contact) | `updateEngagement` -- deal value, probability, expected close, maintenance fields, tags |
| Timeline | `getEngagementTimeline` (interactions ordered desc) | `quickAdd` -- prefix with `/note`, `/meeting`, or `/action` to log entries |
| Next Actions | `getEngagementActions` (pending checklist) | `toggleAction` to complete; actions auto-created when using `/action` prefix |
| Stage controls | Current stage display | `changeStage` to advance/revert |
| Contacts | `getContactsByCompany` | `createContact` to add more contacts to the company |
| Archive | Soft-delete | `archiveEngagement` sets `archived_at` |

**Screens:** `/clients` (list), `/clients/[id]` (detail), `/contacts` (all contacts across companies)

---

## 5. Delivery

Execution tracking for active work.

**Projects** link to engagements via `engagement_id`. Each project has:
- Status (`scoping`, etc.), date range, team array
- **Project members** (join table: `project_members` linking users)
- Linked **tasks** and **calendar events**

**Tasks** can belong to a project, an engagement, or both. Fields: title, description, status (`todo`/`in_progress`/`done`), priority, assignee, due date. `completedAt` is set automatically when status becomes `done`.

**Calendar Events** can link to an engagement, a project, or neither. Fields: title, type (`internal`/`client`), date, time slot, client name, Zoom link.

| Screen | Purpose |
|--------|---------|
| `/projects` | Project list with status, team, dates |
| `/projects/[id]` | Project detail |
| `/tasks` | Global task board (filterable by project/engagement) |
| `/tasks/[id]` | Task detail |
| `/calendar` | Day/week calendar view |

---

## 6. Finance

Revenue and cost tracking.

**Invoices** optionally link to an engagement. Fields: invoice number, client name, amount, tax rate, status (`draft`/`sent`/`paid`/`overdue`), issued/due/paid dates, line items (JSONB), notes.

**Expenses** are standalone. Fields: description, amount, category, date, recurring flag, vendor.

**Goals** track numeric targets (e.g., revenue milestones). Fields: name, target value, current value, unit, deadline, achieved flag.

**Revenue queries:**
- `getMonthlyRevenue` -- aggregates paid invoices by month
- `getMRR` -- sums `maintenance_monthly_fee` across opted-in engagements

| Screen | Purpose |
|--------|---------|
| `/invoices` | Invoice list |
| `/invoices/[id]` | Invoice detail with line items |
| `/expenses` | Expense list |
| `/finances` | Revenue overview (monthly revenue, MRR) |
| `/revenue` | Revenue charts and trends |
| `/goals` | Goal progress bars |

---

## 7. Knowledge

Internal content management.

**Documents** -- rich-text notes organized by folder. Author-tracked, timestamped.

**Templates** -- reusable document scaffolds (shares the `/templates` route, likely a filtered view or separate store).

**Marketing Posts** -- content for LinkedIn/other platforms. Fields: title, content, platform, status (`draft`/`scheduled`/`published`), scheduled/published timestamps, author.

| Screen | Purpose |
|--------|---------|
| `/docs` | Document list by folder |
| `/docs/[id]` | Document editor |
| `/templates` | Template library |
| `/marketing` | Post list with status filters, create/edit |
| `/toolbox` | Internal utilities |
| `/assets` | Asset management |

---

## Data Flow Summary

```
Calendly Webhook ─┐
                   ├─> Company + Contact + Engagement ─> Pipeline ─> Client Detail
Manual Form ───────┘                                         │
                                                             ├─> Projects + Tasks + Calendar
Outreach ─> Prospects ─> Convert ─────────────────────────────┘
                                                             │
                                                             ├─> Invoices + Expenses ─> Finance
                                                             └─> Documents + Marketing ─> Knowledge
```
