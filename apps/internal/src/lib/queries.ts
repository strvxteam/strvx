import { db } from "./db";
import {
  engagements,
  companies,
  contacts,
  interactions,
  nextActions,
  users,
  calendarEvents,
  tasks,
  taskAssignees,
  projects,
  invoices,
  expenses,
  goals,
  marketingPosts,
  documents,
  timeEntries,
  monitoredSites,
  uptimeChecks,
  followUpLinks,
  recurringInvoiceSchedules,
  invoiceReconciliations,
  creditCards,
  cardBudgets,
  cardReceipts,
  cardAlerts,
} from "./db/schema";
import { eq, desc, and, lte, isNull, isNotNull, sql, count } from "drizzle-orm";

// ── Dashboard Queries ──────────────────────────────────

export async function getAtRiskItems(userId?: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // 1. Overdue next actions
  const overdueActions = await db
    .select({
      id: nextActions.id,
      description: nextActions.description,
      dueDate: nextActions.dueDate,
      ownerId: nextActions.ownerId,
      engagementId: nextActions.engagementId,
      engagementName: engagements.name,
      companyName: companies.name,
    })
    .from(nextActions)
    .innerJoin(engagements, eq(nextActions.engagementId, engagements.id))
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .where(
      and(
        eq(nextActions.completed, false),
        isNull(nextActions.archivedAt),
        isNull(engagements.archivedAt),
        lte(nextActions.dueDate, now.toISOString().split("T")[0]),
        userId ? eq(nextActions.ownerId, userId) : undefined
      )
    )
    .orderBy(nextActions.dueDate);

  // 2. Stale engagements (no interaction > 7 days, no pending action, not in maintain)
  const staleEngagements = await db.execute(sql`
    SELECT e.id, e.name, e.stage, c.name as company_name,
      MAX(i.created_at) as last_interaction_at
    FROM engagements e
    JOIN companies c ON e.company_id = c.id
    LEFT JOIN interactions i ON i.engagement_id = e.id
    LEFT JOIN next_actions na ON na.engagement_id = e.id
      AND na.completed = false AND na.archived_at IS NULL
    WHERE e.archived_at IS NULL
      AND e.stage != 'maintain'
      AND e.stage NOT IN ('closed_won', 'closed_lost')
      AND na.id IS NULL
    GROUP BY e.id, e.name, e.stage, c.name
    HAVING MAX(i.created_at) < ${sevenDaysAgo.toISOString()}
      OR MAX(i.created_at) IS NULL
  `);

  // 3. Upcoming meetings without prep notes
  const unpreparedMeetings = await db.execute(sql`
    SELECT i.id, i.content, i.scheduled_at, i.engagement_id,
      e.name as engagement_name, c.name as company_name
    FROM interactions i
    JOIN engagements e ON i.engagement_id = e.id
    JOIN companies c ON e.company_id = c.id
    WHERE i.type = 'meeting'
      AND i.scheduled_at IS NOT NULL
      AND i.scheduled_at > NOW()
      AND i.scheduled_at < ${tomorrow.toISOString()}
      AND e.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM interactions prep
        WHERE prep.engagement_id = i.engagement_id
          AND prep.type = 'note'
          AND prep.created_at > i.created_at
          AND prep.created_at < i.scheduled_at
      )
  `);

  return { overdueActions, staleEngagements, unpreparedMeetings };
}

export async function getDashboardMetrics() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [overdueResult] = await db
    .select({ count: count() })
    .from(nextActions)
    .innerJoin(engagements, eq(nextActions.engagementId, engagements.id))
    .where(
      and(
        eq(nextActions.completed, false),
        isNull(nextActions.archivedAt),
        isNull(engagements.archivedAt),
        lte(nextActions.dueDate, today)
      )
    );

  const [meetingsResult] = await db
    .select({ count: count() })
    .from(interactions)
    .innerJoin(engagements, eq(interactions.engagementId, engagements.id))
    .where(
      and(
        eq(interactions.type, "meeting"),
        isNull(engagements.archivedAt),
        sql`${interactions.scheduledAt} >= ${startOfDay.toISOString()}`,
        sql`${interactions.scheduledAt} < ${endOfDay.toISOString()}`
      )
    );

  const [activeResult] = await db
    .select({ count: count() })
    .from(engagements)
    .where(isNull(engagements.archivedAt));

  return {
    overdueActions: overdueResult?.count ?? 0,
    meetingsToday: meetingsResult?.count ?? 0,
    activeEngagements: activeResult?.count ?? 0,
  };
}

export async function getPipelineCounts() {
  const result = await db
    .select({
      stage: engagements.stage,
      count: count(),
    })
    .from(engagements)
    .where(isNull(engagements.archivedAt))
    .groupBy(engagements.stage);

  const counts: Record<string, number> = {
    lead: 0,
    contacted: 0,
    discovery: 0,
    proposal: 0,
    negotiation: 0,
    build: 0,
    deliver: 0,
    maintain: 0,
    closed_won: 0,
    closed_lost: 0,
  };
  for (const row of result) {
    counts[row.stage] = row.count;
  }
  return counts;
}

export async function getRecentActivity(limit = 10) {
  return db
    .select({
      id: interactions.id,
      type: interactions.type,
      content: interactions.content,
      createdAt: interactions.createdAt,
      authorName: users.name,
      engagementName: engagements.name,
      companyName: companies.name,
      engagementId: interactions.engagementId,
    })
    .from(interactions)
    .innerJoin(engagements, eq(interactions.engagementId, engagements.id))
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .innerJoin(users, eq(interactions.authorId, users.id))
    .where(isNull(engagements.archivedAt))
    .orderBy(desc(interactions.createdAt))
    .limit(limit);
}

// ── Engagement Queries ─────────────────────────────────

export async function getEngagement(id: string) {
  const [result] = await db
    .select({
      id: engagements.id,
      name: engagements.name,
      stage: engagements.stage,
      stageEnteredAt: engagements.stageEnteredAt,
      dealValue: engagements.dealValue,
      expectedCloseDate: engagements.expectedCloseDate,
      probability: engagements.probability,
      source: engagements.source,
      maintenanceOptedIn: engagements.maintenanceOptedIn,
      maintenanceMonthlyFee: engagements.maintenanceMonthlyFee,
      maintenanceNextCheckin: engagements.maintenanceNextCheckin,
      tags: engagements.tags,
      createdAt: engagements.createdAt,
      companyId: engagements.companyId,
      companyName: companies.name,
      companyIndustry: companies.industry,
      contactId: engagements.primaryContactId,
      contactName: contacts.name,
      contactEmail: contacts.email,
    })
    .from(engagements)
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .leftJoin(contacts, eq(engagements.primaryContactId, contacts.id))
    .where(eq(engagements.id, id));

  return result;
}

export async function getEngagementTimeline(engagementId: string) {
  return db
    .select({
      id: interactions.id,
      type: interactions.type,
      content: interactions.content,
      scheduledAt: interactions.scheduledAt,
      createdAt: interactions.createdAt,
      authorName: users.name,
    })
    .from(interactions)
    .innerJoin(users, eq(interactions.authorId, users.id))
    .where(eq(interactions.engagementId, engagementId))
    .orderBy(desc(interactions.createdAt));
}

export async function getEngagementActions(engagementId: string) {
  return db
    .select({
      id: nextActions.id,
      description: nextActions.description,
      dueDate: nextActions.dueDate,
      completed: nextActions.completed,
      completedAt: nextActions.completedAt,
      ownerName: users.name,
      ownerId: nextActions.ownerId,
    })
    .from(nextActions)
    .innerJoin(users, eq(nextActions.ownerId, users.id))
    .where(
      and(
        eq(nextActions.engagementId, engagementId),
        isNull(nextActions.archivedAt)
      )
    )
    .orderBy(nextActions.completed, nextActions.dueDate);
}

// ── Pipeline Queries ───────────────────────────────────

export async function getPipelineEngagements() {
  return db
    .select({
      id: engagements.id,
      name: engagements.name,
      stage: engagements.stage,
      stageEnteredAt: engagements.stageEnteredAt,
      dealValue: engagements.dealValue,
      expectedCloseDate: engagements.expectedCloseDate,
      probability: engagements.probability,
      source: engagements.source,
      maintenanceOptedIn: engagements.maintenanceOptedIn,
      maintenanceMonthlyFee: engagements.maintenanceMonthlyFee,
      maintenanceNextCheckin: engagements.maintenanceNextCheckin,
      tags: engagements.tags,
      createdAt: engagements.createdAt,
      companyId: engagements.companyId,
      companyName: companies.name,
      companyIndustry: companies.industry,
      contactId: engagements.primaryContactId,
      contactName: contacts.name,
      contactEmail: contacts.email,
      nextActionDueDate: sql<string | null>`(
        SELECT MIN(na.due_date)
        FROM next_actions na
        WHERE na.engagement_id = ${engagements.id}
          AND na.completed = false
          AND na.archived_at IS NULL
      )`,
    })
    .from(engagements)
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .leftJoin(contacts, eq(engagements.primaryContactId, contacts.id))
    .where(isNull(engagements.archivedAt))
    .orderBy(engagements.stageEnteredAt);
}

// ── Contact Queries ────────────────────────────────────

export async function getContacts() {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      role: contacts.role,
      companyName: companies.name,
      companyId: contacts.companyId,
      lastInteraction: sql<string | null>`(
        SELECT MAX(i.created_at)
        FROM interactions i
        JOIN engagements e ON i.engagement_id = e.id
        WHERE e.company_id = ${contacts.companyId}
      )`,
      engagementId: sql<string | null>`(
        SELECT e.id FROM engagements e
        WHERE e.company_id = ${contacts.companyId}
          AND e.archived_at IS NULL
        ORDER BY e.created_at DESC LIMIT 1
      )`,
      engagementName: sql<string | null>`(
        SELECT e.name FROM engagements e
        WHERE e.company_id = ${contacts.companyId}
          AND e.archived_at IS NULL
        ORDER BY e.created_at DESC LIMIT 1
      )`,
      engagementStage: sql<string | null>`(
        SELECT e.stage FROM engagements e
        WHERE e.company_id = ${contacts.companyId}
          AND e.archived_at IS NULL
        ORDER BY e.created_at DESC LIMIT 1
      )`,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(isNull(contacts.archivedAt))
    .orderBy(contacts.name);
}

export async function getAllContactsByCompany() {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      role: contacts.role,
      linkedinUrl: contacts.linkedinUrl,
      companyName: companies.name,
      companyId: contacts.companyId,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(isNull(contacts.archivedAt))
    .orderBy(contacts.name);

  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!grouped[row.companyId]) grouped[row.companyId] = [];
    grouped[row.companyId].push(row);
  }
  return grouped;
}

export async function getAllEngagementTimelines() {
  const rows = await db
    .select({
      id: interactions.id,
      engagementId: interactions.engagementId,
      type: interactions.type,
      content: interactions.content,
      scheduledAt: interactions.scheduledAt,
      createdAt: interactions.createdAt,
      authorName: users.name,
    })
    .from(interactions)
    .innerJoin(users, eq(interactions.authorId, users.id))
    .orderBy(desc(interactions.createdAt));

  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!grouped[row.engagementId]) grouped[row.engagementId] = [];
    grouped[row.engagementId].push(row);
  }
  return grouped;
}

export async function getAllEngagementActions() {
  const rows = await db
    .select({
      id: nextActions.id,
      engagementId: nextActions.engagementId,
      description: nextActions.description,
      dueDate: nextActions.dueDate,
      completed: nextActions.completed,
      completedAt: nextActions.completedAt,
      ownerName: users.name,
      ownerId: nextActions.ownerId,
    })
    .from(nextActions)
    .innerJoin(users, eq(nextActions.ownerId, users.id))
    .where(isNull(nextActions.archivedAt))
    .orderBy(nextActions.completed, nextActions.dueDate);

  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!grouped[row.engagementId]) grouped[row.engagementId] = [];
    grouped[row.engagementId].push(row);
  }
  return grouped;
}

// ── User Queries ───────────────────────────────────────

/** Resolve the logged-in user for server components. */
export async function getCurrentUserForPage() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user?.email) {
      const dbUser = await getUserByEmail(user.email);
      if (dbUser) return dbUser;
    }
  } catch { /* auth service unavailable */ }

  // Dev fallback
  if (process.env.NODE_ENV !== "production") {
    const [fallback] = await db.select().from(users).limit(1);
    return fallback ?? null;
  }
  return null;
}

export async function getUsers() {
  return db.select().from(users);
}

export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  return user;
}

// ── Contacts by Company ───────────────────────────────

export async function getContactsByCompany(companyId: string) {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      role: contacts.role,
      companyName: companies.name,
      companyId: contacts.companyId,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(
      and(
        eq(contacts.companyId, companyId),
        isNull(contacts.archivedAt)
      )
    )
    .orderBy(contacts.name);
}

// ── Search ─────────────────────────────────────────────

export async function searchEngagements(query: string) {
  const searchTerm = `%${query}%`;
  return db
    .select({
      id: engagements.id,
      name: engagements.name,
      stage: engagements.stage,
      companyName: companies.name,
      contactName: contacts.name,
    })
    .from(engagements)
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .leftJoin(contacts, eq(engagements.primaryContactId, contacts.id))
    .where(
      and(
        isNull(engagements.archivedAt),
        sql`(
          ${companies.name} ILIKE ${searchTerm}
          OR ${engagements.name} ILIKE ${searchTerm}
          OR ${contacts.name} ILIKE ${searchTerm}
        )`
      )
    )
    .limit(10);
}

// ── Company Queries ──────────────────────────────────

export async function getCompanies() {
  return db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(companies.name);
}

export async function createCompany(name: string) {
  const [company] = await db
    .insert(companies)
    .values({ name })
    .returning({ id: companies.id, name: companies.name });
  return company;
}

// ── Calendar Queries ──────────────────────────────────

export async function getCalendarEvents() {
  return db
    .select()
    .from(calendarEvents)
    .orderBy(calendarEvents.date, calendarEvents.startHour);
}

export async function createCalendarEvent(data: {
  title: string;
  type: string;
  date: string;
  startHour: number;
  durationHours: number;
  client?: string | null;
  zoomLink?: string | null;
  engagementId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
  googleEventId?: string | null;
}) {
  const [event] = await db
    .insert(calendarEvents)
    .values({
      title: data.title,
      type: data.type,
      date: data.date,
      startHour: String(data.startHour),
      durationHours: String(data.durationHours),
      client: data.client || null,
      zoomLink: data.zoomLink || null,
      engagementId: data.engagementId || null,
      projectId: data.projectId || null,
      createdBy: data.createdBy || null,
      googleEventId: data.googleEventId || null,
    })
    .returning();
  return event;
}

export async function getCalendarEventById(id: string) {
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id));
  return event;
}

export async function updateCalendarEvent(
  eventId: string,
  data: {
    title?: string;
    type?: string;
    date?: string;
    startHour?: number;
    durationHours?: number;
    client?: string | null;
    zoomLink?: string | null;
  }
) {
  const setData: Record<string, unknown> = {};
  if (data.title !== undefined) setData.title = data.title;
  if (data.type !== undefined) setData.type = data.type;
  if (data.date !== undefined) setData.date = data.date;
  if (data.startHour !== undefined) setData.startHour = String(data.startHour);
  if (data.durationHours !== undefined) setData.durationHours = String(data.durationHours);
  if (data.client !== undefined) setData.client = data.client;
  if (data.zoomLink !== undefined) setData.zoomLink = data.zoomLink;

  if (Object.keys(setData).length === 0) return null;

  const [updated] = await db
    .update(calendarEvents)
    .set(setData)
    .where(eq(calendarEvents.id, eventId))
    .returning();
  return updated;
}

export async function deleteCalendarEvent(eventId: string) {
  await db.delete(calendarEvents).where(eq(calendarEvents.id, eventId));
}

// ── Task Queries ──────────────────────────────────────

export async function getTasks(limit = 500) {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      engagementId: tasks.engagementId,
      projectId: tasks.projectId,
      assigneeName: users.name,
      assigneeId: taskAssignees.userId,
    })
    .from(tasks)
    .leftJoin(taskAssignees, eq(tasks.id, taskAssignees.taskId))
    .leftJoin(users, eq(taskAssignees.userId, users.id))
    .orderBy(tasks.createdAt)
    .limit(limit);

  // Aggregate: one row per task with assignees as arrays
  const taskMap = new Map<string, {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    completedAt: Date | null;
    createdAt: Date | null;
    engagementId: string | null;
    projectId: string | null;
    assigneeNames: string[];
    assigneeIds: string[];
  }>();

  for (const row of rows) {
    if (!taskMap.has(row.id)) {
      taskMap.set(row.id, {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        dueDate: row.dueDate,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        engagementId: row.engagementId,
        projectId: row.projectId,
        assigneeNames: [],
        assigneeIds: [],
      });
    }
    const task = taskMap.get(row.id)!;
    if (row.assigneeName && row.assigneeId) {
      task.assigneeNames.push(row.assigneeName);
      task.assigneeIds.push(row.assigneeId);
    }
  }

  return Array.from(taskMap.values());
}

export async function getTask(id: string) {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      engagementId: tasks.engagementId,
      projectId: tasks.projectId,
      assigneeName: users.name,
      assigneeId: taskAssignees.userId,
    })
    .from(tasks)
    .leftJoin(taskAssignees, eq(tasks.id, taskAssignees.taskId))
    .leftJoin(users, eq(taskAssignees.userId, users.id))
    .where(eq(tasks.id, id));

  if (rows.length === 0) return undefined;

  const first = rows[0];
  const assigneeNames: string[] = [];
  const assigneeIds: string[] = [];
  for (const row of rows) {
    if (row.assigneeName && row.assigneeId) {
      assigneeNames.push(row.assigneeName);
      assigneeIds.push(row.assigneeId);
    }
  }

  return {
    id: first.id,
    title: first.title,
    description: first.description,
    status: first.status,
    priority: first.priority,
    dueDate: first.dueDate,
    completedAt: first.completedAt,
    createdAt: first.createdAt,
    engagementId: first.engagementId,
    projectId: first.projectId,
    assigneeNames,
    assigneeIds,
  };
}

// ── Project Queries ───────────────────────────────────

export async function getProjects() {
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function getProject(id: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));
  return project;
}

// ── Invoice Queries ───────────────────────────────────

export async function getInvoices(limit = 500) {
  return db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(limit);
}

export async function getInvoice(id: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, id));
  return invoice;
}

// ── Recurring Invoice Schedule Queries ───────────────

export async function getRecurringSchedules() {
  return db
    .select({
      id: recurringInvoiceSchedules.id,
      type: recurringInvoiceSchedules.type,
      status: recurringInvoiceSchedules.status,
      frequency: recurringInvoiceSchedules.frequency,
      nextRunDate: recurringInvoiceSchedules.nextRunDate,
      autoSend: recurringInvoiceSchedules.autoSend,
      commissionRate: recurringInvoiceSchedules.commissionRate,
      engagementId: recurringInvoiceSchedules.engagementId,
      engagementName: engagements.name,
      companyName: companies.name,
      createdAt: recurringInvoiceSchedules.createdAt,
    })
    .from(recurringInvoiceSchedules)
    .innerJoin(engagements, eq(recurringInvoiceSchedules.engagementId, engagements.id))
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .orderBy(recurringInvoiceSchedules.nextRunDate);
}

export async function getRecurringSchedule(id: string) {
  const [schedule] = await db
    .select()
    .from(recurringInvoiceSchedules)
    .where(eq(recurringInvoiceSchedules.id, id));
  return schedule;
}

export async function getDueSchedules() {
  const today = new Date().toISOString().split("T")[0];
  return db
    .select()
    .from(recurringInvoiceSchedules)
    .where(
      and(
        eq(recurringInvoiceSchedules.status, "active"),
        lte(recurringInvoiceSchedules.nextRunDate, today)
      )
    );
}

// ── Reconciliation Queries ───────────────────────────

export async function getReconciliationForInvoice(invoiceId: string) {
  const [rec] = await db
    .select()
    .from(invoiceReconciliations)
    .where(eq(invoiceReconciliations.invoiceId, invoiceId));
  return rec;
}

export async function getUnmatchedReconciliations() {
  return db
    .select({
      id: invoiceReconciliations.id,
      invoiceId: invoiceReconciliations.invoiceId,
      invoiceNumber: invoices.invoiceNumber,
      clientName: invoices.clientName,
      stripePayoutId: invoiceReconciliations.stripePayoutId,
      stripeAmount: invoiceReconciliations.stripeAmount,
      status: invoiceReconciliations.status,
      createdAt: invoiceReconciliations.createdAt,
    })
    .from(invoiceReconciliations)
    .innerJoin(invoices, eq(invoiceReconciliations.invoiceId, invoices.id))
    .where(eq(invoiceReconciliations.status, "unmatched"))
    .orderBy(desc(invoiceReconciliations.createdAt));
}

export async function getOverdueUnremindedInvoices() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "sent"),
        lte(invoices.dueDate, threeDaysAgo),
        isNull(invoices.reminderSentAt)
      )
    );
}

// ── Expense Queries ───────────────────────────────────

export async function getExpenses(limit = 500) {
  return db.select().from(expenses).orderBy(desc(expenses.date)).limit(limit);
}

// ── Goal Queries ──────────────────────────────────────

export async function getGoals() {
  return db.select().from(goals).orderBy(goals.createdAt);
}

// ── Marketing Queries ─────────────────────────────────

export async function getMarketingPosts(limit = 200) {
  return db.select().from(marketingPosts).orderBy(desc(marketingPosts.createdAt)).limit(limit);
}

// ── Document Queries ──────────────────────────────────

export async function getDocuments(limit = 200) {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      contentText: documents.contentText,
      authorId: documents.authorId,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .orderBy(desc(documents.updatedAt))
    .limit(limit);
}

export async function getDocument(id: string) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id));
  return doc;
}

// ── Monitoring Queries ────────────────────────────────

export async function getMonitoredSites() {
  return db.select().from(monitoredSites).orderBy(monitoredSites.name);
}

export async function getSiteUptimeHistory(siteId: string, hours = 24) {
  return db.execute(sql`
    SELECT status, status_code, response_ms, error_message, checked_at
    FROM uptime_checks
    WHERE site_id = ${siteId}
      AND checked_at > NOW() - INTERVAL '${sql.raw(String(hours))} hours'
    ORDER BY checked_at DESC
    LIMIT 200
  `);
}

export async function getAllSitesLatestStatus() {
  const result = await db.execute(sql`
    SELECT DISTINCT ON (uc.site_id)
      ms.id as site_id,
      ms.name,
      ms.url,
      ms.type,
      ms.is_active,
      uc.status,
      uc.status_code,
      uc.response_ms,
      uc.error_message,
      uc.checked_at,
      (SELECT COUNT(*) FILTER (WHERE u2.status = 'up')::float /
       NULLIF(COUNT(*)::float, 0) * 100
       FROM uptime_checks u2
       WHERE u2.site_id = ms.id
         AND u2.checked_at > NOW() - INTERVAL '24 hours'
      ) as uptime_24h,
      (SELECT ROUND(AVG(u3.response_ms))
       FROM uptime_checks u3
       WHERE u3.site_id = ms.id
         AND u3.status = 'up'
         AND u3.checked_at > NOW() - INTERVAL '1 hour'
      ) as avg_response_1h
    FROM monitored_sites ms
    LEFT JOIN uptime_checks uc ON uc.site_id = ms.id
    ORDER BY uc.site_id, uc.checked_at DESC
  `);
  return result as unknown as {
    site_id: string;
    name: string;
    url: string;
    type: string;
    is_active: boolean;
    status: string | null;
    status_code: number | null;
    response_ms: number | null;
    error_message: string | null;
    checked_at: string | null;
    uptime_24h: number | null;
    avg_response_1h: number | null;
  }[];
}

export async function getSiteCheckHistory(siteId: string) {
  const result = await db.execute(sql`
    SELECT status, response_ms, checked_at
    FROM uptime_checks
    WHERE site_id = ${siteId}
      AND checked_at > NOW() - INTERVAL '24 hours'
    ORDER BY checked_at ASC
  `);
  return result as unknown as { status: string; response_ms: number | null; checked_at: string }[];
}

// ── Maintenance Queries ───────────────────────────────

export async function getMaintenanceClients() {
  const result = await db.execute(sql`
    SELECT
      e.id,
      e.name as engagement_name,
      c.name as company_name,
      e.maintenance_monthly_fee,
      e.maintenance_next_checkin,
      e.maintenance_opted_in,
      e.stage_entered_at,
      EXTRACT(EPOCH FROM (NOW() - e.stage_entered_at)) / 86400 as days_in_maintain,
      (SELECT MAX(i.created_at) FROM interactions i WHERE i.engagement_id = e.id) as last_interaction,
      EXTRACT(EPOCH FROM (NOW() - COALESCE(
        (SELECT MAX(i.created_at) FROM interactions i WHERE i.engagement_id = e.id),
        e.created_at
      ))) / 86400 as days_since_interaction,
      (SELECT COUNT(*) FROM next_actions na
       WHERE na.engagement_id = e.id AND na.completed = false AND na.archived_at IS NULL
      )::int as open_actions,
      (SELECT COUNT(*) FROM next_actions na
       WHERE na.engagement_id = e.id AND na.completed = false
       AND na.archived_at IS NULL AND na.due_date < CURRENT_DATE
      )::int as overdue_actions,
      (SELECT p.id FROM projects p WHERE p.engagement_id = e.id LIMIT 1) as project_id,
      (SELECT p.name FROM projects p WHERE p.engagement_id = e.id LIMIT 1) as project_name
    FROM engagements e
    JOIN companies c ON e.company_id = c.id
    WHERE e.stage = 'maintain'
      AND e.archived_at IS NULL
    ORDER BY e.maintenance_next_checkin ASC NULLS LAST
  `);
  return result as unknown as {
    id: string;
    engagement_name: string;
    company_name: string;
    maintenance_monthly_fee: string | null;
    maintenance_next_checkin: string | null;
    maintenance_opted_in: boolean;
    days_in_maintain: string;
    days_since_interaction: string;
    last_interaction: string | null;
    open_actions: number;
    overdue_actions: number;
    project_id: string | null;
    project_name: string | null;
  }[];
}

// ── Finance Queries ──────────────────────────────────

export async function getMonthlyRevenue() {
  return db.execute(sql`
    SELECT
      date_trunc('month', paid_date) as month,
      SUM(amount::numeric) as revenue
    FROM invoices
    WHERE status = 'paid' AND paid_date IS NOT NULL
    GROUP BY date_trunc('month', paid_date)
    ORDER BY month
  `);
}

export async function getMRR() {
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${engagements.maintenanceMonthlyFee}::numeric), 0)`,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.maintenanceOptedIn, true),
        isNull(engagements.archivedAt)
      )
    );
  return Number(result[0]?.total ?? 0);
}

// ── Invoice Builder Queries ──────────────────────────

export async function getCompaniesWithContacts() {
  const companiesList = await db
    .select({ id: companies.id, name: companies.name, stripeCustomerId: companies.stripeCustomerId })
    .from(companies)
    .orderBy(companies.name);

  const contactsList = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      companyId: contacts.companyId,
    })
    .from(contacts)
    .where(isNull(contacts.archivedAt));

  return companiesList.map((c) => ({
    ...c,
    contacts: contactsList.filter((ct) => ct.companyId === c.id),
  }));
}

// ── Time Entry Queries ───────────────────────────────

export async function getTimeEntriesByProject(projectId: string) {
  return db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      hours: timeEntries.hours,
      description: timeEntries.description,
      billable: timeEntries.billable,
      userName: users.name,
      userId: timeEntries.userId,
      createdAt: timeEntries.createdAt,
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .where(eq(timeEntries.projectId, projectId))
    .orderBy(desc(timeEntries.date));
}

export async function getTimeEntrySummaryByProject(projectId: string) {
  const result = await db
    .select({
      totalHours: sql<string>`COALESCE(SUM(${timeEntries.hours}::numeric), 0)`,
      billableHours: sql<string>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN ${timeEntries.hours}::numeric ELSE 0 END), 0)`,
      entryCount: count(),
    })
    .from(timeEntries)
    .where(eq(timeEntries.projectId, projectId));
  return {
    totalHours: Number(result[0]?.totalHours ?? 0),
    billableHours: Number(result[0]?.billableHours ?? 0),
    entryCount: result[0]?.entryCount ?? 0,
  };
}

// ── Team Workload ─────────────────────────────────────

export async function getTeamWorkload() {
  const result = await db.execute(sql`
    SELECT
      u.id,
      u.name,
      COALESCE(task_counts.open_tasks, 0)::int as open_tasks,
      COALESCE(task_counts.urgent_tasks, 0)::int as urgent_tasks,
      COALESCE(time_this_week.hours, 0)::numeric(10,1) as hours_this_week
    FROM users u
    LEFT JOIN (
      SELECT ta.user_id,
        COUNT(*) FILTER (WHERE t.status IN ('todo', 'in_progress')) as open_tasks,
        COUNT(*) FILTER (WHERE t.status IN ('todo', 'in_progress') AND t.priority IN ('urgent', 'high')) as urgent_tasks
      FROM task_assignees ta
      JOIN tasks t ON t.id = ta.task_id
      GROUP BY ta.user_id
    ) task_counts ON task_counts.user_id = u.id
    LEFT JOIN (
      SELECT te.user_id, SUM(te.hours::numeric) as hours
      FROM time_entries te
      WHERE te.date >= date_trunc('week', CURRENT_DATE)
      GROUP BY te.user_id
    ) time_this_week ON time_this_week.user_id = u.id
    WHERE u.is_active = true
    ORDER BY COALESCE(task_counts.open_tasks, 0) DESC
  `);
  return result as unknown as {
    id: string;
    name: string;
    open_tasks: number;
    urgent_tasks: number;
    hours_this_week: string;
  }[];
}

// ── Client Health Scoring ─────────────────────────────

export async function getEngagementHealthScores() {
  const result = await db.execute(sql`
    WITH health AS (
      SELECT
        e.id,
        e.name,
        e.stage,
        c.name as company_name,
        e.stage_entered_at,
        EXTRACT(EPOCH FROM (NOW() - e.stage_entered_at)) / 86400 as days_in_stage,
        (SELECT MAX(i.created_at) FROM interactions i WHERE i.engagement_id = e.id) as last_interaction,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(
          (SELECT MAX(i.created_at) FROM interactions i WHERE i.engagement_id = e.id),
          e.created_at
        ))) / 86400 as days_since_interaction,
        (SELECT COUNT(*) FROM next_actions na
         WHERE na.engagement_id = e.id AND na.completed = false
         AND na.archived_at IS NULL AND na.due_date < CURRENT_DATE
        ) as overdue_actions
      FROM engagements e
      JOIN companies c ON e.company_id = c.id
      WHERE e.archived_at IS NULL
        AND e.stage NOT IN ('closed_won', 'closed_lost')
    )
    SELECT *,
      CASE
        WHEN overdue_actions >= 3 OR days_since_interaction > 14 THEN 'at_risk'
        WHEN overdue_actions >= 1 OR days_since_interaction > 7 THEN 'needs_attention'
        ELSE 'healthy'
      END as health
    FROM health
    ORDER BY
      CASE
        WHEN overdue_actions >= 3 OR days_since_interaction > 14 THEN 0
        WHEN overdue_actions >= 1 OR days_since_interaction > 7 THEN 1
        ELSE 2
      END,
      days_since_interaction DESC
  `);
  return result as unknown as {
    id: string;
    name: string;
    stage: string;
    company_name: string;
    days_in_stage: string;
    days_since_interaction: string;
    overdue_actions: number;
    health: "at_risk" | "needs_attention" | "healthy";
  }[];
}

// ── Profitability Queries ─────────────────────────────

export async function getProjectProfitability() {
  const result = await db.execute(sql`
    SELECT
      p.id as project_id,
      p.name as project_name,
      p.client,
      COALESCE(SUM(te.hours::numeric), 0) as total_hours,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours::numeric ELSE 0 END), 0) as billable_hours,
      COALESCE(inv_totals.revenue, 0) as revenue
    FROM projects p
    LEFT JOIN time_entries te ON te.project_id = p.id
    LEFT JOIN (
      SELECT e.id as engagement_id, p2.id as project_id, SUM(i.amount::numeric) as revenue
      FROM invoices i
      JOIN engagements e ON i.engagement_id = e.id
      JOIN projects p2 ON p2.engagement_id = e.id
      WHERE i.status = 'paid'
      GROUP BY e.id, p2.id
    ) inv_totals ON inv_totals.project_id = p.id
    GROUP BY p.id, p.name, p.client, inv_totals.revenue
    HAVING COALESCE(SUM(te.hours::numeric), 0) > 0 OR COALESCE(inv_totals.revenue, 0) > 0
    ORDER BY COALESCE(inv_totals.revenue, 0) DESC
  `);
  return result as unknown as {
    project_id: string;
    project_name: string;
    client: string | null;
    total_hours: string;
    billable_hours: string;
    revenue: string;
  }[];
}

// ── Analytics Queries ─────────────────────────────────

export async function getPipelineVelocity() {
  const result = await db.execute(sql`
    SELECT
      stage::text as stage,
      ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(exited_at, NOW()) - entered_at)) / 86400)::numeric, 1) as avg_days,
      COUNT(*)::int as transitions
    FROM stage_history
    GROUP BY stage
    ORDER BY CASE stage::text
      WHEN 'lead' THEN 1 WHEN 'contacted' THEN 2 WHEN 'discovery' THEN 3
      WHEN 'building_mvp' THEN 4 WHEN 'proposal' THEN 5 WHEN 'negotiation' THEN 6
      WHEN 'build' THEN 7 WHEN 'deliver' THEN 8 WHEN 'maintain' THEN 9
      WHEN 'closed_won' THEN 10 WHEN 'closed_lost' THEN 11
    END
  `);
  return result as unknown as { stage: string; avg_days: string; transitions: number }[];
}

export async function getWinLossRate() {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE stage = 'closed_won')::int as won,
      COUNT(*) FILTER (WHERE stage = 'closed_lost')::int as lost,
      COUNT(*) FILTER (WHERE stage IN ('closed_won', 'closed_lost'))::int as total_closed,
      COALESCE(SUM(deal_value::numeric) FILTER (WHERE stage = 'closed_won'), 0) as won_value,
      COALESCE(SUM(deal_value::numeric) FILTER (WHERE stage = 'closed_lost'), 0) as lost_value
    FROM engagements
    WHERE archived_at IS NULL
  `);
  const rows = result as unknown as { won: number; lost: number; total_closed: number; won_value: string; lost_value: string }[];
  const row = rows[0] ?? { won: 0, lost: 0, total_closed: 0, won_value: "0", lost_value: "0" };
  return {
    won: Number(row.won),
    lost: Number(row.lost),
    totalClosed: Number(row.total_closed),
    wonValue: Number(row.won_value),
    lostValue: Number(row.lost_value),
    winRate: Number(row.total_closed) > 0 ? Math.round((Number(row.won) / Number(row.total_closed)) * 100) : 0,
  };
}

export async function getNextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `STRVX-${year}-`;
  const [latest] = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(sql`${invoices.invoiceNumber} LIKE ${prefix + "%"}`)
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);

  if (!latest) return `${prefix}001`;
  const num = parseInt(latest.invoiceNumber.replace(prefix, ""), 10);
  return `${prefix}${String(num + 1).padStart(3, "0")}`;
}

// ── Follow-up Links ───────────────────────────────────

export async function getFollowUpLinksForEngagement(engagementId: string) {
  return db
    .select()
    .from(followUpLinks)
    .where(eq(followUpLinks.engagementId, engagementId))
    .orderBy(desc(followUpLinks.createdAt));
}

export async function getAllFollowUpLinks() {
  return db.select().from(followUpLinks).orderBy(desc(followUpLinks.createdAt));
}

// ── Credit Cards ─────────────────────────────────────

export async function getCreditCards() {
  return db.select().from(creditCards).orderBy(desc(creditCards.createdAt));
}

export async function getCreditCardByMercuryId(mercuryCardId: string) {
  const rows = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.mercuryCardId, mercuryCardId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCardBudgets(creditCardId: string) {
  return db
    .select()
    .from(cardBudgets)
    .where(eq(cardBudgets.creditCardId, creditCardId))
    .orderBy(cardBudgets.category);
}

export async function getAllCardBudgets() {
  return db.select().from(cardBudgets).orderBy(cardBudgets.category);
}

export async function getCardReceipts(creditCardId: string) {
  return db
    .select()
    .from(cardReceipts)
    .where(eq(cardReceipts.creditCardId, creditCardId))
    .orderBy(desc(cardReceipts.uploadedAt));
}

export async function getReceiptByTransactionId(mercuryTransactionId: string) {
  const rows = await db
    .select()
    .from(cardReceipts)
    .where(eq(cardReceipts.mercuryTransactionId, mercuryTransactionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAllCardReceipts() {
  return db.select().from(cardReceipts);
}

export async function getCardAlerts(creditCardId: string) {
  return db
    .select()
    .from(cardAlerts)
    .where(eq(cardAlerts.creditCardId, creditCardId));
}

export async function getAllCardAlerts() {
  return db.select().from(cardAlerts);
}
