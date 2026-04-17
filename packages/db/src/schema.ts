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
  index,
  uniqueIndex,
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

export const recurringTypeEnum = pgEnum("recurring_type", [
  "retainer",
  "milestone",
  "commission",
]);

export const recurringStatusEnum = pgEnum("recurring_status", [
  "active",
  "paused",
  "cancelled",
  "completed",
]);

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
]);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "matched",
  "unmatched",
  "partial",
  "manual",
]);

export const matchMethodEnum = pgEnum("match_method", [
  "auto",
  "manual",
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

export const contacts = pgTable(
  "contacts",
  {
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
  },
  (table) => [
    index("contacts_company_idx").on(table.companyId),
  ]
);

// ── Engagements (renamed from "clients" per autoplan) ──
// One company can have multiple engagements (repeat clients).
// Pipeline stage, interactions, and next_actions belong here.

export const engagements = pgTable(
  "engagements",
  {
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
  },
  (table) => [
    index("engagements_archived_stage_idx").on(table.archivedAt, table.stage),
    index("engagements_company_idx").on(table.companyId),
  ]
);

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

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    type: interactionTypeEnum("type").notNull(),
    content: text("content").notNull(),
    externalRef: text("external_ref").unique(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }), // for meetings
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("interactions_engagement_created_idx").on(table.engagementId, table.createdAt),
    index("interactions_scheduled_idx").on(table.scheduledAt),
  ]
);

// ── Next Actions (mutable checklist) ───────────────────

export const nextActions = pgTable(
  "next_actions",
  {
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
  },
  (table) => [
    index("next_actions_engagement_completed_due_idx").on(table.engagementId, table.completed, table.dueDate),
  ]
);

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

export const tasks = pgTable(
  "tasks",
  {
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
  },
  (table) => [
    index("tasks_project_idx").on(table.projectId),
    index("tasks_engagement_idx").on(table.engagementId),
  ]
);

export const taskAssignees = pgTable("task_assignees", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
});

// ── Recurring Invoice Schedules ───────────────────────

export const recurringInvoiceSchedules = pgTable("recurring_invoice_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id, { onDelete: "cascade" }),
  type: recurringTypeEnum("type").notNull(),
  status: recurringStatusEnum("status").notNull().default("active"),
  frequency: recurringFrequencyEnum("frequency").notNull().default("monthly"),
  nextRunDate: date("next_run_date").notNull(),
  lineItemTemplate: jsonb("line_item_template"),
  commissionRate: numeric("commission_rate"),
  commissionSourceUrl: text("commission_source_url"),
  milestoneSchedule: jsonb("milestone_schedule"),
  notes: text("notes"),
  autoSend: boolean("auto_send").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Invoices ──────────────────────────────────────────

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceNumber: text("invoice_number").notNull(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
  recurringScheduleId: uuid("recurring_schedule_id").references(() => recurringInvoiceSchedules.id, { onDelete: "set null" }),
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
  commissionRevenue: numeric("commission_revenue"),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Invoice Reconciliations ──────────────────────────

export const invoiceReconciliations = pgTable("invoice_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  stripePayoutId: text("stripe_payout_id"),
  mercuryTransactionId: text("mercury_transaction_id"),
  stripeAmount: numeric("stripe_amount"),
  mercuryAmount: numeric("mercury_amount"),
  status: reconciliationStatusEnum("status").notNull().default("unmatched"),
  matchedAt: timestamp("matched_at", { withTimezone: true }),
  matchMethod: matchMethodEnum("match_method").notNull().default("auto"),
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
// ── Partner Enums ────────────────────────────────────

export const partnerStageEnum = pgEnum("partner_stage", [
  "prospective",
  "onboarding",
  "active",
  "on_hold",
  "churned",
]);

export const partnerLinkRoleEnum = pgEnum("partner_link_role", [
  "referrer",
  "subcontractor",
  "co_builder",
  "consultant",
  "vendor",
]);

export const partnerInteractionTypeEnum = pgEnum("partner_interaction_type", [
  "note",
  "meeting",
  "call",
  "email",
  "stage_change",
]);

export const partnerInvoiceDirectionEnum = pgEnum("partner_invoice_direction", [
  "payable",
  "receivable",
]);

export const partnerInvoiceStatusEnum = pgEnum("partner_invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
]);

// ── Partners ─────────────────────────────────────────

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  stage: partnerStageEnum("stage").notNull().default("prospective"),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  tags: text("tags").array(),
  commissionRate: numeric("commission_rate"),
  hourlyRate: numeric("hourly_rate"),
  flatRate: numeric("flat_rate"),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerContacts = pgTable("partner_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  linkedinUrl: text("linkedin_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerLinks = pgTable("partner_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id, { onDelete: "cascade" }),
  engagementId: uuid("engagement_id").references(() => engagements.id, {
    onDelete: "cascade",
  }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  role: partnerLinkRoleEnum("role").notNull(),
  terms: text("terms"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerInteractions = pgTable("partner_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id, { onDelete: "cascade" }),
  type: partnerInteractionTypeEnum("type").notNull(),
  content: text("content").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerInvoices = pgTable("partner_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id, { onDelete: "cascade" }),
  engagementId: uuid("engagement_id").references(() => engagements.id, {
    onDelete: "set null",
  }),
  direction: partnerInvoiceDirectionEnum("direction").notNull(),
  amount: numeric("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  description: text("description").notNull(),
  status: partnerInvoiceStatusEnum("status").notNull().default("draft"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerStageHistory = pgTable("partner_stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id, { onDelete: "cascade" }),
  stage: partnerStageEnum("stage").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  exitedAt: timestamp("exited_at", { withTimezone: true }),
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
  meetingType: text("meeting_type"), // "discovery" | "proposal" | "revision" | "in_person"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Follow-up Links (persistent booking links per engagement) ─
export const followUpLinks = pgTable("follow_up_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id, { onDelete: "cascade" }),
  meetingType: text("meeting_type").notNull().default("proposal"), // "proposal" | "revision" | "in_person"
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

// ── Audit Logs ──────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(), // e.g. "stage_change", "invoice.create", "engagement.delete"
    entityType: text("entity_type").notNull(), // e.g. "engagement", "invoice", "prospect"
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata"), // action-specific details (old/new values, etc.)
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_user_idx").on(table.userId),
    index("audit_logs_created_idx").on(table.createdAt),
  ]
);

// ── Credit Cards (local enrichment for Mercury cards) ─────────────

export const creditCards = pgTable("credit_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  mercuryCardId: text("mercury_card_id").notNull().unique(),
  cardNickname: text("card_nickname"),
  assignedEmployee: text("assigned_employee"),
  creditLimit: numeric("credit_limit"),
  rewardRate: numeric("reward_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardBudgets = pgTable("card_budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  creditCardId: uuid("credit_card_id")
    .notNull()
    .references(() => creditCards.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  monthlyLimit: numeric("monthly_limit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardReceipts = pgTable("card_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  mercuryTransactionId: text("mercury_transaction_id").notNull(),
  creditCardId: uuid("credit_card_id")
    .notNull()
    .references(() => creditCards.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardAlerts = pgTable("card_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  creditCardId: uuid("credit_card_id")
    .notNull()
    .references(() => creditCards.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(),
  thresholdValue: numeric("threshold_value").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Skills & Agents Enums ─────────────────────────────

export const skillLibraryInstallMethodEnum = pgEnum("skill_library_install_method", [
  "copy-paste",
  "npm",
  "shadcn-cli",
]);

export const skillLibraryCategoryEnum = pgEnum("skill_library_category", [
  "base",
  "animation",
  "editor",
  "data",
  "ai",
  "full",
  "utility",
]);

export const skillComponentCategoryEnum = pgEnum("skill_component_category", [
  "form",
  "layout",
  "data-display",
  "overlay",
  "navigation",
  "feedback",
  "animation",
  "text-effect",
  "chart",
  "editor",
  "ai",
  "utility",
  "background",
  "button",
  "card",
  "table",
  "input",
]);

export const skillComponentStatusEnum = pgEnum("skill_component_status", [
  "available",
  "installed",
  "approved",
  "deprecated",
]);

export const skillTypeEnum = pgEnum("skill_type", [
  "preset",
  "custom",
]);

export const skillCategoryEnum = pgEnum("skill_category", [
  "layout",
  "design-tokens",
  "component-preference",
  "behavioral",
  "pattern",
]);

export const agentTypeEnum = pgEnum("agent_type", [
  "builder",
  "linter",
  "reviewer",
  "automation",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "active",
  "paused",
  "draft",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "running",
  "success",
  "failed",
]);

// ── Skill Libraries ───────────────────────────────────

export const skillLibraries = pgTable("skill_libraries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  url: text("url"),
  githubUrl: text("github_url"),
  description: text("description"),
  installMethod: skillLibraryInstallMethodEnum("install_method").notNull().default("npm"),
  license: text("license"),
  category: skillLibraryCategoryEnum("category").notNull().default("base"),
  isActive: boolean("is_active").notNull().default(true),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Skill Components ──────────────────────────────────

export const skillComponents = pgTable(
  "skill_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => skillLibraries.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    category: skillComponentCategoryEnum("category").notNull().default("utility"),
    installCommand: text("install_command"),
    importPath: text("import_path"),
    dependencies: text("dependencies").array(),
    propsSummary: jsonb("props_summary"),
    keyProps: text("key_props"),
    whenToUse: text("when_to_use"),
    status: skillComponentStatusEnum("status").notNull().default("available"),
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("skill_components_library_idx").on(table.libraryId),
    index("skill_components_category_idx").on(table.category),
    uniqueIndex("skill_components_library_slug_idx").on(table.libraryId, table.slug),
  ]
);

// ── Skills (rules + patterns) ─────────────────────────

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  type: skillTypeEnum("type").notNull().default("custom"),
  category: skillCategoryEnum("category").notNull().default("pattern"),
  scope: text("scope").notNull().default("importable"),
  rules: jsonb("rules"),
  codeSnippets: jsonb("code_snippets"),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Skill-Component Links ─────────────────────────────

export const skillComponentLinks = pgTable(
  "skill_component_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => skillComponents.id, { onDelete: "cascade" }),
    context: text("context"),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (table) => [
    index("skill_component_links_skill_idx").on(table.skillId),
    index("skill_component_links_component_idx").on(table.componentId),
    uniqueIndex("skill_component_links_unique_idx").on(table.skillId, table.componentId),
  ]
);

// ── Agents ────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  type: agentTypeEnum("type").notNull().default("builder"),
  status: agentStatusEnum("status").notNull().default("draft"),
  config: jsonb("config"),
  skillIds: uuid("skill_ids").array(),
  trigger: text("trigger"),
  identity: text("identity"),
  includeCorrections: boolean("include_corrections").notNull().default(true),
  includeComponents: boolean("include_components").notNull().default(true),
  deployPath: text("deploy_path"),
  deployedAt: timestamp("deployed_at", { withTimezone: true }),
  deployedOutput: text("deployed_output"),
  ownerId: uuid("owner_id").references(() => users.id),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Agent-Rule Links (composition) ────────────────────

export const agentRuleLinks = pgTable(
  "agent_rule_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    included: boolean("included").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_rule_links_agent_idx").on(table.agentId),
    uniqueIndex("agent_rule_links_unique_idx").on(table.agentId, table.skillId),
  ]
);

// ── Agent Runs ────────────────────────────────────────

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    triggeredBy: uuid("triggered_by").references(() => users.id),
    input: text("input"),
    output: text("output"),
    status: agentRunStatusEnum("status").notNull().default("running"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_runs_agent_idx").on(table.agentId),
  ]
);

// ── Corrections (learnings from past mistakes) ────────

export const correctionSeverityEnum = pgEnum("correction_severity", [
  "critical",
  "important",
  "minor",
]);

export const correctionCategoryEnum = pgEnum("correction_category", [
  "layout",
  "component-choice",
  "spacing",
  "scrolling",
  "responsive",
  "accessibility",
  "performance",
  "styling",
  "pattern",
  "other",
]);

export const corrections = pgTable("corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  wrongApproach: text("wrong_approach"),
  correctApproach: text("correct_approach"),
  codeExample: text("code_example"),
  severity: correctionSeverityEnum("severity").notNull().default("important"),
  category: correctionCategoryEnum("category").notNull().default("other"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Patterns (extracted codebase layout patterns) ─────

export const patterns = pgTable("patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  archetype: text("archetype").notNull(),
  sourceProject: text("source_project").notNull(),
  sourceFile: text("source_file"),
  layoutTree: text("layout_tree").notNull(),
  codeExample: text("code_example"),
  annotations: jsonb("annotations"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
