# STRVX Internal Dashboard: Feature Improvement Recommendations

> Research date: 2026-03-30
> Scope: Every existing feature in the dashboard, analyzed from the codebase at `/Users/nicolasdossantos/strvx-internal-tool`
> Format: Current state, proposed improvement, impact, effort, dependencies

---

## Table of Contents

1. [Dashboard](#1-dashboard)
2. [Pipeline / CRM](#2-pipeline--crm)
3. [Task Management](#3-task-management)
4. [Calendar](#4-calendar)
5. [Outreach](#5-outreach)
6. [Finance](#6-finance)
7. [Knowledge Base](#7-knowledge-base)
8. [UX / Design](#8-ux--design)

---

## 1. Dashboard

**Files:** `src/app/(app)/dashboard/page.tsx`, `dashboard-client.tsx`

### Current State

The dashboard is a server component that pulls from both mock data and Supabase. It has:
- Greeting header with date
- 3-card "pulse strip" (overdue actions, today's schedule, revenue MTD)
- Two-column layout: left = Needs Attention + Active Work + Recent Activity; right = Today's Schedule + Money + Pipeline Summary + Team blockers
- QuickAddBar at the bottom for adding notes/actions
- Revenue goal progress bar (hardcoded milestones: $25k, $50k, $100k, $200k, $500k)
- All data comes from `mockEngagements`, `mockActions`, `mockCalendarEvents`, `mockInvoices`, `mockTasks`, with Supabase fallback try/catch

### 1.1 Activity Heatmap (Weekly/Monthly Contribution Map)

**Current state:** Recent activity is a flat chronological list showing the last 5 entries (note, call, email, etc.) with author, date, and truncated content. No density visualization.

**Proposed improvement:** Add a GitHub-style contribution heatmap showing daily activity density for the past 12 weeks. Each cell = one day, color intensity = number of interactions/notes/tasks completed. Hovering shows "3 interactions, 2 tasks completed." This answers the question "Are we consistently working, or do we have dead weeks?" which is critical for a 3-person agency where momentum is everything.

Data source: `interactions` table (already has `createdAt`) + `nextActions` completions.

**Impact:** Medium. Provides at-a-glance team velocity without clicking into anything. Surfaces patterns (e.g., "we always drop off Fridays").
**Effort:** Small. Pure UI component over existing data. ~50 lines of SVG grid + a query grouping by date.
**Dependencies:** None. Works with existing data model.

---

### 1.2 Revenue Trend Sparkline

**Current state:** Revenue MTD shows a single number with a delta percentage vs. previous month. No trend visualization. The `mockMonthlyRevenue` array has 6 months of data that is never charted on the dashboard.

**Proposed improvement:** Replace the plain number in the Revenue pulse card with a mini sparkline (Recharts is already installed) showing the last 6 months of revenue. Keep the number + delta, but add a 60px-tall sparkline underneath. This turns a static number into a trend. For a 3-person agency, knowing "are we growing or plateauing" is the single most important financial signal.

**Impact:** High. Revenue trajectory is the #1 metric for an agency. A sparkline communicates 6 months of context in 60 pixels.
**Effort:** Small. Recharts `<Sparkline>` or `<AreaChart>` with minimal config. Data already exists in `mockMonthlyRevenue`.
**Dependencies:** None. Recharts already in `package.json`.

---

### 1.3 Smarter "Needs Attention" Section

**Current state:** Shows two categories: overdue actions (red dot) and stale engagements (orange dot, "No next action set"). Items link to the client detail page. No severity ranking. No distinction between "1 day overdue" and "3 weeks overdue."

**Proposed improvement:**
1. **Severity tiers:** Sort items by urgency. Show "X days overdue" instead of just "Overdue." Color-code: 1-3 days = orange, 4-7 days = red, 7+ days = dark red with pulse animation.
2. **Include more risk signals:** Add deals with no activity in 7+ days (even if not technically overdue), invoices overdue 30+ days, tasks blocked for 3+ days, and meetings with no prep notes within 24 hours.
3. **Actionable inline buttons:** Add a "Snooze 1 day" and "Mark done" button directly in the row so Nick can triage from the dashboard without navigating to the client page.
4. **Empty state improvement:** Current empty state says "All clear" and offers "Add your first client." After clients exist, it should say "Nothing needs attention right now. Next event: [X] at [time]."

**Impact:** High. This is the operational heartbeat of the dashboard. Making it smarter means fewer things fall through the cracks.
**Effort:** Medium. Severity sorting is trivial. Inline actions require server actions. Additional risk signals require new queries.
**Dependencies:** Server actions for snooze/complete. Supabase queries for broader risk signals.

---

### 1.4 Widget Customization / Rearrangement

**Current state:** Fixed two-column layout. Every user sees the same dashboard. Right column is 340px fixed. No personalization.

**Proposed improvement:** For a 3-person team, full drag-and-drop widget customization is over-engineered. Instead, implement **section collapse/expand with persistence**:
1. Each section header gets a chevron to collapse/expand.
2. Collapsed state saved to `localStorage` (or Supabase user preferences if auth is wired).
3. Add a "Customize" button that opens a checklist of sections to show/hide.
4. Let the right column width be togglable between 340px (compact) and 400px (wide).

This gives personalization without the complexity of a full grid layout system.

**Impact:** Low-Medium. Nice to have, not critical for 3 people. Becomes important if the team grows.
**Effort:** Small. localStorage + state management. No backend changes.
**Dependencies:** None.

---

### 1.5 Time-Aware Dashboard Sections

**Current state:** The dashboard shows the same content whether it is 7 AM Monday or 5 PM Friday. The greeting changes by time of day but nothing else adapts.

**Proposed improvement:** Make the dashboard contextually aware:
- **Morning (before 10am):** Prioritize "Today's Schedule" and "Needs Attention" at the top. Show "Your day starts with [first event] at [time]."
- **End of day (after 4pm):** Show a "Daily wrap-up" prompt: "You completed X tasks, logged Y interactions. Any notes before EOD?"
- **Friday afternoon:** Show a "Weekly summary" card: total revenue collected, deals advanced, tasks completed, next week's first meeting.
- **Monday morning:** Show "This week: X meetings, Y tasks due, Z invoices outstanding."

**Impact:** Medium. Reduces cognitive load by surfacing what matters *right now*.
**Effort:** Medium. Conditional rendering based on `new Date()`. Summary queries needed for wrap-up/weekly views.
**Dependencies:** None for basic version. Weekly summary needs aggregation queries.

---

### 1.6 Quick Metrics Row for Agency Health

**Current state:** Pipeline summary shows Active / Weighted / Won in a 3-column grid. Team section shows blockers. No utilization or capacity metrics.

**Proposed improvement:** Add a "Team Pulse" row below the pulse strip with 4 compact metrics:
1. **Utilization** = hours billed / hours available this week (needs time tracking, see Task improvements)
2. **Pipeline coverage** = weighted pipeline / monthly revenue target (e.g., "3.2x coverage" = healthy, "<1.5x" = danger)
3. **Average days to close** = mean time from discovery to closed_won across all historical deals
4. **Client satisfaction proxy** = % of action items completed on time in last 30 days

**Impact:** High. These are the metrics that determine if a 3-person agency survives or thrives.
**Effort:** Large. Utilization requires time tracking. The others can be computed from existing data.
**Dependencies:** Time tracking for utilization. Historical deal data for close velocity.

---

## 2. Pipeline / CRM

**Files:** `src/app/(app)/pipeline/page.tsx`, `src/components/pipeline/pipeline-board.tsx`, `pipeline-card.tsx`, `pipeline-column.tsx`, `src/lib/pipeline-constants.ts`, `src/app/(app)/clients/[id]/page.tsx`, `src/components/client/client-detail-view.tsx`

### Current State

- Kanban board with 6 stages: Discovery, Building MVP, Proposal, Build, Deliver, Maintain
- Drag-and-drop via `@dnd-kit/core` + `@dnd-kit/sortable`
- Pipeline cards show: company name, engagement name, contact name, deal value, days-in-stage badge (green/orange/red), next action due date
- Dragging calls `changeStage` server action to persist
- Client detail page shows engagement info, timeline (interactions), action items, and company contacts
- Stage change is optimistic with rollback on server error
- No analytics, no filtering, no conversion tracking

### 2.1 Drag-and-Drop Stage Transition Feedback

**Current state:** When you drag a card to a new column, it moves silently. The `changeStage` server action fires and records a stage_history entry. No visual confirmation. If the server action fails, the card rolls back, but there is no error toast.

**Proposed improvement:**
1. **Success toast:** After drop, show a toast: "[Company] moved to [Stage]" with an "Undo" button that reverts in 5 seconds.
2. **Stage transition dialog for critical moves:** When moving to "Proposal" or "Build" (commitment stages), show a confirmation dialog: "Moving [Company] to Build. Have you: [] Signed SOW, [] Received deposit, [] Set up project?" This prevents premature stage advancement.
3. **Confetti on Closed Won:** When dragging to a won state (currently filtered out of kanban, but should be accessible), trigger a brief celebration animation.
4. **Error handling:** Show a red toast on server action failure: "Failed to update stage. Card reverted."
5. **Stage transition animation:** Add a brief scale-up + green border flash on the card when it lands in a new column.

**Impact:** High. Stage transitions are the most critical CRM action. Feedback prevents errors and reinforces good habits.
**Effort:** Small-Medium. Toast system needed (see UX section). Confirmation dialog is a small modal. Undo requires a `revertStage` server action.
**Dependencies:** Toast/notification system (see 8.3).

---

### 2.2 Deal Velocity Tracking

**Current state:** Each pipeline card shows "Xd" for days in current stage via `daysInStage` computed from `stageEnteredAt`. The `stageHistory` table records every stage transition with timestamps. But this data is never surfaced as analytics.

**Proposed improvement:**
1. **Per-card velocity indicator:** Below the days-in-stage badge, show a small bar comparing this deal's time-in-stage to the average for that stage. "12d (avg: 8d)" with the bar filled proportionally. Instantly shows if a deal is lagging.
2. **Pipeline velocity dashboard section:** Add a row at the top of the Pipeline page showing average days per stage across all deals:
   ```
   Discovery: 5d avg | Building MVP: 14d avg | Proposal: 7d avg | Build: 21d avg | Deliver: 10d avg
   ```
3. **Historical velocity chart:** On the Finances or Pipeline page, show a line chart of average total cycle time (discovery to closed_won) per month. Trend line shows if the team is getting faster or slower at closing.
4. **Stage bottleneck highlighting:** If the average time in any stage exceeds a threshold (e.g., Proposal > 10 days), highlight that column header in orange with a tooltip: "Deals are getting stuck here. Average: 14 days."

**Impact:** High. Deal velocity directly predicts revenue. Knowing where deals slow down lets the team fix bottlenecks.
**Effort:** Medium. Stage history data already exists. Needs aggregation queries and UI components.
**Dependencies:** `stage_history` table (already exists and is populated by `changeStage` server action).

---

### 2.3 Pipeline Analytics Panel

**Current state:** The dashboard has a simple 3-metric pipeline summary (Active/Weighted/Won). No conversion rates, no funnel visualization, no win/loss analysis.

**Proposed improvement:** Add a collapsible "Analytics" panel at the top of the Pipeline page:
1. **Conversion funnel:** Visual funnel showing how many deals entered each stage and what % advanced. E.g., "Discovery (12) -> Proposal (8, 67%) -> Build (5, 63%) -> Won (4, 80%)."
2. **Win/loss ratio by source:** Bar chart showing conversion rate by source (website, referral, LinkedIn, cold). Answers "Where should we spend outreach time?"
3. **Revenue by stage:** Stacked bar showing total deal value sitting in each stage. Answers "Where is the money in our pipeline?"
4. **Monthly pipeline movement:** Table showing deals that entered, advanced, or exited the pipeline this month.
5. **Lost deal analysis:** List of closed_lost deals with reason (needs a `lossReason` field on engagements). Answers "Why are we losing?"

**Impact:** High. Pipeline analytics are how agencies forecast revenue and identify operational problems.
**Effort:** Large. Needs multiple queries, chart components (Recharts installed), and possibly a `lossReason` field migration.
**Dependencies:** Recharts (installed). Loss reason tracking needs schema change.

---

### 2.4 Smart Alerts for Pipeline

**Current state:** The dashboard shows overdue actions and stale engagements. But there is no proactive alerting system. A deal could sit in "Proposal" for 30 days without anyone noticing unless they check the board.

**Proposed improvement:** Implement a rule-based alert system:
1. **Deal stuck too long:** If a deal exceeds 2x the average time for its stage, flag it in Needs Attention with "Stuck in [Stage] for [X] days (avg: [Y] days)."
2. **No follow-up alert:** If no interaction has been logged on an active engagement in 7+ days, flag: "[Company] — no contact in [X] days."
3. **Proposal expiring:** If expected close date is within 3 days and stage is still Proposal, flag: "[Company] proposal expires in [X] days."
4. **High-value deal neglect:** If a deal with value > $10k has no action item due this week, flag: "[Company] ($[X]k) has no upcoming actions."
5. **Implementation:** Store alert rules as a configuration table or hardcoded rules engine. Compute alerts server-side in the dashboard query. Show as a dedicated "Alerts" tab or section.

**Impact:** High. Proactive alerts prevent revenue loss. A 3-person team cannot afford to let any deal fall through cracks.
**Effort:** Medium. Rule evaluation logic + dashboard integration. No new infrastructure.
**Dependencies:** Existing engagement + interaction + action data.

---

### 2.5 Bulk Actions on Engagements

**Current state:** All engagement operations are one-at-a-time. No way to select multiple engagements and act on them.

**Proposed improvement:** Add multi-select capability to the Pipeline board and Clients table:
1. **Shift+click to select multiple cards** on the Kanban board.
2. **Bulk actions toolbar** appears when 2+ cards selected: "Move to [Stage]", "Assign to [Person]", "Add tag", "Archive."
3. **On Clients table:** Checkbox column for multi-select. Bulk actions: "Export CSV", "Send bulk email", "Change stage."
4. **Confirmation dialog:** Always confirm bulk actions with "Apply to X engagements?"

**Impact:** Low. With ~10 active deals at a time, bulk actions save seconds. Becomes more important at scale.
**Effort:** Medium. Multi-select state management + batch server actions.
**Dependencies:** Server actions for batch operations.

---

### 2.6 Pipeline Filtering and Search

**Current state:** The Pipeline board shows all active engagements grouped by stage. No filtering. No search. No way to view by source, contact, value range, or tag.

**Proposed improvement:**
1. **Filter bar** above the Kanban board with dropdowns: Source (all/website/referral/linkedin/cold), Value range ($0-5k, $5k-15k, $15k+), Contact, Tags.
2. **Search field** that filters cards by company name, engagement name, or contact name as you type.
3. **Sort within columns:** By deal value (highest first), days in stage (longest first), or next action date (soonest first).
4. **Saved views:** Let users save filter combinations (e.g., "High-value deals", "My deals", "Overdue actions").

**Impact:** Medium. Essential once the pipeline has 15+ deals. Currently manageable with ~8 deals.
**Effort:** Small-Medium. Filter state + `useMemo` filtering. No backend changes needed.
**Dependencies:** None.

---

## 3. Task Management

**Files:** `src/components/tasks/tasks-board.tsx`, `task-card.tsx`, `task-detail-drawer.tsx`, `task-filters.tsx`, `add-task-modal.tsx`, `kanban-column.tsx`, `src/lib/mock-tasks.ts`

### Current State

- Kanban board with 4 columns: Todo, In Progress, Blocked, Done
- Drag-and-drop via `@dnd-kit/core`
- Task model: id, title, description, status, priority (urgent/high/normal/low), assignee (Nick/Alex/Hari), dueDate, linkedEntity (deal or project), createdAt
- Filters: assignee, priority, sort by (priority/dueDate/createdAt)
- Task detail drawer: edit title, description, status, priority, assignee, due date, linked entity. Delete with confirmation.
- All data is client-side mock data. No Supabase persistence for tasks yet.
- No subtasks, no time tracking, no recurring tasks, no list/timeline views

### 3.1 Task-Engagement-Project Linking

**Current state:** Tasks have a `linkedEntity` field that stores `{ type: "deal" | "project", id, name }`. This is a flat reference. On the client detail page, there is no "Tasks" tab showing linked tasks. On the project detail page, tasks are not surfaced.

**Proposed improvement:**
1. **Bidirectional linking:** When viewing a client/engagement detail page, show a "Tasks" section listing all tasks where `linkedEntity.id === engagement.id`. Same for project detail pages.
2. **Quick task creation from engagement:** Add a "+ Add task" button on the client detail page that pre-fills `linkedEntity` with the current engagement.
3. **Task count badges:** On pipeline cards, show a small badge: "3 tasks (1 blocked)" so the board communicates workload at a glance.
4. **Multiple links per task:** Allow a task to link to both a deal AND a project (common: "Build login page" is linked to both the deal "Client Portal" and the project "Client Portal Build").

**Impact:** High. Tasks disconnected from engagements/projects create information silos. This is the #1 structural improvement for task management.
**Effort:** Medium. Requires updating the Task interface, adding queries to detail pages, and UI integration.
**Dependencies:** Task persistence in Supabase (tasks are currently mock-only).

---

### 3.2 Subtasks / Checklists

**Current state:** Tasks have a title and description (plain text). No way to break a task into steps.

**Proposed improvement:**
1. **Checklist within task detail drawer:** Add an inline checklist editor below the description. Each checklist item has: text, completed boolean, assignee (optional).
2. **Progress indicator on task card:** Show "2/5" or a mini progress bar on the Kanban card representing checklist completion.
3. **Auto-complete:** When all checklist items are checked, prompt: "All subtasks done. Move to Done?"
4. **Data model:** Add `checklist: { id: string, text: string, completed: boolean }[]` to the Task interface.

**Impact:** Medium. Prevents the "task is too vague to start" problem. Especially useful for multi-step delivery tasks.
**Effort:** Small-Medium. Array field on task + inline editor UI. No new tables needed.
**Dependencies:** Task persistence in Supabase.

---

### 3.3 Time Estimates and Tracking

**Current state:** Tasks have no time estimate or actual time logged. The Projects page has `timeEntries` in its model (`src/lib/mock-projects.ts`) but it is not connected to tasks. No way to answer "How long did this take?" or "Are we on track?"

**Proposed improvement:**
1. **Time estimate on task creation:** Add optional "Estimated hours" field to the Add Task modal.
2. **Time logging in task detail drawer:** Add a "Log time" button that records `{ hours, date, person }` entries. Show total logged vs. estimate.
3. **Utilization view:** On the Tasks page, add a "Workload" tab showing hours allocated per person this week: Nick = 24h estimated (of 40h), Alex = 32h, Hari = 18h. Surfaces over/under-allocation.
4. **Burndown per project:** On the project detail page, show estimated vs. actual hours in a simple bar chart.
5. **Integration with invoicing:** Time entries become the basis for invoice line items (see Finance improvements).

**Impact:** High. Time tracking is how agencies measure profitability per project and prevent scope creep.
**Effort:** Large. New data model (time entries table), UI for logging, reporting views.
**Dependencies:** Supabase schema for time entries. Task persistence.

---

### 3.4 Recurring Tasks

**Current state:** All tasks are one-off. No recurrence. Common agency tasks that repeat (weekly client check-ins, monthly invoicing, quarterly reviews) must be manually created each time.

**Proposed improvement:**
1. **Recurrence field on task:** Add `recurrence: { frequency: "daily" | "weekly" | "biweekly" | "monthly", dayOfWeek?: number, dayOfMonth?: number } | null` to the Task model.
2. **Auto-generation:** A server-side cron job (or Supabase Edge Function) creates the next occurrence when the current one is marked Done.
3. **Recurrence indicator:** Show a small repeat icon on recurring task cards.
4. **Template library for recurring tasks:** Pre-built templates: "Weekly standup prep", "Monthly invoicing", "Quarterly client review."
5. **Skip/pause:** Allow skipping one occurrence without breaking the chain.

**Impact:** Medium-High. Eliminates manual overhead for repetitive work. Critical as the agency scales processes.
**Effort:** Medium. Recurrence logic + cron trigger. UI is simple (dropdown on task creation).
**Dependencies:** Supabase Edge Functions or a cron service. Task persistence.

---

### 3.5 Multiple View Modes (List, Timeline, Calendar)

**Current state:** Tasks are only shown as a Kanban board. No list view, no timeline/Gantt view, no calendar overlay.

**Proposed improvement:**
1. **List view:** Flat table with sortable columns (title, status, priority, assignee, due date, linked entity). Checkbox for bulk actions. More compact for scanning 30+ tasks.
2. **Timeline/Gantt view:** Horizontal bars showing task duration (created -> due date) grouped by project or assignee. Shows overlaps and scheduling conflicts. Use the existing date data.
3. **Calendar overlay:** Tasks with due dates appear on the Calendar page as a separate layer (toggle on/off). Different visual from events (e.g., dotted border).
4. **View toggle:** Three-icon toggle (Kanban | List | Timeline) in the Tasks page header, similar to the Assets page grid/list toggle.

**Impact:** Medium. List view is the most requested. Timeline is powerful for project planning but less critical for 3 people.
**Effort:** Medium. List view is straightforward. Timeline needs a horizontal scrollable component (or a library like `react-gantt-chart`).
**Dependencies:** None for list view. Timeline may benefit from a library.

---

### 3.6 Task Persistence in Supabase

**Current state:** Tasks are entirely client-side mock data (`mockTasks` array). Creating, editing, and deleting tasks only persists in React state. Page refresh resets everything.

**Proposed improvement:** This is a prerequisite for most other task improvements.
1. **Schema:** Create a `tasks` table in Supabase with columns matching the current `Task` interface + `checklist` JSONB, `timeEstimate`, `recurrence` JSONB.
2. **Server actions:** `createTask`, `updateTask`, `deleteTask`, `reorderTasks` server actions mirroring the existing mock CRUD.
3. **Optimistic updates:** Keep the current instant UI updates, sync to DB in background (same pattern as pipeline `changeStage`).
4. **Realtime:** Use Supabase Realtime (already set up in `use-realtime.ts`) to sync task changes across team members.

**Impact:** Critical. Without persistence, tasks are functionally a prototype.
**Effort:** Medium. Schema migration + server actions + swap mock calls.
**Dependencies:** Supabase connection (already configured).

---

## 4. Calendar

**Files:** `src/app/(app)/calendar/page.tsx`, `calendar-page-client.tsx`, `week-view.tsx`, `month-view.tsx`, `upcoming-sidebar.tsx`, `src/lib/mock-calendar.ts`, `src/lib/calendar-utils.ts`

### Current State

- Month view (mini calendar with event dots) + Week view (hourly grid) + Upcoming sidebar
- 3 event types: client_call, internal, deadline
- Add Event modal creates events and persists via `createCalendarEventAction` server action
- Navigation: prev/next month, Today button, click day to navigate week
- Event detail modal shows time, type, client, zoom link
- No Google Calendar integration. No availability tracking. No meeting prep.

### 4.1 Google Calendar Bidirectional Sync

**Current state:** Events are stored locally in Supabase + mock data. No connection to Google Calendar. The team uses Google Calendar externally, creating a dual-entry problem.

**Proposed improvement:**
1. **Google OAuth integration:** Add Google OAuth flow with `calendar.events` scope. Store refresh token per user.
2. **Import sync:** Pull Google Calendar events into the dashboard calendar on page load. Show them with a "G" badge to distinguish from native events.
3. **Export sync:** When creating an event in the dashboard, optionally push it to Google Calendar.
4. **Conflict detection:** When adding a new event, check for overlapping Google Calendar events and warn.
5. **Scope limitation for v1:** Start with read-only import (simpler OAuth scope). Add write later.

**Impact:** High. Eliminates the #1 friction point: maintaining two calendars.
**Effort:** Large. OAuth flow, Google Calendar API client, sync logic, conflict handling.
**Dependencies:** Google Cloud project setup. OAuth callback routes. Token storage.

---

### 4.2 Availability Tracking for Scheduling

**Current state:** No concept of availability. The calendar shows events but does not indicate free/busy slots. No Calendly-like scheduling.

**Proposed improvement:**
1. **Working hours config:** Per-user setting: "Available Mon-Fri 9am-5pm" stored in user preferences.
2. **Busy slot visualization:** On the week view, gray out time slots that have events. Show remaining availability as a counter: "Nick: 6h free today."
3. **Booking link integration:** Display the team's Calendly URL (already referenced in memory) as a "Share availability" button that copies the link.
4. **Team availability overlay:** When scheduling an internal meeting, show all 3 team members' calendars overlaid to find common free slots.

**Impact:** Medium. Most scheduling happens via Calendly already. Internal scheduling overlay is the highest-value piece.
**Effort:** Medium. Working hours config + visual overlay. Calendly integration is just a link.
**Dependencies:** Google Calendar sync (for real availability data) or manual event entry.

---

### 4.3 Meeting Prep Reminders

**Current state:** Events have a `client` field and optional `zoomLink`. No preparation notes, no pre-meeting context, no reminders.

**Proposed improvement:**
1. **Meeting prep section:** When viewing an event detail, show a "Prep" tab with: linked engagement details (last activity, open actions, deal value), recent interaction notes, and a free-text "prep notes" field.
2. **Auto-link events to engagements:** When an event's `client` field matches an engagement's `companyName`, automatically link them and surface the engagement context.
3. **Prep reminder:** 30 minutes before a meeting, show a notification (or dashboard banner): "Meeting with [Client] in 30 min. Open actions: [list]. Last contact: [date]."
4. **Post-meeting prompt:** After a meeting's end time, prompt: "How did the call with [Client] go? Add notes." This captures interactions while they are fresh.

**Impact:** High. Walking into a client call unprepared is the fastest way to lose a deal. Context at the point of need is transformative.
**Effort:** Medium. Auto-linking is a name match. Prep section is UI in the event detail. Reminders need a timer or notification system.
**Dependencies:** Notification system (see 8.3). Engagement data linking.

---

### 4.4 Day View and Agenda View

**Current state:** Two views: month (mini calendar) and week (hourly grid). No day view (expanded single day) or agenda view (vertical list of upcoming events across days).

**Proposed improvement:**
1. **Day view:** Clicking a day in the month view expands to a full-width hourly grid for just that day. Shows all events with full details inline (no modal needed for simple events).
2. **Agenda view:** A flat chronological list of all events for the next 14 days, grouped by day. Each entry shows time, title, client, type, and zoom link. More scannable than the week grid for "what's coming up."
3. **View toggle:** Four-button toggle: Day | Week | Month | Agenda. Remember last selection in localStorage.

**Impact:** Medium. Agenda view is the most useful addition for daily planning. Day view is standard calendar UX.
**Effort:** Small-Medium. Agenda is a filtered/sorted list (simplest view). Day view reuses the week grid component for one column.
**Dependencies:** None.

---

### 4.5 Drag-to-Reschedule Events

**Current state:** Events can only be rescheduled by editing fields in the event detail modal. No drag interaction on the week view.

**Proposed improvement:** On the week view, make event blocks draggable. Drag vertically to change time, drag horizontally to change day. On drop, update the event's `date` and `startHour` fields and persist via server action.

**Impact:** Low-Medium. Standard calendar UX but not critical with a small number of events.
**Effort:** Medium. Requires drag-and-drop on the hourly grid (different from the Kanban DnD already in use). Position calculations based on grid snap.
**Dependencies:** Event update server action.

---

## 5. Outreach

**Files:** `src/app/(app)/outreach/page.tsx` (large ~700 line client component), `src/lib/mock-outreach.ts`

### Current State

- Prospect list with CRUD (create, edit, delete prospects)
- Prospect model: name, email, phone, company, title, industry (HVAC/Electrical/Plumbing/Roofing/Solar), stage (cold/warm/hot/converted), LinkedIn URL, touch history
- Touch logging: log a touch (email/linkedin/phone/referral) with subject and content
- Stage advancement (cold -> warm -> hot -> converted)
- Filters by stage, industry, search
- Stats cards: total prospects, hot leads, active sequences, recent touches
- Sequence names are strings on each prospect, not a structured sequence system
- All data is client-side state. No Supabase persistence.
- Convert to engagement action available on hot leads

### 5.1 Email Template System

**Current state:** The Templates page (`src/app/(app)/templates/page.tsx`) has 12 hardcoded templates (outreach emails, proposals, SOWs, playbooks) displayed as read-only cards. No way to use a template when composing an outreach touch. The outreach "Log Touch" modal has a free-text content field.

**Proposed improvement:**
1. **Template picker in Log Touch modal:** When logging a touch with channel "email", add a "Use template" dropdown that inserts template content into the body.
2. **Template variable system:** Support variables like `{{first_name}}`, `{{company}}`, `{{industry}}` in template content. Auto-fill from the prospect's data when a template is selected.
3. **Template editor:** Make templates editable (currently read-only cards). Use Tiptap (already installed but unused!) for rich text editing with variable insertion toolbar.
4. **Template performance tracking:** Track which templates lead to the most stage advancements (cold -> warm, warm -> hot). Show "Template A: 40% response rate, Template B: 15%."
5. **Template categories for outreach stages:** Tag templates as "cold opener", "follow-up #1", "follow-up #2", "warm nurture", "hot close" so the right template surfaces at the right time.

**Impact:** High. Templates with variables eliminate rewriting the same email 50 times. Performance tracking tells you what actually works.
**Effort:** Medium. Tiptap editor integration + variable substitution logic + template CRUD in Supabase.
**Dependencies:** Tiptap (installed). Template persistence in Supabase.

---

### 5.2 Sequence Automation (Drip Campaigns)

**Current state:** Sequences are just a string label on each prospect (e.g., "HVAC Outreach v2", "Trades Cold Outreach"). There is a `mockSequences` array with names and step counts, but no actual sequence steps or automation.

**Proposed improvement:**
1. **Sequence builder:** Create/edit sequences as ordered lists of steps. Each step has: delay (e.g., "3 days after previous"), channel (email/linkedin), template (from the template library), and exit conditions (reply received, stage changed).
2. **Sequence enrollment:** When adding a prospect, assign them to a sequence. The system tracks which step they are on.
3. **Manual execution with reminders:** For v1, do not actually send emails automatically. Instead, when a step is due, show it in "Needs Attention" on the dashboard: "[Prospect] — Step 3 of HVAC Outreach due today." User clicks to see the pre-filled template and sends manually.
4. **Sequence analytics:** Per-sequence: total enrolled, completed, response rate, conversion rate (to engaged/converted).
5. **Pause/skip/remove from sequence:** Right-click or dropdown on prospect card.

**Impact:** High. Sequences are how agencies scale outreach beyond one-at-a-time. The manual-send model is appropriate for a 3-person team (avoids spam risk).
**Effort:** Large. Sequence data model, step tracking, due date calculation, dashboard integration.
**Dependencies:** Template system (5.1). Supabase persistence for outreach data.

---

### 5.3 Response Tracking and Analytics

**Current state:** Touch logging records channel, subject, content, and date. No concept of "did they respond?" No analytics beyond touch count and last touch date. Stats cards show totals but no rates.

**Proposed improvement:**
1. **Response field on touches:** When logging a follow-up touch, add a "In response to previous" toggle and a "Response type" dropdown: No response / Interested / Not interested / Booked meeting / Requested info.
2. **Response rate per channel:** Dashboard widget: "Email: 22% response, LinkedIn: 35% response, Phone: 45% response." Helps decide where to spend time.
3. **Response rate per industry:** "HVAC: 30% response, Solar: 18%." Identifies best-fit verticals.
4. **Stage conversion funnel:** Visual funnel: X prospects -> Y responded -> Z warm -> W hot -> V converted. Per sequence and per industry.
5. **Time-to-response metric:** Average days between outreach touch and response, by channel.

**Impact:** High. Without response tracking, outreach is flying blind. Knowing what works is how you double down on the right channels and industries.
**Effort:** Medium. Mostly UI/data model changes to touch entries + aggregation queries for analytics.
**Dependencies:** Outreach data persistence in Supabase.

---

### 5.4 LinkedIn Integration Design

**Current state:** Prospects have a `linkedinUrl` field rendered as an external link icon. LinkedIn is one of the touch channels. But there is no actual LinkedIn integration.

**Proposed improvement:**
1. **LinkedIn profile preview:** When a prospect has a LinkedIn URL, scrape or cache basic profile info (headline, company, connections). Show inline on the prospect card.
2. **LinkedIn activity feed:** Show recent LinkedIn posts from prospects (via LinkedIn API or a service like PhantomBuster). Helps craft personalized outreach.
3. **Connection request tracking:** When logging a LinkedIn touch, track: Request sent / Accepted / Message sent / Replied. Different from email tracking.
4. **Scope for v1:** Keep it manual — just add structured LinkedIn touch types (connection request, message, InMail, comment, like) instead of free-text. The URL remains a quick-launch link to their profile.

**Impact:** Medium. LinkedIn is the primary outreach channel for B2B services. Better tracking = better conversion.
**Effort:** Small for v1 (structured touch types). Large for API integration (LinkedIn API is restrictive; may need third-party tools).
**Dependencies:** LinkedIn API access or third-party service for any automation.

---

### 5.5 Lead Scoring

**Current state:** Prospects have a manual stage (cold/warm/hot) set by the user. No computed score based on behavior or attributes.

**Proposed improvement:**
1. **Attribute score:** Industry fit (HVAC/Solar = higher for STRVX's target market), company size (if available), title seniority. Configured as weighted factors.
2. **Engagement score:** Points for: responded to email (+10), clicked link (+5), booked meeting (+20), multiple touches with replies (+15). Decays over time (no activity in 14 days = -5/week).
3. **Composite score:** 0-100 scale displayed as a small gauge or number on the prospect card. Sorted view: highest-score prospects at top.
4. **Auto-stage suggestion:** When score crosses thresholds (e.g., 30 = warm, 60 = hot), suggest stage change: "[Prospect] score is 65. Move to Hot?"
5. **Score-based prioritization:** Dashboard "Focus list": top 5 prospects by score that need a follow-up.

**Impact:** Medium-High. Prevents wasting time on cold leads when hot ones need attention. Becomes critical at 50+ prospects.
**Effort:** Medium. Scoring engine is a simple function. UI is a number + bar. Auto-suggestion is a comparison.
**Dependencies:** Response tracking (5.3) for engagement score data.

---

### 5.6 Outreach Data Persistence

**Current state:** Like tasks, all outreach data is client-side `useState` initialized from mock data. Page refresh resets everything.

**Proposed improvement:** Create Supabase tables for prospects, touches, and sequences. Mirror the same optimistic update pattern used in the pipeline.

**Impact:** Critical. Without persistence, outreach is a prototype.
**Effort:** Medium. Schema migration + server actions.
**Dependencies:** Supabase connection.

---

## 6. Finance

**Files:** `src/app/(app)/finances/finances-client.tsx`, `src/app/(app)/invoices/page.tsx`, `src/app/(app)/invoices/[id]/page.tsx`, `src/app/(app)/expenses/page.tsx`, `src/app/(app)/revenue/page.tsx`, `src/lib/mock-finance.ts`

### Current State

- **Finances page:** Overview/Revenue/Expenses tabs. P&L summary (revenue, expenses, profit, margin, MRR). Revenue by client bar chart (CSS-based). Expense by category breakdown. Pipeline forecast section. Expense CRUD (add/edit/delete). Monthly revenue mini chart (CSS bars).
- **Invoices page:** Table of invoices with status badges (draft/sent/paid/overdue). Summary cards (outstanding, overdue, paid this month). Click through to invoice detail.
- **Invoice detail page:** Clean invoice layout with line items, subtotal, tax (8.75%), and total. strvx branding.
- **Expenses page:** Static table of mock expenses with category badges. Monthly burn and top category summary cards. No CRUD on this page (CRUD is on the Finances page).
- **Revenue page:** YTD, quarterly, MRR metrics. Monthly revenue bar chart. Revenue by client. Pipeline forecast deals.
- Data: `mockInvoices` (7 invoices), `mockMonthlyRevenue` (6 months), `mockExpenses` (8 entries). Supabase integration for invoices and expenses via queries.

### 6.1 Automated Invoice Generation from Engagements

**Current state:** Invoices are pre-created mock data or manually added to Supabase. There is no link between an engagement's deal value, payment schedule, and invoice creation.

**Proposed improvement:**
1. **Payment schedule on engagement:** Add a `paymentSchedule` field to engagements: e.g., `[{ milestone: "Deposit", percentage: 50, dueDate: "2026-04-01" }, { milestone: "Delivery", percentage: 50, dueDate: "2026-05-01" }]`.
2. **Auto-generate invoice from milestone:** When a milestone date approaches (7 days before), generate a draft invoice pre-filled with: client name, engagement name, amount (percentage of deal value), line items from the engagement's scope.
3. **Invoice from time entries:** If time tracking is implemented (see 3.3), generate invoices based on logged hours * rate, broken down by task/project.
4. **Dashboard alert for upcoming invoices:** "2 invoices to send this week: [Stability Group $4,000], [Summit Retail $8,750]."
5. **One-click send:** Mark invoice as "sent" and trigger an email (see Email integration).

**Impact:** High. Invoicing delays directly impact cash flow. Automated generation from milestones eliminates forgetting to invoice.
**Effort:** Large. Payment schedule model, milestone tracking, invoice generation logic, email sending.
**Dependencies:** Engagement detail model expansion. Email sending capability.

---

### 6.2 Stripe Payment Integration

**Current state:** No payment processing. Invoices have a status field (draft/sent/paid/overdue) updated manually. No payment links, no online payment.

**Proposed improvement:**
1. **Stripe Connect setup:** Integrate Stripe to generate payment links for each invoice.
2. **Payment link on invoice:** When viewing an invoice detail, show a "Create payment link" button that generates a Stripe checkout URL. Copy/paste into client email.
3. **Webhook listener:** Set up a Stripe webhook endpoint that listens for `checkout.session.completed` events. Automatically mark the invoice as "paid" with `paidDate`.
4. **Recurring billing for maintenance:** For clients on maintenance plans (Stability Group: $800/mo, Summit: $1,200/mo from mock data), set up Stripe subscriptions that auto-invoice monthly.
5. **Payment status dashboard widget:** Show "Awaiting payment: $X" with links to Stripe dashboard.

**Impact:** High. Online payment reduces average collection time from weeks to days.
**Effort:** Large. Stripe SDK integration, webhook handler, subscription management.
**Dependencies:** Stripe account. Environment variables. Webhook endpoint.

---

### 6.3 Expense Categorization and Reporting

**Current state:** Expenses have 7 categories (Software, Hosting, Marketing, Office, Travel, Contractors, Misc). The Finances page shows a category breakdown with CSS bars. The Expenses page is a flat table. No date filtering, no project attribution, no trend analysis.

**Proposed improvement:**
1. **Date range filtering:** Add month/quarter/year selector on the Expenses page. Filter by date range.
2. **Project attribution:** Link expenses to projects/engagements. Show cost per project. Answer: "How much did the Summit Retail project cost us?"
3. **Category trend chart:** Monthly expense by category over 6 months (line chart). Surfaces: "Our software costs jumped 40% this month."
4. **Budget vs. actual:** Set monthly budgets per category (e.g., Software: $500/mo). Show progress bar: "Software: $450 / $500 (90%)." Warn when approaching limit.
5. **Receipt upload:** Attach a photo/PDF receipt to each expense. Store in Supabase Storage.
6. **Recurring expense auto-creation:** For known recurring expenses (subscriptions from the Toolbox page), auto-create monthly expense entries.

**Impact:** Medium-High. Expense tracking without reporting is just data entry. Reports turn it into financial intelligence.
**Effort:** Medium. Filtering/charts are UI work over existing data. Budget system needs a config table. Receipt upload needs Supabase Storage.
**Dependencies:** Supabase Storage for receipts. Recharts for trend charts.

---

### 6.4 Tax Preparation Features

**Current state:** The invoice detail page applies 8.75% tax to line items. No tax reporting. No quarterly estimates. No categorization for tax deductions.

**Proposed improvement:**
1. **Tax category on expenses:** Tag expenses as deductible/non-deductible. Sub-categories: Business travel, Software, Contractors (1099-reportable), Marketing.
2. **Quarterly tax estimate:** Based on revenue - deductible expenses, calculate estimated quarterly tax payment. Show as a dashboard widget during tax months (Jan, Apr, Jun, Sep).
3. **1099 contractor tracking:** For expenses categorized as "Contractors", track vendor name and total paid. Generate a summary for 1099 filing at year end.
4. **Annual P&L report:** One-click generation of a yearly P&L statement formatted for accountant review. Export as PDF.
5. **Tax-related alerts:** "Q1 estimated tax payment due in 5 days. Estimated amount: $X."

**Impact:** Medium. Reduces end-of-year tax scramble. Quarterly estimates prevent underpayment penalties.
**Effort:** Medium. Mostly categorization and reporting on existing data. PDF generation needs a library.
**Dependencies:** Expense categorization improvements (6.3).

---

### 6.5 Profit & Loss Statements

**Current state:** The Finances page shows a P&L summary strip: Total Revenue, Total Expenses, Net Profit, Profit Margin, MRR. But it is a single snapshot with no time comparison or detail drill-down.

**Proposed improvement:**
1. **Monthly P&L table:** Standard accounting format: Revenue (by client), Cost of Revenue (contractors), Gross Profit, Operating Expenses (by category), Net Income. One column per month, last 6 months.
2. **Comparison view:** Show current month vs. previous month, with delta and percentage change per line item.
3. **Trend chart:** Net profit over last 12 months as a line chart. Target line showing breakeven.
4. **Cash flow view:** Different from P&L — shows when money actually came in vs. went out (based on invoice paid dates and expense dates). Important for a bootstrapped agency.
5. **Export to CSV/PDF:** For sharing with accountants or team.

**Impact:** High. P&L is the single most important financial document for a business. The current snapshot is insufficient for planning.
**Effort:** Medium. Data already exists (invoices + expenses). Needs structured aggregation and tabular UI.
**Dependencies:** None. Uses existing invoice and expense data.

---

## 7. Knowledge Base

**Files:** `src/app/(app)/docs/page.tsx`, `src/app/(app)/docs/[id]/page.tsx`, `src/app/(app)/templates/page.tsx`, `src/app/(app)/assets/page.tsx`, `src/lib/mock-docs.ts`

### Current State

- **Docs:** 8 documents in 4 folders (General, Clients, Technical, Templates). Stored as `content: string` (plain text with markdown-like formatting). Read-only — no editing. Custom markdown renderer that handles headings, lists, code blocks, tables. Links from docs list to detail page.
- **Templates:** 12 templates in 4 categories (Outreach, Proposals, SOW, Playbooks). Read-only cards with title, category, and description. No way to use/copy/edit templates.
- **Assets:** File manager with folder tree sidebar, list/grid toggle, search, type filters (All/Starred/Docs/Sheets/Slides). Google Drive "Connect" button (not functional). Mock assets with metadata (linked client, modified date, modified by, size). Star/unstar files.

### 7.1 Rich Text Editor with Tiptap

**Current state:** Documents are stored as plain text strings with markdown-like formatting. The detail page has a custom renderer that converts `#`, `##`, `-`, code fences, and tables to React elements. No editing capability. Content changes require code changes.

**Proposed improvement:**
1. **Replace custom renderer with Tiptap:** Tiptap core, starter-kit, link, placeholder, and code-block-lowlight are ALL already installed (`package.json` confirms). Switch from `content: string` to a Tiptap JSON document format.
2. **Inline editing:** Click "Edit" on a doc detail page to switch to Tiptap editor mode. Toolbar: bold, italic, headings, bullet/numbered lists, code blocks, links, dividers.
3. **Auto-save:** Debounced save (2 seconds after last keystroke) to Supabase.
4. **Create new docs:** "New document" button on the Docs page that opens a blank Tiptap editor with title and folder selection.
5. **Collaborative cursor (future):** Tiptap supports Yjs for real-time collaboration. Not needed for 3 people but trivially addable later.

**Impact:** High. A knowledge base you cannot edit is just a static wiki. Tiptap transforms it into a living system.
**Effort:** Medium. Tiptap is installed. Need to: build the editor component, migrate doc content format, add CRUD server actions, create Supabase table for docs.
**Dependencies:** Supabase persistence for documents.

---

### 7.2 Template Variable System

**Current state:** Templates are static text descriptions. No variable placeholders. No way to instantiate a template with client-specific data.

**Proposed improvement:**
1. **Variable syntax:** `{{client_name}}`, `{{contact_name}}`, `{{engagement_name}}`, `{{deal_value}}`, `{{company}}`, `{{date}}`, `{{sender_name}}`.
2. **Template instantiation flow:** When clicking "Use template", show a preview with variables highlighted in blue. Auto-fill variables from the selected engagement/prospect. Allow manual override.
3. **Output as rich text:** Render the filled template in Tiptap, let the user make final edits, then copy to clipboard or save as a doc.
4. **Variable registry:** Define available variables and their data sources in a config. Extensible for custom variables.
5. **Conditional blocks:** `{{#if maintenance_opted_in}}Monthly maintenance: ${{maintenance_fee}}/mo{{/if}}`. Keeps templates flexible without separate versions.

**Impact:** High. Variable templates are the bridge between "knowledge base" and "operational tool." Without them, templates are just reference docs.
**Effort:** Medium. Regex-based variable replacement + Tiptap rendering. Conditional blocks are more complex.
**Dependencies:** Tiptap editor (7.1). Engagement/prospect data access.

---

### 7.3 Asset Tagging and Search

**Current state:** Assets have metadata: name, type, folder, linked project, linked client, modified date, modified by, starred. Search filters by name only. Type filter covers document/spreadsheet/presentation. Folder tree provides hierarchy. No tags.

**Proposed improvement:**
1. **Tags on assets:** Add a `tags: string[]` field. Predefined tags: "proposal", "sow", "brand", "wireframe", "invoice", "meeting-notes". Plus custom tags.
2. **Tag filter:** Add a tag filter bar (horizontal pills) below the search. Click a tag to filter. Multiple tags = AND filter.
3. **Full-text search:** Search not just asset names but also linked client names, tags, and file descriptions.
4. **Related assets:** On asset detail (or hover), show "Related assets" based on shared tags, client, or project.
5. **Auto-tag from filename:** Use simple heuristics: filename contains "proposal" -> auto-tag "proposal". Contains "sow" or "statement" -> auto-tag "sow".

**Impact:** Medium. Current search-by-name is sufficient for ~15 assets. Tags become essential at 50+.
**Effort:** Small-Medium. Tag field + filter UI. Full-text search needs Supabase text search or pg_trgm.
**Dependencies:** Asset persistence in Supabase (currently mock data).

---

### 7.4 Version History for Documents

**Current state:** Docs show "Last edited [date]" and "By [author]". No history of changes. No way to see what was different yesterday.

**Proposed improvement:**
1. **Version snapshot on save:** When a doc is saved, store the previous version in a `doc_versions` table with `{ docId, content, savedAt, savedBy }`.
2. **Version list in doc detail:** Sidebar or dropdown showing "Version history: Today 2:30pm (Nick), Yesterday 4:15pm (Alex), Mar 25 (Nick)."
3. **Version diff:** Click a version to see what changed (added in green, removed in red). Tiptap content can be diffed at the JSON level.
4. **Restore version:** "Restore this version" button that replaces current content with the selected version (creating a new version entry for audit trail).
5. **Scope for v1:** Store last 10 versions per doc (no unlimited history to control storage).

**Impact:** Medium. Prevents "who deleted that paragraph?" panic. Essential for shared docs.
**Effort:** Medium. Version table + save hook + diff rendering UI.
**Dependencies:** Tiptap editor (7.1) for structured content. Doc persistence in Supabase.

---

## 8. UX / Design

**Files:** `src/components/layout/sidebar.tsx`, `src/components/command-palette.tsx`, `src/components/quick-add-bar.tsx`, `src/app/globals.css`, `src/app/(app)/layout.tsx`

### Current State

- Sidebar: 6 sections (CRM, Projects, Outreach, Finance, Goals, Knowledge) with icons. Mobile hamburger menu. Fixed width.
- Command palette: Cmd+K opens search with quick actions (new engagement, new contact, new task). Searches engagements and contacts via server action. Recent engagements shown when empty.
- QuickAddBar: Fixed bottom bar for quick note/action/meeting entry with client selector. Types via `/action`, `/meeting`, `/call` prefixes.
- No notification system (except ad-hoc toasts in outreach page).
- No dark mode.
- No keyboard shortcuts beyond Cmd+K.
- No undo/redo system.

### 8.1 Keyboard Shortcuts System

**Current state:** Only Cmd+K for command palette. No other keyboard shortcuts. The QuickAddBar responds to Enter/Tab/Escape but these are not discoverable.

**Proposed improvement:**
1. **Global shortcuts:**
   - `Cmd+K` — Command palette (exists)
   - `G then D` — Go to Dashboard
   - `G then P` — Go to Pipeline
   - `G then T` — Go to Tasks
   - `G then C` — Go to Calendar
   - `G then F` — Go to Finances
   - `N` — New (context-aware: on Pipeline = new engagement, on Tasks = new task, on Outreach = new prospect)
   - `?` — Show keyboard shortcuts help dialog
   - `Cmd+/` — Focus QuickAddBar
2. **Context shortcuts in Kanban:**
   - Arrow keys to navigate between cards
   - `Enter` to open card detail
   - `M` to move card (shows stage picker)
3. **Shortcuts help overlay:** `?` opens a modal showing all available shortcuts, grouped by context.
4. **Implementation:** Use a `useKeyboardShortcuts` hook that registers/deregisters listeners based on current route and active modals.

**Impact:** Medium. Power-user feature that significantly speeds up navigation for daily users.
**Effort:** Small-Medium. Event listeners + router navigation. The hard part is not conflicting with text inputs.
**Dependencies:** None.

---

### 8.2 Undo/Redo for Destructive Actions

**Current state:** Deleting a task shows a confirmation dialog. Deleting a prospect shows a confirmation dialog. But once confirmed, the action is irreversible. No undo. Moving a pipeline card has no undo.

**Proposed improvement:**
1. **Soft delete pattern:** Instead of `DELETE FROM`, set a `deletedAt` timestamp. Show a "Deleted. Undo?" toast for 5 seconds. If user clicks Undo, clear `deletedAt`. After 5 seconds, the item disappears from all views (but remains in DB for 30 days).
2. **Stage change undo:** After dragging a pipeline card, show toast: "[Company] moved to [Stage]. Undo?" with a 5-second window. Undo calls `changeStage` back to the previous stage.
3. **Action history stack:** Maintain a client-side stack of the last 10 actions. Cmd+Z pops the stack and reverts. Covers: task status change, engagement stage change, delete operations.
4. **Scope for v1:** Focus on the most destructive actions only: delete (tasks, prospects, expenses) and stage changes. Do not attempt to undo text edits (that is what version history covers).

**Impact:** Medium-High. Undo is a safety net that lets users act faster because they know mistakes are recoverable.
**Effort:** Medium. Soft delete pattern per entity + toast with timer + revert server actions.
**Dependencies:** Toast system (8.3).

---

### 8.3 Notification Center / Toast System

**Current state:** The outreach page has a one-off `Toast` component that shows for 2.5 seconds. No global toast system. No notification center. Server actions silently succeed or fail.

**Proposed improvement:**
1. **Global toast provider:** A `<ToastProvider>` in the root layout that exposes `useToast()` hook. Any component can call `toast.success("Saved")`, `toast.error("Failed")`, `toast.info("Moved to Build")`, `toast.undo("Deleted task", undoCallback)`.
2. **Toast stack:** Multiple toasts stack vertically in the bottom-right corner. Auto-dismiss after 3-5 seconds (configurable). Toasts with actions (Undo) stay until dismissed or timed out.
3. **Notification center:** A bell icon in the sidebar header showing unread notification count. Click to open a dropdown listing: overdue items, upcoming meetings (30 min), sequence steps due, invoices to send. Notifications persist in Supabase.
4. **Notification preferences:** Per-notification-type toggle: "Show toast", "Show in center", "Email" (future).
5. **Implementation approach:** Use `sonner` (lightweight toast library, works great with Next.js) or build custom with `framer-motion` (already installed).

**Impact:** High. A notification system is the nervous system of the app. Without it, every action is fire-and-forget with no feedback.
**Effort:** Small for toast system (sonner is ~10 lines to set up). Medium for notification center (needs a notifications table + queries).
**Dependencies:** None for toasts. Supabase table for persistent notifications.

---

### 8.4 Dark Mode

**Current state:** Light mode only. Colors are hardcoded as hex values throughout all components (e.g., `text-[#222]`, `bg-[#fafafa]`, `border-[#e0e0e0]`). No CSS custom properties. No theme system.

**Proposed improvement:**
1. **CSS custom properties:** Define a color token system:
   ```css
   :root {
     --color-bg: #ffffff;
     --color-bg-subtle: #fafafa;
     --color-border: #e0e0e0;
     --color-text: #222222;
     --color-text-muted: #888888;
     /* ... */
   }
   .dark {
     --color-bg: #0a0a0a;
     --color-bg-subtle: #141414;
     --color-border: #2a2a2a;
     --color-text: #e0e0e0;
     --color-text-muted: #777777;
   }
   ```
2. **Replace all hardcoded colors:** Convert `text-[#222]` to `text-[var(--color-text)]` or use Tailwind v4 theme tokens. This is the largest effort.
3. **Theme toggle:** Add a sun/moon icon in the sidebar footer. Store preference in localStorage. Apply `.dark` class to `<html>`.
4. **System preference respect:** Default to OS preference via `prefers-color-scheme` media query.
5. **Phased rollout:** Do not attempt all-at-once. Start with the sidebar and dashboard, then extend to each page incrementally.

**Impact:** Medium. Dark mode is a quality-of-life feature, especially for late-night work. The real value is forcing a proper token system that makes future theming trivial.
**Effort:** Large. Hundreds of hardcoded color values across ~40 files need to be converted to CSS variables. This is a significant refactor.
**Dependencies:** None, but best done before adding more pages.

---

### 8.5 Customizable Sidebar Sections

**Current state:** Sidebar has 6 fixed sections: CRM, Projects, Outreach, Finance, Goals, Knowledge. Each with 2-5 links. All sections always visible. Section order is hardcoded in `navSections` array. Mobile: full sidebar overlay with hamburger toggle.

**Proposed improvement:**
1. **Collapsible sections:** Each section label is clickable to collapse/expand its items. Collapsed state persists in localStorage. Default: all expanded.
2. **Section reordering:** In a "Customize sidebar" modal, drag sections to reorder. Save order in localStorage or Supabase user preferences.
3. **Favorites / pinned items:** Allow starring individual nav items. Starred items appear in a "Favorites" section at the top of the sidebar, above all other sections.
4. **Badge counts on nav items:** Show unread/actionable counts: Pipeline (3 overdue), Tasks (2 blocked), Invoices (1 overdue). Small red dot or number badge.
5. **Sidebar width toggle:** Double-click sidebar edge to collapse to icon-only mode (common in tools like Linear, Notion). Good for maximizing content area.

**Impact:** Medium. Badge counts are the highest-value piece — they surface urgency without opening each page.
**Effort:** Small for collapse + badges. Medium for reordering + icon-only mode.
**Dependencies:** None for basic version. Badge counts need aggregation queries.

---

### 8.6 Command Palette Enhancements

**Current state:** Cmd+K opens a modal with search and 3 quick actions (new engagement, new contact, new task). Search hits engagements and contacts via server action. Shows recent engagements when search is empty.

**Proposed improvement:**
1. **Navigation commands:** Type "Dashboard", "Pipeline", "Calendar" etc. to navigate. Fuzzy match against all page names.
2. **Action commands:** "Create invoice", "Log expense", "Add event", "Log time" — not just the 3 current quick actions.
3. **Entity search across all types:** Search not just engagements and contacts, but also tasks, docs, templates, invoices, prospects. Show type icons to differentiate.
4. **Recent actions:** Below recent engagements, show "Recent actions: Edited task X, Moved Y to Build, Logged note on Z." Quick re-navigation.
5. **Slash commands:** Type `/` to see available commands. `/invoice summit` creates an invoice for Summit Retail. `/note stability` opens quick note for Stability Group.
6. **Implementation:** The `cmdk` library is already installed. Leverage its section/group API for organized results.

**Impact:** Medium-High. A powerful command palette replaces sidebar navigation entirely for power users. The `cmdk` library makes this relatively easy.
**Effort:** Medium. Extend search to more entity types. Add navigation commands. Leverage existing `cmdk` dependency.
**Dependencies:** None. `cmdk` already installed.

---

### 8.7 Responsive Design Audit

**Current state:** The dashboard uses `grid-cols-3` and `grid-cols-[1fr_340px]` with no responsive breakpoints. Pipeline board is a horizontal scroll of Kanban columns. Tasks board is similar. Mobile sidebar exists but content pages are not optimized for mobile.

**Proposed improvement:**
1. **Dashboard:** Stack pulse cards vertically on mobile (`grid-cols-1 md:grid-cols-3`). Stack two-column layout (`grid-cols-1 lg:grid-cols-[1fr_340px]`).
2. **Pipeline:** On mobile, show one column at a time with horizontal swipe or dropdown column selector.
3. **Tasks:** Same as pipeline — single column on mobile with column switcher.
4. **Tables (invoices, expenses, contacts):** Horizontal scroll on mobile, or switch to card layout.
5. **Calendar:** Month view shrinks well. Week view needs a day-at-a-time mode on mobile.
6. **Assets:** Folder tree becomes a dropdown on mobile. Grid view defaults to 1-column.
7. **Typography:** Ensure minimum 14px font size on mobile for readability. Current 11-13px sizes are too small on phones.

**Impact:** Medium. If the team primarily uses the dashboard on desktop, this is lower priority. But any mobile usage (checking pipeline at a client meeting) makes this essential.
**Effort:** Large. Systematic pass through every page adding responsive breakpoints.
**Dependencies:** None, but benefits from the CSS variable system (8.4).

---

### 8.8 Loading States and Skeleton Screens

**Current state:** The app layout has a `loading.tsx` that shows while pages load. Individual components render immediately with mock data or Supabase data. No skeleton screens for server components. No loading states for optimistic updates.

**Proposed improvement:**
1. **Skeleton components:** For each major section (pipeline cards, task cards, calendar events, invoice table rows), create a skeleton variant that matches the exact dimensions with pulsing gray blocks.
2. **Suspense boundaries:** Wrap server-fetched sections in `<Suspense fallback={<Skeleton />}>` so the page shell renders instantly and data fills in.
3. **Optimistic update indicators:** When a server action is in-flight (e.g., changing a stage), show a subtle loading indicator on the affected card (spinner or opacity reduction).
4. **Error boundaries:** For each data-fetching section, add an error boundary that shows "Failed to load. Retry?" instead of crashing the entire page.

**Impact:** Medium. Improves perceived performance and prevents blank-page flashes.
**Effort:** Small-Medium. Skeleton components are simple. Suspense boundaries need careful placement.
**Dependencies:** None.

---

## Summary: Priority Matrix

### Critical (must do for the tool to be production-ready)
| # | Improvement | Impact | Effort |
|---|------------|--------|--------|
| 3.6 | Task persistence in Supabase | Critical | Medium |
| 5.6 | Outreach data persistence | Critical | Medium |
| 8.3 | Toast/notification system | High | Small |

### High Priority (significant operational value)
| # | Improvement | Impact | Effort |
|---|------------|--------|--------|
| 1.2 | Revenue trend sparkline | High | Small |
| 1.3 | Smarter Needs Attention | High | Medium |
| 2.1 | Drag-and-drop transition feedback | High | Small-Med |
| 2.2 | Deal velocity tracking | High | Medium |
| 2.4 | Smart pipeline alerts | High | Medium |
| 3.1 | Task-engagement-project linking | High | Medium |
| 4.3 | Meeting prep reminders | High | Medium |
| 5.1 | Email template system (Tiptap) | High | Medium |
| 6.1 | Automated invoice generation | High | Large |
| 6.5 | Profit & loss statements | High | Medium |
| 7.1 | Rich text editor with Tiptap | High | Medium |
| 7.2 | Template variable system | High | Medium |

### Medium Priority (quality of life and scale preparation)
| # | Improvement | Impact | Effort |
|---|------------|--------|--------|
| 1.1 | Activity heatmap | Medium | Small |
| 1.5 | Time-aware dashboard | Medium | Medium |
| 2.3 | Pipeline analytics panel | High | Large |
| 3.2 | Subtasks / checklists | Medium | Small-Med |
| 3.3 | Time estimates and tracking | High | Large |
| 3.4 | Recurring tasks | Med-High | Medium |
| 3.5 | Multiple view modes | Medium | Medium |
| 4.1 | Google Calendar sync | High | Large |
| 4.2 | Availability tracking | Medium | Medium |
| 4.4 | Day + agenda views | Medium | Small-Med |
| 5.2 | Sequence automation | High | Large |
| 5.3 | Response tracking/analytics | High | Medium |
| 5.5 | Lead scoring | Med-High | Medium |
| 6.2 | Stripe payment integration | High | Large |
| 6.3 | Expense reporting improvements | Med-High | Medium |
| 7.3 | Asset tagging and search | Medium | Small-Med |
| 7.4 | Document version history | Medium | Medium |
| 8.1 | Keyboard shortcuts | Medium | Small-Med |
| 8.2 | Undo/redo for destructive actions | Med-High | Medium |
| 8.5 | Customizable sidebar + badges | Medium | Small-Med |
| 8.6 | Command palette enhancements | Med-High | Medium |

### Lower Priority (nice to have)
| # | Improvement | Impact | Effort |
|---|------------|--------|--------|
| 1.4 | Widget customization | Low-Med | Small |
| 1.6 | Quick metrics (utilization, etc.) | High | Large |
| 2.5 | Bulk actions on engagements | Low | Medium |
| 2.6 | Pipeline filtering and search | Medium | Small-Med |
| 4.5 | Drag-to-reschedule events | Low-Med | Medium |
| 5.4 | LinkedIn integration | Medium | Large |
| 6.4 | Tax preparation features | Medium | Medium |
| 8.4 | Dark mode | Medium | Large |
| 8.7 | Responsive design audit | Medium | Large |
| 8.8 | Loading states / skeletons | Medium | Small-Med |

---

## Recommended Implementation Order

**Phase 1 — Foundation (data persistence + feedback)**
1. Task persistence in Supabase (3.6)
2. Outreach data persistence (5.6)
3. Global toast system (8.3)
4. Drag-and-drop transition feedback (2.1)

**Phase 2 — Intelligence (analytics + alerts)**
5. Smarter Needs Attention (1.3)
6. Smart pipeline alerts (2.4)
7. Deal velocity tracking (2.2)
8. Revenue sparkline on dashboard (1.2)

**Phase 3 — Content (editing + templates)**
9. Tiptap rich text editor for docs (7.1)
10. Template variable system (7.2)
11. Email template system in outreach (5.1)
12. Task-engagement linking (3.1)

**Phase 4 — Finance (invoicing + reporting)**
13. P&L statements (6.5)
14. Automated invoice generation (6.1)
15. Expense reporting improvements (6.3)

**Phase 5 — Power features (automation + scale)**
16. Subtasks/checklists (3.2)
17. Sequence automation (5.2)
18. Response tracking (5.3)
19. Meeting prep reminders (4.3)
20. Calendar day + agenda views (4.4)

**Phase 6 — Polish (UX + keyboard + responsive)**
21. Keyboard shortcuts (8.1)
22. Undo/redo (8.2)
23. Command palette enhancements (8.6)
24. Sidebar badges + customization (8.5)
