"use server";

import { db } from "@/lib/db";
import {
  companies,
  contacts,
  engagements,
  interactions,
  invoices,
  nextActions,
  stageEnum,
  stageHistory,
  prospects,
  prospectTouches,
  prospectStageEnum,
  touchChannelEnum,
  users,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserByEmail, createCompany, getCompanies } from "@/lib/queries";
import { createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent, isGoogleCalendarConnected } from "@/lib/google-calendar";
import {
  createEngagementSchema,
  quickAddSchema,
  changeStageSchema,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  updateEngagementSchema,
  createContactSchema,
  updateContactSchema,
  createTaskSchema,
  updateTaskSchema,
  createInvoiceSchema,
  invoiceDraftSchema,
  createExpenseSchema,
  updateExpenseSchema,
  createGoalSchema,
  updateGoalSchema,
  createMarketingPostSchema,
  updateMarketingPostSchema,
  createProjectSchema,
  updateProjectSchema,
  createDocumentSchema,
  updateDocumentSchema,
  createProspectSchema,
  updateProspectSchema,
  logTouchSchema,
  changeProspectStageSchema,
  searchQuerySchema,
  uuidSchema,
} from "@/lib/validations";

async function getCurrentUser() {
  // Try real Supabase Auth first
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user?.email) {
      const dbUser = await getUserByEmail(user.email);
      if (dbUser) {
        // Sync auth_id on first authenticated login (enables per-user RLS later).
        // Uses AND auth_id IS NULL to prevent concurrent requests from overwriting.
        if (!dbUser.authId && user.id) {
          try {
            await db
              .update(users)
              .set({ authId: user.id })
              .where(and(eq(users.id, dbUser.id), isNull(users.authId)));
          } catch (e) {
            console.error("[auth_id sync] Failed to link Supabase Auth uid:", e);
          }
        }
        return dbUser;
      }
    }
  } catch {
    // Auth service unavailable
  }

  // In production, require real auth — no fallback
  if (process.env.NODE_ENV === "production") {
    throw new Error("Unauthorized");
  }

  // Dev fallback: use strvx account with a warning
  console.warn("[DEV] Auth not configured — using dev fallback user (strvxteam@strvx.com)");
  const dbUser = await getUserByEmail("strvxteam@strvx.com");
  if (!dbUser) throw new Error("No users in database. Run seed first.");
  return dbUser;
}

// ── Create Engagement ──────────────────────────────────

export async function createEngagement(formData: FormData) {
  const user = await getCurrentUser();
  const parsed = createEngagementSchema.safeParse({
    companyName: formData.get("companyName"),
    engagementName: formData.get("engagementName"),
    contactName: formData.get("contactName") ?? undefined,
    contactEmail: formData.get("contactEmail") ?? undefined,
    contactPhone: formData.get("contactPhone") ?? undefined,
    dealValue: formData.get("dealValue") ?? undefined,
    stage: formData.get("stage") ?? undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { companyName, engagementName, contactName, contactEmail, contactPhone, dealValue, stage: rawStage } = parsed.data;
  const stage = rawStage || "discovery";

  // Wrap in transaction — prevents orphaned companies/contacts on partial failure
  const engagement = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({ name: companyName })
      .returning();

    let contact = null;
    if (contactName) {
      [contact] = await tx
        .insert(contacts)
        .values({
          name: contactName,
          email: contactEmail,
          phone: contactPhone || null,
          companyId: company.id,
        })
        .returning();
    }

    const [eng] = await tx
      .insert(engagements)
      .values({
        companyId: company.id,
        primaryContactId: contact?.id,
        name: engagementName,
        stage: stage as (typeof stageEnum.enumValues)[number],
        dealValue: dealValue || null,
      })
      .returning();

    await tx.insert(stageHistory).values({
      engagementId: eng.id,
      stage: eng.stage,
    });

    await tx.insert(interactions).values({
      engagementId: eng.id,
      authorId: user.id,
      type: "note",
      content: `Created engagement "${engagementName}" for ${companyName}`,
    });

    return eng;
  });

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/contacts");
  revalidatePath("/clients");

  return engagement;
}

// ── Quick Add ──────────────────────────────────────────

export async function quickAdd(formData: FormData) {
  const user = await getCurrentUser();
  const parsed = quickAddSchema.safeParse({
    content: formData.get("content"),
    engagementId: formData.get("engagementId"),
    dueDate: formData.get("dueDate") || undefined,
    scheduledAt: formData.get("scheduledAt") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const content = parsed.data.content.trim();
  const engagementId = parsed.data.engagementId;

  // Parse type prefix
  let type: "note" | "meeting" | "action" = "note";
  let cleanContent = content;
  const dueDateStr = formData.get("dueDate") as string | null;
  const scheduledAtStr = formData.get("scheduledAt") as string | null;

  if (content.startsWith("/meeting ")) {
    type = "meeting";
    cleanContent = content.slice(9);
  } else if (content.startsWith("/action ")) {
    type = "action";
    cleanContent = content.slice(8);
  } else if (content.startsWith("/note ")) {
    type = "note";
    cleanContent = content.slice(6);
  }

  if (!cleanContent.trim()) {
    throw new Error("Content cannot be empty");
  }

  if (cleanContent.length > 10000) {
    throw new Error("Content must be 10,000 characters or less");
  }

  if (type === "action") {
    // Write to BOTH tables in a transaction
    await db.transaction(async (tx) => {
      const [interaction] = await tx
        .insert(interactions)
        .values({
          engagementId,
          authorId: user.id,
          type: "action",
          content: cleanContent,
          scheduledAt: scheduledAtStr ? new Date(scheduledAtStr) : null,
        })
        .returning();

      await tx.insert(nextActions).values({
        engagementId,
        ownerId: user.id,
        description: cleanContent,
        dueDate: dueDateStr || null,
        sourceInteractionId: interaction.id,
      });
    });
  } else {
    await db.insert(interactions).values({
      engagementId,
      authorId: user.id,
      type,
      content: cleanContent,
      scheduledAt: scheduledAtStr ? new Date(scheduledAtStr) : null,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath(`/clients/${engagementId}`);
  revalidatePath("/pipeline");
  revalidatePath("/clients");

  return { success: true };
}

// ── Change Stage ───────────────────────────────────────

export async function changeStage(
  engagementId: string,
  newStage: (typeof stageEnum.enumValues)[number]
) {
  const parsedId = uuidSchema.safeParse(engagementId);
  if (!parsedId.success) throw new Error("Invalid engagement ID");
  const parsedStage = changeStageSchema.safeParse({ engagementId, newStage });
  if (!parsedStage.success) {
    throw new Error(parsedStage.error.issues.map((i) => i.message).join(", "));
  }
  const user = await getCurrentUser();

  const [engagement] = await db
    .select({ stage: engagements.stage })
    .from(engagements)
    .where(eq(engagements.id, engagementId));

  if (!engagement) throw new Error("Engagement not found");
  if (engagement.stage === newStage) return;

  const oldStage = engagement.stage;

  await db.transaction(async (tx) => {
    // Update engagement stage
    await tx
      .update(engagements)
      .set({ stage: newStage, stageEnteredAt: new Date() })
      .where(eq(engagements.id, engagementId));

    // Close previous stage history entry
    await tx
      .update(stageHistory)
      .set({ exitedAt: new Date() })
      .where(
        and(
          eq(stageHistory.engagementId, engagementId),
          eq(stageHistory.stage, oldStage),
          isNull(stageHistory.exitedAt)
        )
      );

    // Create new stage history entry
    await tx.insert(stageHistory).values({
      engagementId,
      stage: newStage,
    });

    // Log stage change interaction
    await tx.insert(interactions).values({
      engagementId,
      authorId: user.id,
      type: "stage_change",
      content: `Stage changed: ${oldStage} → ${newStage}`,
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${engagementId}`);
}

// ── Toggle Action Complete ─────────────────────────────

export async function toggleAction(actionId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(actionId);
  if (!parsed.success) throw new Error("Invalid action ID");

  const [action] = await db
    .select({ completed: nextActions.completed })
    .from(nextActions)
    .where(eq(nextActions.id, actionId));

  if (!action) throw new Error("Action not found");

  await db
    .update(nextActions)
    .set({
      completed: !action.completed,
      completedAt: action.completed ? null : new Date(),
    })
    .where(eq(nextActions.id, actionId));

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/clients");
}

// ── Update Engagement Details ──────────────────────────

export async function updateEngagement(
  engagementId: string,
  data: {
    name?: string;
    dealValue?: string | null;
    probability?: string | null;
    expectedCloseDate?: string | null;
    maintenanceOptedIn?: boolean;
    maintenanceMonthlyFee?: string | null;
    maintenanceNextCheckin?: string | null;
    tags?: string[];
  }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(engagementId);
  if (!parsedId.success) throw new Error("Invalid engagement ID");
  const parsed = updateEngagementSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  await db
    .update(engagements)
    .set({
      name: data.name ?? undefined,
      dealValue: data.dealValue ?? undefined,
      probability: data.probability ?? undefined,
      expectedCloseDate: data.expectedCloseDate ?? undefined,
      maintenanceOptedIn: data.maintenanceOptedIn ?? undefined,
      maintenanceMonthlyFee: data.maintenanceMonthlyFee ?? undefined,
      maintenanceNextCheckin: data.maintenanceNextCheckin ?? undefined,
      tags: data.tags ?? undefined,
    })
    .where(eq(engagements.id, engagementId));

  revalidatePath(`/clients/${engagementId}`);
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/clients");
}

// ── Create Contact ─────────────────────────────────────

export async function createContact(formData: FormData) {
  await getCurrentUser();
  const parsed = createContactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    role: formData.get("role") ?? undefined,
    companyId: formData.get("companyId"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { name, email, phone, role, companyId } = parsed.data;

  const [contact] = await db
    .insert(contacts)
    .values({ name, email: email || undefined, phone, role, companyId })
    .returning();

  revalidatePath("/contacts");
  return contact;
}

// ── Update Contact ────────────────────────────────────

export async function updateContact(
  contactId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    linkedinUrl?: string;
  }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(contactId);
  if (!parsedId.success) throw new Error("Invalid contact ID");
  const parsed = updateContactSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const setData: Record<string, string | null | undefined> = {};
  if (parsed.data.name !== undefined) setData.name = parsed.data.name;
  if (parsed.data.email !== undefined) setData.email = parsed.data.email || null;
  if (parsed.data.phone !== undefined) setData.phone = parsed.data.phone || null;
  if (parsed.data.role !== undefined) setData.role = parsed.data.role || null;
  if (parsed.data.linkedinUrl !== undefined) setData.linkedinUrl = parsed.data.linkedinUrl || null;

  if (Object.keys(setData).length > 0) {
    await db
      .update(contacts)
      .set(setData)
      .where(eq(contacts.id, contactId));
  }

  revalidatePath("/contacts");
  revalidatePath("/clients");
}

// ── Archive Engagement ─────────────────────────────────

export async function archiveEngagement(engagementId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(engagementId);
  if (!parsed.success) throw new Error("Invalid engagement ID");

  await db
    .update(engagements)
    .set({ archivedAt: new Date() })
    .where(eq(engagements.id, engagementId));

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/clients");
}

// ── Delete Engagement ──────────────────────────────────

export async function deleteEngagement(engagementId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(engagementId);
  if (!parsed.success) throw new Error("Invalid engagement ID");

  // Fetch engagement to know company/contact for orphan cleanup
  const [eng] = await db
    .select({ companyId: engagements.companyId, primaryContactId: engagements.primaryContactId })
    .from(engagements)
    .where(eq(engagements.id, parsed.data));

  if (!eng) throw new Error("Engagement not found");

  // Delete engagement — cascades to stage_history, interactions, next_actions
  await db.delete(engagements).where(eq(engagements.id, parsed.data));

  // Clean up orphaned contact (no other engagements reference it)
  if (eng.primaryContactId) {
    const [otherEng] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(eq(engagements.primaryContactId, eng.primaryContactId))
      .limit(1);
    if (!otherEng) {
      await db.delete(contacts).where(eq(contacts.id, eng.primaryContactId));
    }
  }

  // Clean up orphaned company (no other engagements or contacts reference it)
  const [otherCompanyEng] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(eq(engagements.companyId, eng.companyId))
    .limit(1);
  const [otherCompanyContact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.companyId, eng.companyId))
    .limit(1);
  if (!otherCompanyEng && !otherCompanyContact) {
    await db.delete(companies).where(eq(companies.id, eng.companyId));
  }

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/clients");
}

// ── Search ────────────────────────────────────────────────

export async function searchAll(query: string) {
  await getCurrentUser();
  const parsed = searchQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { searchEngagements } = await import("@/lib/queries");
  return searchEngagements(parsed.data);
}

export async function getRecentEngagementsAction() {
  await getCurrentUser();
  const { getPipelineEngagements } = await import("@/lib/queries");
  const all = await getPipelineEngagements();
  return all
    .filter((e) => e.stage !== "closed_won" && e.stage !== "closed_lost")
    .slice(0, 5);
}

// ── Calendar Events ───────────────────────────────────

export async function createCalendarEventAction(data: {
  title: string;
  type: string;
  date: string;
  startHour: number;
  durationHours: number;
  client?: string | null;
  zoomLink?: string | null;
}) {
  const parsed = createCalendarEventSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const user = await getCurrentUser();
  const { createCalendarEvent } = await import("@/lib/queries");
  const event = await createCalendarEvent({
    ...parsed.data,
    client: parsed.data.client || null,
    zoomLink: parsed.data.zoomLink || null,
    createdBy: user.id,
  });

  // After creating the DB event, also push to Google Calendar if connected
  try {
    const isConnected = await isGoogleCalendarConnected(user.id);
    if (isConnected) {
      const startDate = new Date(`${parsed.data.date}T${String(Math.floor(parsed.data.startHour)).padStart(2, '0')}:${String(Math.round((parsed.data.startHour % 1) * 60)).padStart(2, '0')}:00`);
      const endDate = new Date(startDate.getTime() + parsed.data.durationHours * 60 * 60 * 1000);
      await createGoogleCalendarEvent(user.id, {
        title: parsed.data.title,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      });
    }
  } catch (e) {
    console.error("[Google Calendar] Failed to sync event:", e);
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return event;
}

export async function updateCalendarEventAction(
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
  const parsedId = uuidSchema.safeParse(eventId);
  if (!parsedId.success) throw new Error("Invalid event ID");
  const parsed = updateCalendarEventSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  await getCurrentUser();
  const { updateCalendarEvent } = await import("@/lib/queries");
  const updated = await updateCalendarEvent(parsedId.data, parsed.data);

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return updated;
}

export async function deleteCalendarEventAction(eventId: string) {
  const parsed = uuidSchema.safeParse(eventId);
  if (!parsed.success) throw new Error("Invalid event ID");

  await getCurrentUser();
  const { deleteCalendarEvent } = await import("@/lib/queries");
  await deleteCalendarEvent(parsed.data);

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function deleteGoogleCalendarEventAction(gcalEventId: string) {
  const googleEventId = gcalEventId.replace(/^gcal-/, "");
  if (!googleEventId) throw new Error("Invalid Google Calendar event ID");

  const user = await getCurrentUser();
  await deleteGoogleCalendarEvent(user.id, googleEventId);

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function updateGoogleCalendarEventAction(
  gcalEventId: string,
  data: {
    title?: string;
    date?: string;
    startHour?: number;
    durationHours?: number;
    client?: string | null;
    zoomLink?: string | null;
  }
) {
  const googleEventId = gcalEventId.replace(/^gcal-/, "");
  if (!googleEventId) throw new Error("Invalid Google Calendar event ID");

  const user = await getCurrentUser();

  const updateData: Parameters<typeof updateGoogleCalendarEvent>[2] = {};
  if (data.title !== undefined) updateData.title = data.title;

  if (data.date && data.startHour !== undefined && data.durationHours !== undefined) {
    const startH = Math.floor(data.startHour);
    const startM = Math.round((data.startHour - startH) * 60);
    const endHourRaw = data.startHour + data.durationHours;
    const endH = Math.floor(endHourRaw);
    const endM = Math.round((endHourRaw - endH) * 60);

    updateData.startTime = `${data.date}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00`;
    updateData.endTime = `${data.date}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
  }

  await updateGoogleCalendarEvent(user.id, googleEventId, updateData);

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

// ── Tasks ─────────────────────────────────────────────

export async function createTask(data: {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeIds?: string[];
  engagementId?: string;
  projectId?: string;
  dueDate?: string;
}) {
  await getCurrentUser();
  const parsed = createTaskSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { tasks, taskAssignees } = await import("@/lib/db/schema");
  const [task] = await db
    .insert(tasks)
    .values({
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status || "todo",
      priority: parsed.data.priority || "normal",
      engagementId: parsed.data.engagementId || null,
      projectId: parsed.data.projectId || null,
      dueDate: parsed.data.dueDate || null,
    })
    .returning();

  if (parsed.data.assigneeIds && parsed.data.assigneeIds.length > 0) {
    await db.insert(taskAssignees).values(
      parsed.data.assigneeIds.map((userId) => ({
        taskId: task.id,
        userId,
      }))
    );
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return task;
}

export async function updateTask(taskId: string, data: {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeIds?: string[];
  projectId?: string | null;
  engagementId?: string | null;
  dueDate?: string;
}) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(taskId);
  if (!parsedId.success) throw new Error("Invalid task ID");
  const parsed = updateTaskSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { tasks, taskAssignees } = await import("@/lib/db/schema");

  // Update assignees if provided
  if (parsed.data.assigneeIds) {
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, parsedId.data));
    if (parsed.data.assigneeIds.length > 0) {
      await db.insert(taskAssignees).values(
        parsed.data.assigneeIds.map((userId) => ({
          taskId: parsedId.data,
          userId,
        }))
      );
    }
  }

  // Build task field updates (exclude assigneeIds)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { assigneeIds: _, ...taskFields } = parsed.data;
  const setData: Record<string, unknown> = {};
  if (taskFields.title !== undefined) setData.title = taskFields.title;
  if (taskFields.description !== undefined) setData.description = taskFields.description;
  if (taskFields.status !== undefined) setData.status = taskFields.status;
  if (taskFields.priority !== undefined) setData.priority = taskFields.priority;
  if (taskFields.projectId !== undefined) setData.projectId = taskFields.projectId;
  if (taskFields.engagementId !== undefined) setData.engagementId = taskFields.engagementId;
  if (taskFields.dueDate !== undefined) setData.dueDate = taskFields.dueDate;
  if (taskFields.status === "done") setData.completedAt = new Date();
  else if (taskFields.status) setData.completedAt = null;

  if (Object.keys(setData).length > 0) {
    await db.update(tasks).set(setData).where(eq(tasks.id, parsedId.data));
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteTask(taskId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) throw new Error("Invalid task ID");

  const { tasks } = await import("@/lib/db/schema");
  await db.delete(tasks).where(eq(tasks.id, parsed.data));
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

// ── Invoices ──────────────────────────────────────────

export async function createInvoice(data: {
  invoiceNumber: string;
  clientName: string;
  amount: number;
  taxRate?: number;
  status?: string;
  issuedDate?: string;
  dueDate?: string;
  lineItems?: unknown;
  notes?: string;
  engagementId?: string;
}) {
  await getCurrentUser();
  const parsed = createInvoiceSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { invoices } = await import("@/lib/db/schema");
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: parsed.data.invoiceNumber,
      clientName: parsed.data.clientName,
      amount: String(parsed.data.amount),
      taxRate: parsed.data.taxRate != null ? String(parsed.data.taxRate) : "0",
      status: parsed.data.status || "draft",
      issuedDate: parsed.data.issuedDate || null,
      dueDate: parsed.data.dueDate || null,
      lineItems: parsed.data.lineItems || null,
      notes: parsed.data.notes || null,
      engagementId: parsed.data.engagementId || null,
    })
    .returning();
  revalidatePath("/invoices");
  revalidatePath("/finances");
  return invoice;
}

// ── Expenses ──────────────────────────────────────────

export async function createExpense(data: {
  description: string;
  amount: number;
  category: string;
  date: string;
  recurring?: boolean;
  vendor?: string;
  notes?: string;
}) {
  await getCurrentUser();
  const parsed = createExpenseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { expenses } = await import("@/lib/db/schema");
  const [expense] = await db
    .insert(expenses)
    .values({
      description: parsed.data.description,
      amount: String(parsed.data.amount),
      category: parsed.data.category,
      date: parsed.data.date,
      recurring: parsed.data.recurring ?? false,
      vendor: parsed.data.vendor || null,
      notes: parsed.data.notes || null,
    })
    .returning();
  revalidatePath("/expenses");
  revalidatePath("/finances");
  return expense;
}

export async function updateExpense(
  expenseId: string,
  data: {
    description?: string;
    amount?: number;
    category?: string;
    date?: string;
    recurring?: boolean;
    vendor?: string;
    notes?: string;
  }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(expenseId);
  if (!parsedId.success) throw new Error("Invalid expense ID");
  const parsed = updateExpenseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { expenses } = await import("@/lib/db/schema");

  const setData: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) setData.description = parsed.data.description;
  if (parsed.data.amount !== undefined) setData.amount = String(parsed.data.amount);
  if (parsed.data.category !== undefined) setData.category = parsed.data.category;
  if (parsed.data.date !== undefined) setData.date = parsed.data.date;
  if (parsed.data.recurring !== undefined) setData.recurring = parsed.data.recurring;
  if (parsed.data.vendor !== undefined) setData.vendor = parsed.data.vendor;
  if (parsed.data.notes !== undefined) setData.notes = parsed.data.notes;

  if (Object.keys(setData).length === 0) return;

  const [updated] = await db
    .update(expenses)
    .set(setData)
    .where(eq(expenses.id, parsedId.data))
    .returning();

  revalidatePath("/expenses");
  revalidatePath("/finances");
  return updated;
}

export async function deleteExpense(expenseId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(expenseId);
  if (!parsed.success) throw new Error("Invalid expense ID");

  const { expenses } = await import("@/lib/db/schema");
  await db.delete(expenses).where(eq(expenses.id, parsed.data));
  revalidatePath("/expenses");
  revalidatePath("/finances");
}

// ── Goals ─────────────────────────────────────────────

export async function createGoal(data: {
  name: string;
  description?: string;
  targetValue: number;
  unit?: string;
  deadline?: string;
}) {
  await getCurrentUser();
  const parsed = createGoalSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { goals } = await import("@/lib/db/schema");
  const [goal] = await db
    .insert(goals)
    .values({
      name: parsed.data.name,
      description: parsed.data.description || null,
      targetValue: String(parsed.data.targetValue),
      unit: parsed.data.unit || "usd",
      deadline: parsed.data.deadline || null,
    })
    .returning();
  revalidatePath("/goals");
  return goal;
}

export async function updateGoal(goalId: string, data: {
  currentValue?: number;
  achieved?: boolean;
}) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(goalId);
  if (!parsedId.success) throw new Error("Invalid goal ID");
  const parsed = updateGoalSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { goals } = await import("@/lib/db/schema");
  await db
    .update(goals)
    .set({
      currentValue: parsed.data.currentValue != null ? String(parsed.data.currentValue) : undefined,
      achieved: parsed.data.achieved ?? undefined,
    })
    .where(eq(goals.id, parsedId.data));
  revalidatePath("/goals");
}

// ── Marketing Posts ───────────────────────────────────

export async function createMarketingPost(data: {
  title: string;
  content?: string;
  platform: string;
  status: string;
  scheduledAt?: string;
}) {
  const parsed = createMarketingPostSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const user = await getCurrentUser();
  const { marketingPosts } = await import("@/lib/db/schema");
  const [post] = await db
    .insert(marketingPosts)
    .values({
      title: parsed.data.title,
      content: parsed.data.content || null,
      platform: parsed.data.platform,
      status: parsed.data.status,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      authorId: user.id,
    })
    .returning();
  revalidatePath("/marketing");
  return post;
}

export async function updateMarketingPost(
  postId: string,
  data: {
    title?: string;
    content?: string;
    platform?: string;
    status?: string;
    scheduledAt?: string;
  }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(postId);
  if (!parsedId.success) throw new Error("Invalid post ID");
  const parsed = updateMarketingPostSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { marketingPosts } = await import("@/lib/db/schema");
  await db
    .update(marketingPosts)
    .set({
      title: parsed.data.title ?? undefined,
      content: parsed.data.content ?? undefined,
      platform: parsed.data.platform ?? undefined,
      status: parsed.data.status ?? undefined,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
    })
    .where(eq(marketingPosts.id, parsedId.data));
  revalidatePath("/marketing");
}

export async function deleteMarketingPost(postId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) throw new Error("Invalid post ID");

  const { marketingPosts } = await import("@/lib/db/schema");
  await db.delete(marketingPosts).where(eq(marketingPosts.id, parsed.data));
  revalidatePath("/marketing");
}

// ── Projects ─────────────────────────────────────────

export async function createProject(data: {
  name: string;
  description?: string;
  status?: string;
  client?: string;
  engagementId?: string;
  startDate?: string;
  endDate?: string;
  team?: string[];
}) {
  await getCurrentUser();
  const parsed = createProjectSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { projects } = await import("@/lib/db/schema");
  const [project] = await db
    .insert(projects)
    .values({
      name: parsed.data.name,
      description: parsed.data.description || null,
      status: parsed.data.status || "scoping",
      client: parsed.data.client || null,
      engagementId: parsed.data.engagementId || null,
      startDate: parsed.data.startDate || null,
      endDate: parsed.data.endDate || null,
      team: parsed.data.team || null,
    })
    .returning();
  revalidatePath("/projects");
  return project;
}

export async function updateProject(
  projectId: string,
  data: {
    name?: string;
    description?: string;
    status?: string;
    client?: string;
    startDate?: string;
    endDate?: string | null;
    team?: string[];
  }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(projectId);
  if (!parsedId.success) throw new Error("Invalid project ID");
  const parsed = updateProjectSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { projects } = await import("@/lib/db/schema");
  await db
    .update(projects)
    .set({
      name: parsed.data.name ?? undefined,
      description: parsed.data.description ?? undefined,
      status: parsed.data.status ?? undefined,
      client: parsed.data.client ?? undefined,
      startDate: parsed.data.startDate ?? undefined,
      endDate: parsed.data.endDate !== undefined ? parsed.data.endDate : undefined,
      team: parsed.data.team ?? undefined,
    })
    .where(eq(projects.id, parsedId.data));
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProject(projectId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(projectId);
  if (!parsed.success) throw new Error("Invalid project ID");

  const { projects } = await import("@/lib/db/schema");
  await db.delete(projects).where(eq(projects.id, parsed.data));
  revalidatePath("/projects");
}

// ── Documents ─────────────────────────────────────────

export async function createDocument(data: {
  title: string;
  content?: Record<string, unknown>;
  contentText?: string;
}) {
  const parsed = createDocumentSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const user = await getCurrentUser();
  const { documents } = await import("@/lib/db/schema");
  const [doc] = await db
    .insert(documents)
    .values({
      title: parsed.data.title,
      content: parsed.data.content || { type: "doc", content: [{ type: "paragraph" }] },
      contentText: parsed.data.contentText || "",
      authorId: user.id,
    })
    .returning();
  revalidatePath("/docs");
  return doc;
}

export async function updateDocument(docId: string, data: {
  title?: string;
  content?: Record<string, unknown>;
  contentText?: string;
}) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(docId);
  if (!parsedId.success) throw new Error("Invalid document ID");
  const parsed = updateDocumentSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { documents } = await import("@/lib/db/schema");
  await db
    .update(documents)
    .set({
      title: parsed.data.title ?? undefined,
      content: parsed.data.content ?? undefined,
      contentText: parsed.data.contentText ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, parsedId.data));
  revalidatePath("/docs");
}

export async function deleteDocument(docId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(docId);
  if (!parsed.success) throw new Error("Invalid document ID");

  const { documents } = await import("@/lib/db/schema");
  await db.delete(documents).where(eq(documents.id, parsed.data));
  revalidatePath("/docs");
}

// ── Prospect Actions ─────────────────────────────────

export async function createProspect(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  companyName: string;
  title?: string;
  industrySlug?: string;
  stage?: (typeof prospectStageEnum.enumValues)[number];
  linkedinUrl?: string;
  source?: string;
  apolloContactId?: string;
}) {
  await getCurrentUser();
  const parsed = createProspectSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const [prospect] = await db
    .insert(prospects)
    .values({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      companyName: parsed.data.companyName,
      title: parsed.data.title || null,
      industrySlug: parsed.data.industrySlug || null,
      stage: parsed.data.stage || "cold",
      linkedinUrl: parsed.data.linkedinUrl || null,
      source: data.source || "manual",
      apolloContactId: data.apolloContactId || null,
    })
    .returning();
  revalidatePath("/outreach");
  return prospect;
}

export async function updateProspect(
  prospectId: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    title?: string;
    industrySlug?: string;
    stage?: (typeof prospectStageEnum.enumValues)[number];
    linkedinUrl?: string;
    notes?: string;
  }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(prospectId);
  if (!parsedId.success) throw new Error("Invalid prospect ID");
  const parsed = updateProspectSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const [updated] = await db
    .update(prospects)
    .set({
      firstName: data.firstName ?? undefined,
      lastName: data.lastName ?? undefined,
      email: data.email !== undefined ? data.email || null : undefined,
      phone: data.phone !== undefined ? data.phone || null : undefined,
      companyName: data.companyName ?? undefined,
      title: data.title !== undefined ? data.title || null : undefined,
      industrySlug: data.industrySlug ?? undefined,
      stage: data.stage ?? undefined,
      linkedinUrl: data.linkedinUrl !== undefined ? data.linkedinUrl || null : undefined,
      notes: data.notes !== undefined ? data.notes || null : undefined,
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, prospectId))
    .returning();
  revalidatePath("/outreach");
  return updated;
}

export async function deleteProspect(prospectId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(prospectId);
  if (!parsed.success) throw new Error("Invalid prospect ID");

  await db
    .update(prospects)
    .set({ archivedAt: new Date() })
    .where(eq(prospects.id, parsed.data));
  revalidatePath("/outreach");
}

export async function logTouch(data: {
  prospectId: string;
  channel: (typeof touchChannelEnum.enumValues)[number];
  subject?: string;
  content?: string;
  direction?: string;
}) {
  await getCurrentUser();
  const parsed = logTouchSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const [touch] = await db
    .insert(prospectTouches)
    .values({
      prospectId: parsed.data.prospectId,
      channel: parsed.data.channel,
      subject: parsed.data.subject || null,
      content: parsed.data.content || null,
      direction: parsed.data.direction || "outbound",
    })
    .returning();

  // Update the prospect's updatedAt timestamp
  await db
    .update(prospects)
    .set({ updatedAt: new Date() })
    .where(eq(prospects.id, parsed.data.prospectId));

  revalidatePath("/outreach");
  return touch;
}

export async function convertProspect(prospectId: string) {
  const parsed = uuidSchema.safeParse(prospectId);
  if (!parsed.success) throw new Error("Invalid prospect ID");

  const user = await getCurrentUser();

  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId));

  if (!prospect) throw new Error("Prospect not found");

  await db.transaction(async (tx) => {
    // Mark prospect as converted
    await tx
      .update(prospects)
      .set({
        stage: "converted",
        convertedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, prospectId));

    // Create company
    const [company] = await tx
      .insert(companies)
      .values({
        name: prospect.companyName,
        industry: prospect.industrySlug,
      })
      .returning();

    // Create contact
    const [contact] = await tx
      .insert(contacts)
      .values({
        name: `${prospect.firstName} ${prospect.lastName}`,
        email: prospect.email,
        phone: prospect.phone,
        role: prospect.title,
        linkedinUrl: prospect.linkedinUrl,
        companyId: company.id,
      })
      .returning();

    // Create engagement
    const [engagement] = await tx
      .insert(engagements)
      .values({
        companyId: company.id,
        primaryContactId: contact.id,
        name: `${prospect.companyName} Engagement`,
        stage: "lead",
      })
      .returning();

    // Link prospect to company and contact
    await tx
      .update(prospects)
      .set({
        companyId: company.id,
        contactId: contact.id,
      })
      .where(eq(prospects.id, prospectId));

    // Log initial interaction
    await tx.insert(interactions).values({
      engagementId: engagement.id,
      authorId: user.id,
      type: "note",
      content: `Converted from outreach prospect: ${prospect.firstName} ${prospect.lastName}`,
    });
  });

  revalidatePath("/outreach");
  revalidatePath("/pipeline");
  revalidatePath("/clients");
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
}

export async function changeProspectStage(
  prospectId: string,
  newStage: (typeof prospectStageEnum.enumValues)[number]
) {
  await getCurrentUser();
  const parsed = changeProspectStageSchema.safeParse({ prospectId, newStage });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  await db
    .update(prospects)
    .set({
      stage: newStage,
      updatedAt: new Date(),
      ...(newStage === "converted" ? { convertedAt: new Date() } : {}),
    })
    .where(eq(prospects.id, prospectId));
  revalidatePath("/outreach");
}

export async function fetchProspectTouches(prospectId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(prospectId);
  if (!parsed.success) throw new Error("Invalid prospect ID");

  const { getProspectTouches } = await import("@/lib/queries");
  return getProspectTouches(parsed.data);
}

// ── Company Actions ──────────────────────────────────

export async function getCompaniesAction() {
  return getCompanies();
}

export async function createCompanyAction(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Company name is required");
  const company = await createCompany(trimmed);
  return company;
}

export async function updateCompanyName(companyId: string, name: string) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(companyId);
  if (!parsedId.success) throw new Error("Invalid company ID");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Company name is required");

  await db
    .update(companies)
    .set({ name: trimmed })
    .where(eq(companies.id, companyId));

  revalidatePath("/clients");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
}

export async function updateCompany(
  companyId: string,
  data: { name?: string; industry?: string | null }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(companyId);
  if (!parsedId.success) throw new Error("Invalid company ID");

  const setData: Record<string, string | null | undefined> = {};
  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error("Company name is required");
    setData.name = trimmed;
  }
  if (data.industry !== undefined) {
    setData.industry = data.industry?.trim() || null;
  }

  if (Object.keys(setData).length > 0) {
    await db
      .update(companies)
      .set(setData)
      .where(eq(companies.id, companyId));
  }

  revalidatePath("/clients");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
}

// ── Project Timeline ──────────────────────────────────

export async function addProjectTimelineEntry(
  projectId: string,
  content: string,
) {
  const parsedId = uuidSchema.safeParse(projectId);
  if (!parsedId.success) throw new Error("Invalid project ID");

  const trimmed = content.trim();
  if (!trimmed) throw new Error("Content is required");
  if (trimmed.length > 10000)
    throw new Error("Content must be 10,000 characters or less");

  const user = await getCurrentUser();

  const { projects } = await import("@/lib/db/schema");

  // Look up the project to find its engagement
  const [project] = await db
    .select({
      engagementId: projects.engagementId,
      client: projects.client,
    })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) throw new Error("Project not found");

  let engagementId = project.engagementId;

  // If no direct engagement link, fall back to matching by client name
  if (!engagementId && project.client) {
    const [match] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .innerJoin(companies, eq(engagements.companyId, companies.id))
      .where(eq(companies.name, project.client))
      .limit(1);

    if (match) {
      engagementId = match.id;
    }
  }

  if (!engagementId) {
    throw new Error(
      "No engagement found for this project. Link the project to a client first.",
    );
  }

  const [created] = await db
    .insert(interactions)
    .values({
      engagementId,
      authorId: user.id,
      type: "note",
      content: trimmed,
    })
    .returning({ id: interactions.id, createdAt: interactions.createdAt });

  revalidatePath(`/projects/${projectId}`);

  return {
    id: created.id,
    createdAt: created.createdAt
      ? created.createdAt.toISOString()
      : new Date().toISOString(),
    authorName: user.name,
  };
}

// ── Invoice Builder Actions ──────────────────────────

export async function saveInvoiceDraft(data: {
  invoiceNumber: string;
  clientCompanyId: string;
  clientEmail: string;
  issuedDate: string;
  dueDate: string;
  notes?: string;
  engagementId?: string;
  lineItems: { description: string; quantity: number; rate: number }[];
}) {
  await getCurrentUser();
  const parsed = invoiceDraftSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, parsed.data.clientCompanyId));

  if (!company) throw new Error("Company not found");

  const lineItems = parsed.data.lineItems.map((li, i) => ({
    id: `li-${i}`,
    description: li.description,
    quantity: li.quantity,
    rate: li.rate,
    amount: li.quantity * li.rate,
  }));

  const amount = lineItems.reduce((sum, li) => sum + li.amount, 0);

  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: data.invoiceNumber,
      clientName: company.name,
      clientEmail: parsed.data.clientEmail,
      amount: String(amount),
      taxRate: "0",
      status: "draft",
      issuedDate: parsed.data.issuedDate,
      dueDate: parsed.data.dueDate,
      lineItems,
      notes: parsed.data.notes || null,
      engagementId: parsed.data.engagementId || null,
    })
    .returning();

  revalidatePath("/invoices");
  return invoice;
}

export async function sendInvoiceAction(invoiceId: string) {
  await getCurrentUser();

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be sent");
  if (!invoice.clientEmail) throw new Error("Client email is required");

  const { getOrCreateStripeCustomer, createAndSendStripeInvoice } = await import("@/lib/stripe");

  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.name, invoice.clientName));

  if (!company) throw new Error("Company not found");

  const stripeCustomerId = await getOrCreateStripeCustomer(
    company.id,
    invoice.clientName,
    invoice.clientEmail
  );

  const items = Array.isArray(invoice.lineItems)
    ? (invoice.lineItems as { description: string; quantity: number; rate: number }[])
    : [];

  const { stripeInvoiceId, paymentUrl } = await createAndSendStripeInvoice({
    stripeCustomerId,
    lineItems: items,
    dueDate: invoice.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    notes: invoice.notes || undefined,
    invoiceNumber: invoice.invoiceNumber,
  });

  await db
    .update(invoices)
    .set({
      status: "sent",
      stripeInvoiceId,
      stripePaymentUrl: paymentUrl,
    })
    .where(eq(invoices.id, invoiceId));

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/finances");
}

export async function voidInvoiceAction(invoiceId: string) {
  await getCurrentUser();

  const [invoice] = await db
    .select({ stripeInvoiceId: invoices.stripeInvoiceId, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid") throw new Error("Cannot void a paid invoice");

  if (invoice.stripeInvoiceId) {
    const { voidStripeInvoice } = await import("@/lib/stripe");
    await voidStripeInvoice(invoice.stripeInvoiceId);
  }

  await db
    .update(invoices)
    .set({ status: "cancelled" })
    .where(eq(invoices.id, invoiceId));

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/finances");
}

export async function markInvoicePaidAction(invoiceId: string) {
  await getCurrentUser();

  await db
    .update(invoices)
    .set({
      status: "paid",
      paidDate: new Date().toISOString().split("T")[0],
    })
    .where(eq(invoices.id, invoiceId));

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/finances");
}

// ── User Status ──────────────────────────────────────────

export async function toggleUserStatus(userId: string) {
  const [user] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) throw new Error("User not found");

  const newStatus = user.status === "available" ? "busy" : "available";
  await db
    .update(users)
    .set({ status: newStatus })
    .where(eq(users.id, userId));

  revalidatePath("/dashboard");
  return newStatus;
}
