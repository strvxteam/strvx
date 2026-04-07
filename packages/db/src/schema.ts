import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────

export const stageEnum = pgEnum("stage", [
  "lead",
  "contacted",
  "discovery",
  "building_mvp",
  "proposal",
  "negotiation",
  "build",
  "deliver",
  "maintain",
  "closed_won",
  "closed_lost",
]);

export const priorityEnum = pgEnum("priority", [
  "urgent",
  "high",
  "normal",
  "low",
]);

export const interactionTypeEnum = pgEnum("interaction_type", [
  "note",
  "meeting",
  "action",
  "stage_change",
]);

// ── Users ──────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authId: uuid("auth_id").unique(), // Supabase Auth uid — synced on first login
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  status: text("status").notNull().default("available"), // available | busy
  googleRefreshToken: text("google_refresh_token"),
  calendarId: text("calendar_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Companies ──────────────────────────────────────────

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  industry: text("industry"),
  apolloOrganizationId: text("apollo_organization_id"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Contacts ───────────────────────────────────────────

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  linkedinUrl: text("linkedin_url"),
  apolloContactId: text("apollo_contact_id"),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Engagements (renamed from "clients" per autoplan) ──
// One company can have multiple engagements (repeat clients).
// Pipeline stage, interactions, and next_actions belong here.

export const engagements = pgTable("engagements", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  primaryContactId: uuid("primary_contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(), // e.g. "AI Dashboard Project"
  stage: stageEnum("stage").notNull().default("lead"),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  dealValue: numeric("deal_value"),
  expectedCloseDate: date("expected_close_date"),
  probability: numeric("probability"),
  source: text("source"),
  maintenanceOptedIn: boolean("maintenance_opted_in").notNull().default(false),
  maintenanceMonthlyFee: numeric("maintenance_monthly_fee"),
  maintenanceNextCheckin: date("maintenance_next_checkin"),
  tags: text("tags").array(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Stage History (preserves full stage duration data) ──

export const stageHistory = pgTable("stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id, { onDelete: "cascade" }),
  stage: stageEnum("stage").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  exitedAt: timestamp("exited_at", { withTimezone: true }),
});

// ── Interactions (append-only timeline) ────────────────

export const interactions = pgTable("interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  type: interactionTypeEnum("type").notNull(),
  content: text("content").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }), // for meetings
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Next Actions (mutable checklist) ───────────────────

export const nextActions = pgTable("next_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  description: text("description").notNull(),
  priority: priorityEnum("priority").notNull().default("normal"),
  dueDate: date("due_date"),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sourceInteractionId: uuid("source_interaction_id").references(
    () => interactions.id
  ),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Projects ──────────────────────────────────────────

// ── Monitored Sites ──────────────────────────────────

export const monitoredSites = pgTable("monitored_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull().default("client"), // "internal" | "client"
  checkIntervalMinutes: integer("check_interval_minutes").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uptimeChecks = pgTable("uptime_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => monitoredSites.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // "up" | "down"
  statusCode: integer("status_code"),
  responseMs: integer("response_ms"),
  errorMessage: text("error_message"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Projects ──────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("scoping"),
  client: text("client"),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  team: text("team").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectMembers = pgTable("project_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  role: text("role").notNull().default("member"),
});

// ── Calendar Events ───────────────────────────────────

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  type: text("type").notNull().default("internal"),
  date: date("date").notNull(),
  startHour: numeric("start_hour").notNull().default("10"),
  durationHours: numeric("duration_hours").notNull().default("1"),
  client: text("client"),
  zoomLink: text("zoom_link"),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  googleEventId: text("google_event_id"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Tasks ─────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("normal"),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskAssignees = pgTable("task_assignees", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
});

// ── Invoices ──────────────────────────────────────────

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceNumber: text("invoice_number").notNull(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull(),
  amount: numeric("amount").notNull(),
  taxRate: numeric("tax_rate").default("0"),
  status: text("status").notNull().default("draft"),
  issuedDate: date("issued_date"),
  dueDate: date("due_date"),
  paidDate: date("paid_date"),
  lineItems: jsonb("line_items"),
  notes: text("notes"),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripePaymentUrl: text("stripe_payment_url"),
  clientEmail: text("client_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Expenses ──────────────────────────────────────────

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  description: text("description").notNull(),
  amount: numeric("amount").notNull(),
  category: text("category").notNull().default("other"),
  date: date("date").notNull(),
  recurring: boolean("recurring").default(false),
  vendor: text("vendor"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Goals ─────────────────────────────────────────────

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  targetValue: numeric("target_value").notNull(),
  currentValue: numeric("current_value").notNull().default("0"),
  unit: text("unit").notNull().default("usd"),
  deadline: date("deadline"),
  achieved: boolean("achieved").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Time Entries ─────────────────────────────────────

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  hours: numeric("hours").notNull(),
  description: text("description").notNull(),
  billable: boolean("billable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Marketing Posts ───────────────────────────────────

export const marketingPosts = pgTable("marketing_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content"),
  platform: text("platform").notNull().default("linkedin"),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  authorId: uuid("author_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Documents ─────────────────────────────────────────

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: jsonb("content"),
  contentText: text("content_text"),
  authorId: uuid("author_id").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Portal Access Tokens ─────────────────────────────

export const portalTokens = pgTable("portal_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  contactEmail: text("contact_email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Gmail Sync State ─────────────────────────────────

export const gmailSyncState = pgTable("gmail_sync_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  lastHistoryId: text("last_history_id"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  syncedMessageCount: integer("synced_message_count").notNull().default(0),
});

// ── Booking Status ───────────────────────────────────
export const bookingStatusEnum = pgEnum("booking_status", [
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);

// ── Bookings (landing page discovery calls) ──────────
export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  clientPhone: text("client_phone"),
  clientCompany: text("client_company"),
  serviceType: text("service_type").notNull().default("discovery"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  status: bookingStatusEnum("status").notNull().default("confirmed"),
  googleEventIds: jsonb("google_event_ids"),
  meetLink: text("meet_link"),
  notes: text("notes"),
  notesSummary: text("notes_summary"),
  notesActionItems: jsonb("notes_action_items"),
  reminderSent24h: boolean("reminder_sent_24h").notNull().default(false),
  reminderSent1h: boolean("reminder_sent_1h").notNull().default(false),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
  followUpToken: text("follow_up_token"), // soft ref to follow_up_links.token
  meetingType: text("meeting_type"), // "discovery" | "proposal" | "revision"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Follow-up Links (persistent booking links per engagement) ─
export const followUpLinks = pgTable("follow_up_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id, { onDelete: "cascade" }),
  meetingType: text("meeting_type").notNull().default("proposal"), // "proposal" | "revision"
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Booking Members (junction: bookings <-> users) ───
export const bookingMembers = pgTable("booking_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});
