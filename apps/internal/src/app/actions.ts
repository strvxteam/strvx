"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import {
  companies,
  contacts,
  engagements,
  interactions,
  invoiceReconciliations,
  invoices,
  nextActions,
  recurringInvoiceSchedules,
  stageEnum,
  stageHistory,
  users,
  followUpLinks,
  creditCards,
  cardBudgets,
  cardReceipts,
  cardAlerts,
  partners,
  partnerContacts,
  partnerLinks,
  partnerInteractions,
  partnerStageHistory,
  partnerStageEnum,
  skillLibraries,
  skillComponents,
  skills,
  skillComponentLinks,
  agents,
  agentRuns,
  agentRuleLinks,
  corrections,
  patterns,
  devRepos,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
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
  createProjectSchema,
  updateProjectSchema,
  createDocumentSchema,
  updateDocumentSchema,
  searchQuerySchema,
  uuidSchema,
  createRecurringScheduleSchema,
  updateRecurringScheduleSchema,
  manualReconciliationSchema,
  upsertCardConfigSchema,
  createCardBudgetSchema,
  updateCardBudgetSchema,
  upsertCardAlertSchema,
  createSkillLibrarySchema,
  updateSkillLibrarySchema,
  createSkillComponentSchema,
  updateSkillComponentSchema,
  createSkillSchema,
  updateSkillSchema,
  createSkillComponentLinkSchema,
  createAgentSchema,
  updateAgentSchema,
  createCorrectionSchema,
  updateCorrectionSchema,
  createPatternSchema,
} from "@/lib/validations";
import {
  createPartnerSchema,
  updatePartnerSchema,
  changePartnerStageSchema,
  createPartnerContactSchema,
  createPartnerLinkSchema,
  createPartnerInteractionSchema,
} from "@/lib/partner-validations";

let _devFallbackWarned = false;

export async function getCurrentUser() {
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

  // Dev fallback: use strvx account (log once to avoid noise)
  if (!_devFallbackWarned) {
    _devFallbackWarned = true;
    console.warn("[DEV] Auth not configured — using dev fallback user (strvxteam@strvx.com)");
  }
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

  await logAudit({
    userId: user.id,
    action: "stage_change",
    entityType: "engagement",
    entityId: engagementId,
    metadata: { from: oldStage, to: newStage },
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

export async function deleteAction(actionId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(actionId);
  if (!parsed.success) throw new Error("Invalid action ID");

  await db.delete(nextActions).where(eq(nextActions.id, actionId));

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
      name: parsed.data.name ?? undefined,
      dealValue: parsed.data.dealValue ?? undefined,
      probability: parsed.data.probability ?? undefined,
      expectedCloseDate: parsed.data.expectedCloseDate ?? undefined,
      maintenanceOptedIn: parsed.data.maintenanceOptedIn ?? undefined,
      maintenanceMonthlyFee: parsed.data.maintenanceMonthlyFee ?? undefined,
      maintenanceNextCheckin: parsed.data.maintenanceNextCheckin ?? undefined,
      tags: parsed.data.tags ?? undefined,
    })
    .where(eq(engagements.id, parsedId.data));

  revalidatePath(`/clients/${parsedId.data}`);
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
  const user = await getCurrentUser();
  const parsed = uuidSchema.safeParse(engagementId);
  if (!parsed.success) throw new Error("Invalid engagement ID");

  await db
    .update(engagements)
    .set({ archivedAt: new Date() })
    .where(eq(engagements.id, engagementId));

  await logAudit({
    userId: user.id,
    action: "archive",
    entityType: "engagement",
    entityId: engagementId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/clients");
}

// ── Delete Engagement ──────────────────────────────────

export async function deleteEngagement(engagementId: string) {
  const user = await getCurrentUser();
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

  await logAudit({
    userId: user.id,
    action: "delete",
    entityType: "engagement",
    entityId: parsed.data,
    metadata: { companyId: eng.companyId },
  });

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

  // Push to Google Calendar if connected, capture the Google event ID and Meet link
  let googleEventId: string | null = null;
  let autoMeetLink: string | null = null;
  try {
    const isConnected = await isGoogleCalendarConnected(user.id);
    if (isConnected) {
      const startDate = new Date(`${parsed.data.date}T${String(Math.floor(parsed.data.startHour)).padStart(2, '0')}:${String(Math.round((parsed.data.startHour % 1) * 60)).padStart(2, '0')}:00`);
      const endDate = new Date(startDate.getTime() + parsed.data.durationHours * 60 * 60 * 1000);
      const gcalEvent = await createGoogleCalendarEvent(user.id, {
        title: parsed.data.title,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      });
      googleEventId = gcalEvent?.id ?? null;
      autoMeetLink =
        gcalEvent?.hangoutLink ??
        gcalEvent?.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video"
        )?.uri ??
        null;
    }
  } catch (e) {
    console.error("[Google Calendar] Failed to sync event:", e);
  }

  const event = await createCalendarEvent({
    ...parsed.data,
    client: parsed.data.client || null,
    zoomLink: autoMeetLink || null,
    createdBy: user.id,
    googleEventId,
  });

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

  const user = await getCurrentUser();
  const { updateCalendarEvent, getCalendarEventById } = await import("@/lib/queries");
  const updated = await updateCalendarEvent(parsedId.data, parsed.data);

  // Sync changes to Google Calendar if the event has a linked Google event
  try {
    const dbEvent = await getCalendarEventById(parsedId.data);
    if (dbEvent?.googleEventId) {
      const updateData: Parameters<typeof updateGoogleCalendarEvent>[2] = {};
      if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
      if (parsed.data.date && parsed.data.startHour !== undefined && parsed.data.durationHours !== undefined) {
        const startH = Math.floor(parsed.data.startHour);
        const startM = Math.round((parsed.data.startHour - startH) * 60);
        const endHourRaw = parsed.data.startHour + parsed.data.durationHours;
        const endH = Math.floor(endHourRaw);
        const endM = Math.round((endHourRaw - endH) * 60);
        updateData.startTime = `${parsed.data.date}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00`;
        updateData.endTime = `${parsed.data.date}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
      }
      if (Object.keys(updateData).length > 0) {
        await updateGoogleCalendarEvent(user.id, dbEvent.googleEventId, updateData);
      }
    }
  } catch (e) {
    console.error("[Google Calendar] Failed to sync update:", e);
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return updated;
}

export async function deleteCalendarEventAction(eventId: string) {
  const parsed = uuidSchema.safeParse(eventId);
  if (!parsed.success) throw new Error("Invalid event ID");

  const user = await getCurrentUser();
  const { deleteCalendarEvent, getCalendarEventById } = await import("@/lib/queries");

  // Delete from Google Calendar if linked
  try {
    const dbEvent = await getCalendarEventById(parsed.data);
    if (dbEvent?.googleEventId) {
      await deleteGoogleCalendarEvent(user.id, dbEvent.googleEventId);
    }
  } catch (e) {
    console.error("[Google Calendar] Failed to sync delete:", e);
  }

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

  // Wrap assignee + task update in transaction to prevent race conditions
  await db.transaction(async (tx) => {
    if (parsed.data.assigneeIds) {
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, parsedId.data));
      if (parsed.data.assigneeIds.length > 0) {
        await tx.insert(taskAssignees).values(
          parsed.data.assigneeIds.map((userId) => ({
            taskId: parsedId.data,
            userId,
          }))
        );
      }
    }
    if (Object.keys(setData).length > 0) {
      await tx.update(tasks).set(setData).where(eq(tasks.id, parsedId.data));
    }
  });

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
  const user = await getCurrentUser();
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

  await logAudit({
    userId: user.id,
    action: "create",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber, amount: parsed.data.amount, clientName: parsed.data.clientName },
  });

  revalidatePath("/invoices");
  revalidatePath("/finances");
  return invoice;
}

export async function sendInvoiceAction(invoiceId: string) {
  const user = await getCurrentUser();
  const parsedId = uuidSchema.safeParse(invoiceId);
  if (!parsedId.success) throw new Error("Invalid invoice ID");
  const { getInvoice } = await import("@/lib/queries");
  const invoice = await getInvoice(parsedId.data);
  if (!invoice) throw new Error("Invoice not found");
  if (!invoice.clientEmail) throw new Error("Invoice has no client email — add one before sending");

  const lineItems = Array.isArray(invoice.lineItems)
    ? (invoice.lineItems as { description: string; quantity: number; rate: number; amount: number }[])
    : [];

  // Create Stripe payment link if Stripe is configured and no payment URL exists yet
  let stripePaymentUrl = invoice.stripePaymentUrl;
  let stripeInvoiceId = invoice.stripeInvoiceId;

  if (!stripePaymentUrl && process.env.STRIPE_SECRET_KEY) {
    try {
      const { getOrCreateStripeCustomer, createAndSendStripeInvoice } = await import("@/lib/stripe");

      // Find company by client name to get/create Stripe customer
      const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.name, invoice.clientName));

      if (company) {
        const customerId = await getOrCreateStripeCustomer(
          company.id,
          invoice.clientName,
          invoice.clientEmail
        );

        const result = await createAndSendStripeInvoice({
          stripeCustomerId: customerId,
          lineItems: lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            rate: li.rate,
          })),
          dueDate: invoice.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
          notes: invoice.notes || undefined,
          invoiceNumber: invoice.invoiceNumber,
        });

        stripePaymentUrl = result.paymentUrl;
        stripeInvoiceId = result.stripeInvoiceId;
      }
    } catch (err) {
      console.error("[Stripe] Failed to create payment link:", err);
      // Continue sending email without payment link
    }
  }

  // Send styled invoice email via Resend
  const { sendInvoiceEmail } = await import("@/lib/invoice-email");
  await sendInvoiceEmail({
    invoiceNumber: invoice.invoiceNumber,
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    amount: Number(invoice.amount),
    taxRate: Number(invoice.taxRate ?? 0),
    issuedDate: invoice.issuedDate ?? new Date().toISOString().split("T")[0],
    dueDate: invoice.dueDate ?? "",
    lineItems,
    notes: invoice.notes,
    stripePaymentUrl,
  });

  // Update invoice status and Stripe fields
  await db
    .update(invoices)
    .set({
      status: "sent",
      issuedDate: invoice.issuedDate || new Date().toISOString().split("T")[0],
      ...(stripeInvoiceId ? { stripeInvoiceId } : {}),
      ...(stripePaymentUrl ? { stripePaymentUrl } : {}),
    })
    .where(eq(invoices.id, invoiceId));

  await logAudit({
    userId: user.id,
    action: "send",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: { stripeInvoiceId, invoiceNumber: invoice.invoiceNumber },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/finances");
}

// ── Portal Access ────────────────────────────────────

export async function createPortalToken(companyId: string, contactEmail: string) {
  await getCurrentUser();
  if (!companyId || !contactEmail) throw new Error("Company and email are required");

  const parsedCompanyId = uuidSchema.safeParse(companyId);
  if (!parsedCompanyId.success) throw new Error("Invalid company ID");

  const { portalTokens } = await import("@/lib/db/schema");
  // 128-bit entropy: two UUIDs concatenated, 32 hex chars
  const token = (crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")).slice(0, 32).toUpperCase();
  // Default expiry: 90 days
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const [result] = await db
    .insert(portalTokens)
    .values({
      companyId: parsedCompanyId.data,
      contactEmail,
      token,
      expiresAt,
    })
    .returning({ token: portalTokens.token });

  return result.token;
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

// ── Time Entries ─────────────────────────────────────

export async function createTimeEntry(data: {
  projectId: string;
  date: string;
  hours: number;
  description: string;
  billable?: boolean;
}) {
  const user = await getCurrentUser();
  const parsedProjectId = uuidSchema.safeParse(data.projectId);
  if (!parsedProjectId.success) throw new Error("Invalid project ID");
  if (!data.description.trim()) throw new Error("Description is required");
  if (!Number.isFinite(data.hours) || data.hours <= 0 || data.hours > 24) throw new Error("Hours must be between 0 and 24");

  const { timeEntries } = await import("@/lib/db/schema");
  const [entry] = await db
    .insert(timeEntries)
    .values({
      userId: user.id,
      projectId: parsedProjectId.data,
      date: data.date,
      durationMinutes: Math.round(data.hours * 60),
      description: data.description.trim(),
      billable: data.billable ?? true,
    })
    .returning();
  revalidatePath(`/projects/${parsedProjectId.data}`);
  return entry;
}

export async function deleteTimeEntry(entryId: string, projectId: string) {
  await getCurrentUser();
  const parsedEntryId = uuidSchema.safeParse(entryId);
  const parsedProjectId = uuidSchema.safeParse(projectId);
  if (!parsedEntryId.success) throw new Error("Invalid entry ID");
  if (!parsedProjectId.success) throw new Error("Invalid project ID");

  const { timeEntries } = await import("@/lib/db/schema");
  await db.delete(timeEntries).where(eq(timeEntries.id, parsedEntryId.data));
  revalidatePath(`/projects/${parsedProjectId.data}`);
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

export async function deleteInvoiceAction(invoiceId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(invoiceId);
  if (!parsed.success) throw new Error("Invalid invoice ID");

  await db.delete(invoices).where(eq(invoices.id, parsed.data));
  revalidatePath("/invoices");
  revalidatePath("/finances");
}

// ── Monitoring ───────────────────────────────────────

export async function addMonitoredSite(data: { name: string; url: string; type: "internal" | "client" }) {
  await getCurrentUser();
  if (!data.name.trim() || !data.url.trim()) throw new Error("Name and URL required");

  try { new URL(data.url); } catch { throw new Error("Invalid URL"); }

  const { monitoredSites } = await import("@/lib/db/schema");
  const [site] = await db
    .insert(monitoredSites)
    .values({
      name: data.name.trim(),
      url: data.url.trim(),
      type: data.type,
    })
    .returning();
  revalidatePath("/development/monitoring");
  return site;
}

export async function removeMonitoredSite(siteId: string) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(siteId);
  if (!parsedId.success) throw new Error("Invalid site ID");

  const { monitoredSites } = await import("@/lib/db/schema");
  await db.delete(monitoredSites).where(eq(monitoredSites.id, parsedId.data));
  revalidatePath("/development/monitoring");
}

// ── Development (DevOps) Actions ──────────────────────

export async function refreshDevOpsAction() {
  await getCurrentUser();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  const secret = process.env.DEV_OPS_REFRESH_SECRET ?? "";
  try {
    const res = await fetch(`${origin}/api/dev/refresh${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`, {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Refresh failed: ${res.status}`);
    }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Refresh failed");
  }
  revalidatePath("/development");
  revalidatePath("/development/repos");
  revalidatePath("/development/deployments");
  revalidatePath("/development/pull-requests");
  revalidatePath("/development/actions");
}

// ── Company Actions ──────────────────────────────────

export async function getCompaniesAction() {
  await getCurrentUser();
  return getCompanies();
}

export async function createCompanyAction(name: string) {
  await getCurrentUser();
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

export async function voidInvoiceAction(invoiceId: string) {
  const user = await getCurrentUser();
  const parsedId = uuidSchema.safeParse(invoiceId);
  if (!parsedId.success) throw new Error("Invalid invoice ID");

  const [invoice] = await db
    .select({ stripeInvoiceId: invoices.stripeInvoiceId, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, parsedId.data));

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

  await logAudit({
    userId: user.id,
    action: "void",
    entityType: "invoice",
    entityId: invoiceId,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/finances");
}

export async function markInvoicePaidAction(invoiceId: string) {
  const user = await getCurrentUser();
  const parsedId = uuidSchema.safeParse(invoiceId);
  if (!parsedId.success) throw new Error("Invalid invoice ID");

  await db
    .update(invoices)
    .set({
      status: "paid",
      paidDate: new Date().toISOString().split("T")[0],
    })
    .where(eq(invoices.id, parsedId.data));

  await logAudit({
    userId: user.id,
    action: "mark_paid",
    entityType: "invoice",
    entityId: parsedId.data,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${parsedId.data}`);
  revalidatePath("/finances");
}

// ── User Status ──────────────────────────────────────────

export async function toggleUserStatus(userId: string) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(userId);
  if (!parsedId.success) throw new Error("Invalid user ID");

  const [user] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, parsedId.data));

  if (!user) throw new Error("User not found");

  const newStatus = user.status === "available" ? "busy" : "available";
  await db
    .update(users)
    .set({ status: newStatus })
    .where(eq(users.id, parsedId.data));

  revalidatePath("/dashboard");
  return newStatus;
}

// ── Follow-up Links ───────────────────────────────────────────────────────────

export async function createFollowUpLink(
  engagementId: string,
  meetingType: "proposal" | "revision" | "in_person"
): Promise<string> {
  const user = await getCurrentUser();
  const token = crypto.randomUUID().replace(/-/g, "");

  await db.insert(followUpLinks).values({
    token,
    engagementId,
    meetingType,
    createdBy: user.id,
  });

  revalidatePath(`/clients/${engagementId}`);
  return token;
}

// ── Recurring Schedule Actions ──────────────────────

export async function createRecurringScheduleAction(data: {
  engagementId: string;
  type: "retainer" | "milestone" | "commission";
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly";
  nextRunDate: string;
  autoSend: boolean;
  notes?: string;
  lineItemTemplate?: { description: string; quantity: number; rate: number }[];
  commissionRate?: number;
  commissionSourceUrl?: string;
  milestoneSchedule?: { date: string; description: string; amount: number }[];
}) {
  await getCurrentUser();
  const parsed = createRecurringScheduleSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const [schedule] = await db
    .insert(recurringInvoiceSchedules)
    .values({
      engagementId: parsed.data.engagementId,
      type: parsed.data.type,
      frequency: parsed.data.frequency,
      nextRunDate: parsed.data.nextRunDate,
      autoSend: parsed.data.autoSend,
      notes: parsed.data.notes || null,
      lineItemTemplate: parsed.data.lineItemTemplate || null,
      commissionRate: parsed.data.commissionRate != null ? String(parsed.data.commissionRate) : null,
      commissionSourceUrl: parsed.data.commissionSourceUrl || null,
      milestoneSchedule: parsed.data.milestoneSchedule || null,
    })
    .returning();

  revalidatePath("/invoices");
  return schedule;
}

export async function updateRecurringScheduleAction(
  scheduleId: string,
  data: { status?: "active" | "paused" | "cancelled"; frequency?: string; nextRunDate?: string; autoSend?: boolean; notes?: string }
) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(scheduleId);
  if (!parsedId.success) throw new Error("Invalid schedule ID");

  const updates: Record<string, unknown> = {};
  if (data.status) updates.status = data.status;
  if (data.frequency) updates.frequency = data.frequency;
  if (data.nextRunDate) updates.nextRunDate = data.nextRunDate;
  if (data.autoSend !== undefined) updates.autoSend = data.autoSend;
  if (data.notes !== undefined) updates.notes = data.notes;

  if (Object.keys(updates).length === 0) return;

  await db
    .update(recurringInvoiceSchedules)
    .set(updates)
    .where(eq(recurringInvoiceSchedules.id, scheduleId));

  revalidatePath("/invoices");
}

// ── Manual Reconciliation ───────────────────────────

export async function manualReconcileAction(data: {
  invoiceId: string;
  mercuryTransactionId: string;
  mercuryAmount: number;
}) {
  await getCurrentUser();
  const parsed = manualReconciliationSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const [existing] = await db
    .select()
    .from(invoiceReconciliations)
    .where(eq(invoiceReconciliations.invoiceId, parsed.data.invoiceId));

  if (existing) {
    await db
      .update(invoiceReconciliations)
      .set({
        mercuryTransactionId: parsed.data.mercuryTransactionId,
        mercuryAmount: String(parsed.data.mercuryAmount),
        status: "manual",
        matchedAt: new Date(),
        matchMethod: "manual",
      })
      .where(eq(invoiceReconciliations.id, existing.id));
  } else {
    await db.insert(invoiceReconciliations).values({
      invoiceId: parsed.data.invoiceId,
      mercuryTransactionId: parsed.data.mercuryTransactionId,
      mercuryAmount: String(parsed.data.mercuryAmount),
      status: "manual",
      matchedAt: new Date(),
      matchMethod: "manual",
    });
  }

  revalidatePath("/invoices");
  revalidatePath("/finances");
}

// ── Credit Card Config ──────────────────────────────────

export async function upsertCardConfig(data: {
  mercuryCardId: string;
  cardNickname?: string;
  assignedEmployee?: string;
  creditLimit?: number;
  rewardRate?: number;
}) {
  await getCurrentUser();
  const parsed = upsertCardConfigSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const existing = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.mercuryCardId, parsed.data.mercuryCardId))
    .limit(1);

  if (existing.length > 0) {
    const setData: Record<string, unknown> = {};
    if (parsed.data.cardNickname !== undefined) setData.cardNickname = parsed.data.cardNickname;
    if (parsed.data.assignedEmployee !== undefined) setData.assignedEmployee = parsed.data.assignedEmployee;
    if (parsed.data.creditLimit !== undefined) setData.creditLimit = String(parsed.data.creditLimit);
    if (parsed.data.rewardRate !== undefined) setData.rewardRate = String(parsed.data.rewardRate);

    const [updated] = await db
      .update(creditCards)
      .set(setData)
      .where(eq(creditCards.mercuryCardId, parsed.data.mercuryCardId))
      .returning();
    revalidatePath("/finances");
    return updated;
  }

  const [created] = await db
    .insert(creditCards)
    .values({
      mercuryCardId: parsed.data.mercuryCardId,
      cardNickname: parsed.data.cardNickname ?? null,
      assignedEmployee: parsed.data.assignedEmployee ?? null,
      creditLimit: parsed.data.creditLimit != null ? String(parsed.data.creditLimit) : null,
      rewardRate: parsed.data.rewardRate != null ? String(parsed.data.rewardRate) : null,
    })
    .returning();
  revalidatePath("/finances");
  return created;
}

// ── Card Budgets ────────────────────────────────────────

export async function createCardBudget(data: {
  creditCardId: string;
  category: string;
  monthlyLimit: number;
}) {
  await getCurrentUser();
  const parsed = createCardBudgetSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const [budget] = await db
    .insert(cardBudgets)
    .values({
      creditCardId: parsed.data.creditCardId,
      category: parsed.data.category,
      monthlyLimit: String(parsed.data.monthlyLimit),
    })
    .returning();
  revalidatePath("/finances");
  return budget;
}

export async function updateCardBudget(budgetId: string, data: {
  category?: string;
  monthlyLimit?: number;
}) {
  await getCurrentUser();
  const parsedId = z.string().uuid().safeParse(budgetId);
  if (!parsedId.success) throw new Error("Invalid budget ID");
  const parsed = updateCardBudgetSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const setData: Record<string, unknown> = {};
  if (parsed.data.category !== undefined) setData.category = parsed.data.category;
  if (parsed.data.monthlyLimit !== undefined) setData.monthlyLimit = String(parsed.data.monthlyLimit);

  const [updated] = await db
    .update(cardBudgets)
    .set(setData)
    .where(eq(cardBudgets.id, parsedId.data))
    .returning();
  revalidatePath("/finances");
  return updated;
}

export async function deleteCardBudget(budgetId: string) {
  await getCurrentUser();
  const parsed = z.string().uuid().safeParse(budgetId);
  if (!parsed.success) throw new Error("Invalid budget ID");

  await db.delete(cardBudgets).where(eq(cardBudgets.id, parsed.data));
  revalidatePath("/finances");
}

// ── Card Alerts ─────────────────────────────────────────

export async function upsertCardAlert(data: {
  creditCardId: string;
  alertType: "limit_threshold" | "unusual_spend" | "payment_due";
  thresholdValue: number;
  enabled?: boolean;
}) {
  await getCurrentUser();
  const parsed = upsertCardAlertSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const existing = await db
    .select()
    .from(cardAlerts)
    .where(
      and(
        eq(cardAlerts.creditCardId, parsed.data.creditCardId),
        eq(cardAlerts.alertType, parsed.data.alertType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(cardAlerts)
      .set({
        thresholdValue: String(parsed.data.thresholdValue),
        enabled: parsed.data.enabled ?? true,
      })
      .where(eq(cardAlerts.id, existing[0].id))
      .returning();
    revalidatePath("/finances");
    return updated;
  }

  const [created] = await db
    .insert(cardAlerts)
    .values({
      creditCardId: parsed.data.creditCardId,
      alertType: parsed.data.alertType,
      thresholdValue: String(parsed.data.thresholdValue),
      enabled: parsed.data.enabled ?? true,
    })
    .returning();
  revalidatePath("/finances");
  return created;
}

export async function deleteCardAlert(alertId: string) {
  await getCurrentUser();
  const parsed = z.string().uuid().safeParse(alertId);
  if (!parsed.success) throw new Error("Invalid alert ID");

  await db.delete(cardAlerts).where(eq(cardAlerts.id, parsed.data));
  revalidatePath("/finances");
}

// ── Card Receipts ───────────────────────────────────────

export async function uploadCardReceipt(data: {
  mercuryTransactionId: string;
  creditCardId: string;
  fileUrl: string;
}) {
  await getCurrentUser();
  const parsed = z.object({
    mercuryTransactionId: z.string().min(1),
    creditCardId: z.string().uuid(),
    fileUrl: z.string().url(),
  }).safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  const existing = await db
    .select()
    .from(cardReceipts)
    .where(eq(cardReceipts.mercuryTransactionId, parsed.data.mercuryTransactionId))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(cardReceipts)
      .set({ fileUrl: parsed.data.fileUrl })
      .where(eq(cardReceipts.id, existing[0].id))
      .returning();
    revalidatePath("/finances");
    return updated;
  }

  const [created] = await db
    .insert(cardReceipts)
    .values({
      mercuryTransactionId: parsed.data.mercuryTransactionId,
      creditCardId: parsed.data.creditCardId,
      fileUrl: parsed.data.fileUrl,
    })
    .returning();
  revalidatePath("/finances");
  return created;
}

// ── Partner Actions ─────────────────────────────────────

export async function createPartner(formData: FormData) {
  const user = await getCurrentUser();
  const parsed = createPartnerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    company: formData.get("company"),
    website: formData.get("website"),
    linkedinUrl: formData.get("linkedinUrl"),
    stage: formData.get("stage") || "prospective",
    tags: formData.getAll("tags").filter(Boolean) as string[],
    commissionRate: formData.get("commissionRate"),
    hourlyRate: formData.get("hourlyRate"),
    flatRate: formData.get("flatRate"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const partner = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(partners)
      .values({
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        company: parsed.data.company || null,
        website: parsed.data.website || null,
        linkedinUrl: parsed.data.linkedinUrl || null,
        stage: (parsed.data.stage as (typeof partnerStageEnum.enumValues)[number]) ?? "prospective",
        tags: parsed.data.tags?.length ? parsed.data.tags : null,
        commissionRate: parsed.data.commissionRate || null,
        hourlyRate: parsed.data.hourlyRate || null,
        flatRate: parsed.data.flatRate || null,
        notes: parsed.data.notes || null,
      })
      .returning();

    await tx.insert(partnerStageHistory).values({
      partnerId: p.id,
      stage: p.stage,
    });

    await tx.insert(partnerInteractions).values({
      partnerId: p.id,
      userId: user.id,
      type: "note",
      content: `Created partner "${parsed.data.name}"`,
    });

    return p;
  });

  revalidatePath("/partners");
  revalidatePath("/partners/pipeline");
  return partner;
}

export async function updatePartner(partnerId: string, data: Record<string, unknown>) {
  await getCurrentUser();
  const parsedId = uuidSchema.safeParse(partnerId);
  if (!parsedId.success) throw new Error("Invalid partner ID");
  const parsed = updatePartnerSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updateData[key] = value === "" ? null : value;
    }
  }

  if (Object.keys(updateData).length > 0) {
    await db
      .update(partners)
      .set(updateData)
      .where(eq(partners.id, partnerId));
  }

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  revalidatePath("/partners/pipeline");
}

export async function changePartnerStage(
  partnerId: string,
  newStage: (typeof partnerStageEnum.enumValues)[number]
) {
  const user = await getCurrentUser();
  const parsed = changePartnerStageSchema.safeParse({ partnerId, newStage });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  await db.transaction(async (tx) => {
    // Close current stage history
    await tx
      .update(partnerStageHistory)
      .set({ exitedAt: new Date() })
      .where(
        and(
          eq(partnerStageHistory.partnerId, partnerId),
          isNull(partnerStageHistory.exitedAt)
        )
      );

    // Update partner
    await tx
      .update(partners)
      .set({ stage: newStage, stageEnteredAt: new Date() })
      .where(eq(partners.id, partnerId));

    // New stage history entry
    await tx.insert(partnerStageHistory).values({
      partnerId,
      stage: newStage,
    });

    // Log interaction
    await tx.insert(partnerInteractions).values({
      partnerId,
      userId: user.id,
      type: "stage_change",
      content: `Stage changed to ${newStage}`,
    });
  });

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  revalidatePath("/partners/pipeline");
  revalidatePath("/dashboard");
}

export async function archivePartner(partnerId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(partnerId);
  if (!parsed.success) throw new Error("Invalid partner ID");

  await db
    .update(partners)
    .set({ archivedAt: new Date() })
    .where(eq(partners.id, parsed.data));

  revalidatePath("/partners");
  revalidatePath("/partners/pipeline");
  revalidatePath("/dashboard");
}

export async function createPartnerContact(formData: FormData) {
  await getCurrentUser();
  const parsed = createPartnerContactSchema.safeParse({
    partnerId: formData.get("partnerId"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    linkedinUrl: formData.get("linkedinUrl"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const [contact] = await db
    .insert(partnerContacts)
    .values({
      partnerId: parsed.data.partnerId,
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      role: parsed.data.role || null,
      linkedinUrl: parsed.data.linkedinUrl || null,
    })
    .returning();

  revalidatePath(`/partners/${parsed.data.partnerId}`);
  return contact;
}

export async function deletePartnerContact(contactId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(contactId);
  if (!parsed.success) throw new Error("Invalid contact ID");

  const [contact] = await db
    .select({ partnerId: partnerContacts.partnerId })
    .from(partnerContacts)
    .where(eq(partnerContacts.id, parsed.data));

  await db.delete(partnerContacts).where(eq(partnerContacts.id, parsed.data));

  if (contact) revalidatePath(`/partners/${contact.partnerId}`);
}

export async function createPartnerLink(formData: FormData) {
  const parsed = createPartnerLinkSchema.safeParse({
    partnerId: formData.get("partnerId"),
    engagementId: formData.get("engagementId"),
    projectId: formData.get("projectId"),
    role: formData.get("role"),
    terms: formData.get("terms"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  if (!parsed.data.engagementId && !parsed.data.projectId) {
    throw new Error("Must link to an engagement or project");
  }

  await getCurrentUser();

  const [link] = await db
    .insert(partnerLinks)
    .values({
      partnerId: parsed.data.partnerId,
      engagementId: parsed.data.engagementId || null,
      projectId: parsed.data.projectId || null,
      role: parsed.data.role,
      terms: parsed.data.terms || null,
    })
    .returning();

  revalidatePath(`/partners/${parsed.data.partnerId}`);
  if (parsed.data.engagementId) revalidatePath(`/clients/${parsed.data.engagementId}`);
  if (parsed.data.projectId) revalidatePath(`/projects/${parsed.data.projectId}`);
  return link;
}

export async function deletePartnerLink(linkId: string) {
  await getCurrentUser();
  const parsed = uuidSchema.safeParse(linkId);
  if (!parsed.success) throw new Error("Invalid link ID");

  const [link] = await db
    .select({
      partnerId: partnerLinks.partnerId,
      engagementId: partnerLinks.engagementId,
      projectId: partnerLinks.projectId,
    })
    .from(partnerLinks)
    .where(eq(partnerLinks.id, parsed.data));

  await db.delete(partnerLinks).where(eq(partnerLinks.id, parsed.data));

  if (link) {
    revalidatePath(`/partners/${link.partnerId}`);
    if (link.engagementId) revalidatePath(`/clients/${link.engagementId}`);
    if (link.projectId) revalidatePath(`/projects/${link.projectId}`);
  }
}

export async function createPartnerInteraction(formData: FormData) {
  const user = await getCurrentUser();
  const parsed = createPartnerInteractionSchema.safeParse({
    partnerId: formData.get("partnerId"),
    type: formData.get("type"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const [interaction] = await db
    .insert(partnerInteractions)
    .values({
      partnerId: parsed.data.partnerId,
      userId: user.id,
      type: parsed.data.type,
      content: parsed.data.content,
    })
    .returning();

  revalidatePath(`/partners/${parsed.data.partnerId}`);
  return interaction;
}

export async function quickAddPartnerNote(partnerId: string, content: string) {
  const user = await getCurrentUser();
  if (!partnerId || !content) throw new Error("Partner ID and content required");

  const parsedId = uuidSchema.safeParse(partnerId);
  if (!parsedId.success) throw new Error("Invalid partner ID");

  const [interaction] = await db
    .insert(partnerInteractions)
    .values({
      partnerId: parsedId.data,
      userId: user.id,
      type: "note",
      content,
    })
    .returning();

  revalidatePath(`/partners/${parsedId.data}`);
  return interaction;
}

// ── Skill Libraries ───────────────────────────────────

export async function createSkillLibraryAction(formData: unknown) {
  await getCurrentUser();
  const data = createSkillLibrarySchema.parse(formData);
  const [lib] = await db
    .insert(skillLibraries)
    .values({
      name: data.name,
      slug: data.slug,
      url: data.url || null,
      githubUrl: data.githubUrl || null,
      description: data.description || null,
      installMethod: data.installMethod,
      license: data.license || null,
      category: data.category,
      logoUrl: data.logoUrl || null,
    })
    .returning();
  revalidatePath("/skills");
  return lib;
}

export async function updateSkillLibraryAction(id: string, formData: unknown) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const data = updateSkillLibrarySchema.parse(formData);
  await db
    .update(skillLibraries)
    .set({
      ...data,
      ...(data.url !== undefined && { url: data.url || null }),
      ...(data.githubUrl !== undefined && { githubUrl: data.githubUrl || null }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl || null }),
    })
    .where(eq(skillLibraries.id, id));
  revalidatePath("/skills");
}

export async function toggleSkillLibraryAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const [lib] = await db
    .select({ isActive: skillLibraries.isActive })
    .from(skillLibraries)
    .where(eq(skillLibraries.id, id));
  if (!lib) throw new Error("Library not found");
  await db
    .update(skillLibraries)
    .set({ isActive: !lib.isActive })
    .where(eq(skillLibraries.id, id));
  revalidatePath("/skills");
  return !lib.isActive;
}

export async function deleteSkillLibraryAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  await db.delete(skillLibraries).where(eq(skillLibraries.id, id));
  revalidatePath("/skills");
}

// ── Skill Components ──────────────────────────────────

export async function createSkillComponentAction(formData: unknown) {
  await getCurrentUser();
  const data = createSkillComponentSchema.parse(formData);
  const [comp] = await db
    .insert(skillComponents)
    .values({
      libraryId: data.libraryId,
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      category: data.category,
      installCommand: data.installCommand || null,
      importPath: data.importPath || null,
      dependencies: data.dependencies || null,
      propsSummary: data.propsSummary || null,
      status: data.status || "available",
      tags: data.tags || null,
    })
    .returning();
  revalidatePath("/skills/components");
  return comp;
}

export async function updateSkillComponentAction(id: string, formData: unknown) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const data = updateSkillComponentSchema.parse(formData);
  await db
    .update(skillComponents)
    .set(data)
    .where(eq(skillComponents.id, id));
  revalidatePath("/skills/components");
}

export async function deleteSkillComponentAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  await db.delete(skillComponents).where(eq(skillComponents.id, id));
  revalidatePath("/skills/components");
}

// ── Skills (Rules) ────────────────────────────────────

export async function createSkillAction(formData: unknown) {
  const user = await getCurrentUser();
  const data = createSkillSchema.parse(formData);
  const [skill] = await db
    .insert(skills)
    .values({
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      type: data.type,
      category: data.category,
      scope: data.scope ?? "importable",
      rules: data.rules || null,
      codeSnippets: data.codeSnippets || null,
      priority: data.priority ?? 0,
      createdBy: user.id,
    })
    .returning();
  revalidatePath("/skills/rules");
  await autoRedeployActiveAgents();
  return skill;
}

export async function updateSkillAction(id: string, formData: unknown) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const data = updateSkillSchema.parse(formData);
  await db
    .update(skills)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(skills.id, id));
  revalidatePath("/skills/rules");
  await autoRedeployActiveAgents();
}

export async function toggleSkillAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const [skill] = await db
    .select({ isActive: skills.isActive })
    .from(skills)
    .where(eq(skills.id, id));
  if (!skill) throw new Error("Skill not found");
  await db
    .update(skills)
    .set({ isActive: !skill.isActive, updatedAt: new Date() })
    .where(eq(skills.id, id));
  revalidatePath("/skills/rules");
  await autoRedeployActiveAgents();
  return !skill.isActive;
}

export async function deleteSkillAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  await db.delete(skills).where(eq(skills.id, id));
  revalidatePath("/skills/rules");
  await autoRedeployActiveAgents();
}

// ── Skill-Component Links ─────────────────────────────

export async function createSkillComponentLinkAction(formData: unknown) {
  await getCurrentUser();
  const data = createSkillComponentLinkSchema.parse(formData);
  const [link] = await db
    .insert(skillComponentLinks)
    .values({
      skillId: data.skillId,
      componentId: data.componentId,
      context: data.context || null,
      isDefault: data.isDefault ?? false,
    })
    .returning();
  revalidatePath("/skills/rules");
  return link;
}

export async function deleteSkillComponentLinkAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  await db.delete(skillComponentLinks).where(eq(skillComponentLinks.id, id));
  revalidatePath("/skills/rules");
}

// ── Agents ────────────────────────────────────────────

export async function createAgentAction(formData: unknown) {
  const data = createAgentSchema.parse(formData);
  const user = await getCurrentUser();
  const [agent] = await db
    .insert(agents)
    .values({
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      type: data.type,
      status: data.status || "draft",
      config: data.config || null,
      skillIds: data.skillIds || null,
      trigger: data.trigger || null,
      ownerId: user.id,
    })
    .returning();
  revalidatePath("/skills/agents");
  return agent;
}

export async function updateAgentAction(id: string, formData: unknown) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const data = updateAgentSchema.parse(formData);
  await db
    .update(agents)
    .set(data)
    .where(eq(agents.id, id));
  revalidatePath("/skills/agents");
}

export async function toggleAgentStatusAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const [agent] = await db
    .select({ status: agents.status })
    .from(agents)
    .where(eq(agents.id, id));
  if (!agent) throw new Error("Agent not found");
  const newStatus = agent.status === "active" ? "paused" : "active";
  await db
    .update(agents)
    .set({ status: newStatus })
    .where(eq(agents.id, id));
  revalidatePath("/skills/agents");
  return newStatus;
}

export async function deleteAgentAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  await db.delete(agents).where(eq(agents.id, id));
  revalidatePath("/skills/agents");
}

export async function createAgentRunAction(agentId: string, input: string) {
  const user = await getCurrentUser();
  uuidSchema.parse(agentId);
  const [run] = await db
    .insert(agentRuns)
    .values({
      agentId,
      triggeredBy: user.id,
      input,
      status: "running",
    })
    .returning();
  await db
    .update(agents)
    .set({ lastRunAt: new Date() })
    .where(eq(agents.id, agentId));
  revalidatePath("/skills/agents");
  return run;
}

export async function completeAgentRunAction(
  runId: string,
  result: { output: string; status: "success" | "failed"; durationMs: number }
) {
  await getCurrentUser();
  uuidSchema.parse(runId);
  await db
    .update(agentRuns)
    .set({
      output: result.output,
      status: result.status,
      durationMs: result.durationMs,
    })
    .where(eq(agentRuns.id, runId));
  revalidatePath("/skills/agents");
}

// ── Export Skills to Claude Config ────────────────────

export async function exportSkillsToAgentConfig() {
  await getCurrentUser();

  const activeSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.isActive, true))
    .orderBy(skills.priority, skills.name);

  const categoryLabels: Record<string, string> = {
    layout: "Layout",
    "design-tokens": "Design Tokens",
    "component-preference": "Components",
    behavioral: "Behavioral",
    pattern: "Patterns",
  };

  const grouped = new Map<string, typeof activeSkills>();
  for (const skill of activeSkills) {
    const cat = skill.category;
    const existing = grouped.get(cat) ?? [];
    existing.push(skill);
    grouped.set(cat, existing);
  }

  let md = "# STRVX Design System — Agent Rules\n\n";
  md += "> Auto-generated from active skills. Do not edit manually.\n\n";

  for (const [category, categorySkills] of grouped) {
    md += `## ${categoryLabels[category] ?? category}\n\n`;
    for (const skill of categorySkills) {
      if (skill.rules && Array.isArray(skill.rules)) {
        for (const r of skill.rules as { rule: string; detail?: string }[]) {
          md += `- ${r.rule}`;
          if (r.detail) md += ` — ${r.detail}`;
          md += "\n";
        }
      }
      if (skill.codeSnippets && Array.isArray(skill.codeSnippets)) {
        for (const s of skill.codeSnippets as { label: string; code: string; language?: string }[]) {
          md += `\n### ${s.label}\n\n\`\`\`${s.language ?? "tsx"}\n${s.code}\n\`\`\`\n\n`;
        }
      }
    }
    md += "\n";
  }

  // Add corrections section
  const activeCorrections = await db
    .select()
    .from(corrections)
    .where(eq(corrections.isActive, true))
    .orderBy(corrections.severity);

  if (activeCorrections.length > 0) {
    md += "\n## Corrections (DO NOT repeat these mistakes)\n\n";
    const severityOrder = ["critical", "important", "minor"];
    for (const sev of severityOrder) {
      const filtered = activeCorrections.filter((c) => c.severity === sev);
      if (filtered.length === 0) continue;
      md += `### ${sev.toUpperCase()}\n\n`;
      for (const c of filtered) {
        md += `**${c.title}** (${c.category})\n`;
        md += `${c.description}\n`;
        if (c.wrongApproach) md += `- WRONG: ${c.wrongApproach}\n`;
        if (c.correctApproach) md += `- CORRECT: ${c.correctApproach}\n`;
        if (c.codeExample) md += `\`\`\`tsx\n${c.codeExample}\n\`\`\`\n`;
        md += "\n";
      }
    }
  }

  // Add component reference section
  const allComponents = await db
    .select({
      name: skillComponents.name,
      category: skillComponents.category,
      libraryName: skillLibraries.name,
      whenToUse: skillComponents.whenToUse,
      keyProps: skillComponents.keyProps,
      importPath: skillComponents.importPath,
      installCommand: skillComponents.installCommand,
    })
    .from(skillComponents)
    .innerJoin(skillLibraries, eq(skillComponents.libraryId, skillLibraries.id))
    .where(eq(skillLibraries.isActive, true))
    .orderBy(skillComponents.category, skillComponents.name);

  if (allComponents.length > 0) {
    md += "\n## Component Reference\n\n";
    let currentCat = "";
    for (const comp of allComponents) {
      if (comp.category !== currentCat) {
        currentCat = comp.category;
        md += `### ${currentCat}\n\n`;
      }
      md += `- **${comp.name}** (${comp.libraryName})`;
      if (comp.whenToUse) md += ` — ${comp.whenToUse}`;
      md += "\n";
      if (comp.importPath) md += `  Import: \`${comp.importPath}\`\n`;
      if (comp.keyProps) md += `  Props: ${comp.keyProps}\n`;
    }
  }

  return md.trim();
}

// ── Corrections ───────────────────────────────────────

export async function createCorrectionAction(formData: unknown) {
  const user = await getCurrentUser();
  const data = createCorrectionSchema.parse(formData);
  const [correction] = await db
    .insert(corrections)
    .values({
      title: data.title,
      description: data.description,
      wrongApproach: data.wrongApproach || null,
      correctApproach: data.correctApproach || null,
      codeExample: data.codeExample || null,
      severity: data.severity,
      category: data.category,
      createdBy: user.id,
    })
    .returning();
  revalidatePath("/skills/corrections");
  await autoRedeployActiveAgents();
  return correction;
}

export async function updateCorrectionAction(id: string, formData: unknown) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const data = updateCorrectionSchema.parse(formData);
  await db
    .update(corrections)
    .set(data)
    .where(eq(corrections.id, id));
  revalidatePath("/skills/corrections");
  await autoRedeployActiveAgents();
}

export async function toggleCorrectionAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const [corr] = await db
    .select({ isActive: corrections.isActive })
    .from(corrections)
    .where(eq(corrections.id, id));
  if (!corr) throw new Error("Correction not found");
  await db
    .update(corrections)
    .set({ isActive: !corr.isActive })
    .where(eq(corrections.id, id));
  revalidatePath("/skills/corrections");
  await autoRedeployActiveAgents();
  return !corr.isActive;
}

export async function deleteCorrectionAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  await db.delete(corrections).where(eq(corrections.id, id));
  revalidatePath("/skills/corrections");
  await autoRedeployActiveAgents();
}

// ── Auto-Redeploy (feedback loop) ─────────────────────

async function autoRedeployActiveAgents() {
  const activeAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.status, "active"));
  for (const a of activeAgents) {
    try {
      await deployAgentAction(a.id);
    } catch {
      // Silent — don't block the original action
    }
  }
}

// ── Agent Rule Composition ────────────────────────────

export async function toggleAgentRuleAction(agentId: string, skillId: string) {
  await getCurrentUser();
  uuidSchema.parse(agentId);
  uuidSchema.parse(skillId);

  const [existing] = await db
    .select()
    .from(agentRuleLinks)
    .where(and(eq(agentRuleLinks.agentId, agentId), eq(agentRuleLinks.skillId, skillId)));

  if (existing) {
    await db
      .update(agentRuleLinks)
      .set({ included: !existing.included })
      .where(eq(agentRuleLinks.id, existing.id));
    revalidatePath("/skills/agents");
    return !existing.included;
  } else {
    await db
      .insert(agentRuleLinks)
      .values({ agentId, skillId, included: true });
    revalidatePath("/skills/agents");
    return true;
  }
}

export async function addRuleToAgentAction(agentId: string, skillId: string) {
  await getCurrentUser();
  uuidSchema.parse(agentId);
  uuidSchema.parse(skillId);
  await db
    .insert(agentRuleLinks)
    .values({ agentId, skillId, included: true })
    .onConflictDoNothing();
  revalidatePath("/skills/agents");
}

export async function removeRuleFromAgentAction(agentId: string, skillId: string) {
  await getCurrentUser();
  uuidSchema.parse(agentId);
  uuidSchema.parse(skillId);
  await db
    .delete(agentRuleLinks)
    .where(and(eq(agentRuleLinks.agentId, agentId), eq(agentRuleLinks.skillId, skillId)));
  revalidatePath("/skills/agents");
}

export async function updateAgentIdentityAction(agentId: string, identity: string) {
  await getCurrentUser();
  uuidSchema.parse(agentId);
  const validated = z.string().max(5000, "Identity too long").parse(identity);
  await db
    .update(agents)
    .set({ identity: validated })
    .where(eq(agents.id, agentId));
  revalidatePath("/skills/agents");
}

export async function updateAgentSettingsAction(
  agentId: string,
  settings: { includeCorrections?: boolean; includeComponents?: boolean; deployPath?: string }
) {
  await getCurrentUser();
  uuidSchema.parse(agentId);
  await db
    .update(agents)
    .set(settings)
    .where(eq(agents.id, agentId));
  revalidatePath("/skills/agents");
}

// ── Deploy Agent ──────────────────────────────────────

export async function deployAgentAction(agentId: string) {
  await getCurrentUser();
  uuidSchema.parse(agentId);

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) throw new Error("Agent not found");

  // Get linked rules (included only)
  const linkedRules = await db
    .select({ skillId: agentRuleLinks.skillId })
    .from(agentRuleLinks)
    .where(and(eq(agentRuleLinks.agentId, agentId), eq(agentRuleLinks.included, true)));

  const linkedSkillIds = new Set(linkedRules.map((r) => r.skillId));

  // Get all global rules + linked importable rules
  const allSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.isActive, true))
    .orderBy(skills.priority, skills.name);

  const activeRules = allSkills.filter(
    (s) => s.scope === "global" || linkedSkillIds.has(s.id)
  );

  // Build the markdown
  const categoryLabels: Record<string, string> = {
    layout: "Layout",
    "design-tokens": "Design Tokens",
    "component-preference": "Components",
    behavioral: "Behavioral",
    pattern: "Patterns",
  };

  let md = `# ${agent.name}\n\n`;
  if (agent.identity) {
    md += `${agent.identity}\n\n`;
  }
  md += `> Deployed from SIT on ${new Date().toISOString().split("T")[0]}. Do not edit manually.\n\n`;

  // Rules by category
  const grouped = new Map<string, typeof activeRules>();
  for (const skill of activeRules) {
    const cat = skill.category;
    const existing = grouped.get(cat) ?? [];
    existing.push(skill);
    grouped.set(cat, existing);
  }

  for (const [category, categorySkills] of grouped) {
    md += `## ${categoryLabels[category] ?? category}\n\n`;
    for (const skill of categorySkills) {
      const scope = skill.scope === "global" ? "[GLOBAL]" : "[IMPORTED]";
      if (skill.description) md += `### ${skill.name} ${scope}\n${skill.description}\n\n`;
      if (skill.rules && Array.isArray(skill.rules)) {
        for (const r of skill.rules as { rule: string; detail?: string }[]) {
          md += `- ${r.rule}`;
          if (r.detail) md += ` — ${r.detail}`;
          md += "\n";
        }
        md += "\n";
      }
      if (skill.codeSnippets && Array.isArray(skill.codeSnippets)) {
        for (const s of skill.codeSnippets as { label: string; code: string; language?: string }[]) {
          md += `#### ${s.label}\n\`\`\`${s.language ?? "tsx"}\n${s.code}\n\`\`\`\n\n`;
        }
      }
    }
  }

  // Corrections
  if (agent.includeCorrections) {
    const activeCorrections = await db
      .select()
      .from(corrections)
      .where(eq(corrections.isActive, true))
      .orderBy(corrections.severity);

    if (activeCorrections.length > 0) {
      md += "## Corrections — DO NOT Repeat These Mistakes\n\n";
      const sevOrder = ["critical", "important", "minor"];
      for (const sev of sevOrder) {
        const filtered = activeCorrections.filter((c) => c.severity === sev);
        if (filtered.length === 0) continue;
        md += `### ${sev.toUpperCase()}\n\n`;
        for (const c of filtered) {
          md += `**${c.title}** (${c.category})\n`;
          md += `${c.description}\n`;
          if (c.wrongApproach) md += `- WRONG: ${c.wrongApproach}\n`;
          if (c.correctApproach) md += `- CORRECT: ${c.correctApproach}\n`;
          if (c.codeExample) md += `\`\`\`tsx\n${c.codeExample}\n\`\`\`\n`;
          md += "\n";
        }
      }
    }
  }

  // Layout patterns
  const activePatterns = await db
    .select()
    .from(patterns)
    .where(eq(patterns.isActive, true))
    .orderBy(patterns.archetype, patterns.name);

  if (activePatterns.length > 0) {
    md += "## Page Archetypes — Layout Trees From Real Code\n\n";
    md += "Before writing any code, match the user's request to one of these archetypes and follow its layout tree.\n\n";
    const archetypeLabels: Record<string, string> = {
      list: "List Page", detail: "Detail Page", dashboard: "Dashboard Page",
      form: "Form Page", editor: "Editor Page", split: "Split Page",
    };
    let currentArchetype = "";
    for (const p of activePatterns) {
      if (p.archetype !== currentArchetype) {
        currentArchetype = p.archetype;
        md += `### ${archetypeLabels[p.archetype] ?? p.archetype}\n\n`;
      }
      md += `**${p.name}** (from ${p.sourceProject}`;
      if (p.sourceFile) md += ` — ${p.sourceFile}`;
      md += ")\n";
      md += "```\n" + p.layoutTree + "\n```\n";
      if (p.codeExample) {
        md += "```tsx\n" + p.codeExample + "\n```\n";
      }
      md += "\n";
    }
  }

  // Component reference
  if (agent.includeComponents) {
    const comps = await db
      .select({
        name: skillComponents.name,
        category: skillComponents.category,
        libraryName: skillLibraries.name,
        whenToUse: skillComponents.whenToUse,
        importPath: skillComponents.importPath,
      })
      .from(skillComponents)
      .innerJoin(skillLibraries, eq(skillComponents.libraryId, skillLibraries.id))
      .where(eq(skillLibraries.isActive, true))
      .orderBy(skillComponents.category, skillComponents.name);

    if (comps.length > 0) {
      md += "## Component Reference\n\n";
      let currentCat = "";
      for (const comp of comps) {
        if (comp.category !== currentCat) {
          currentCat = comp.category;
          md += `### ${currentCat}\n\n`;
        }
        md += `- **${comp.name}** (${comp.libraryName})`;
        if (comp.whenToUse) md += ` — ${comp.whenToUse}`;
        md += "\n";
        if (comp.importPath) md += `  Import: \`${comp.importPath}\`\n`;
      }
    }
  }

  const output = md.trim();
  const deployPath = agent.deployPath ?? ".claude/rules/strvx-uiux-agent.md";

  // Write the file to disk
  const fs = await import("fs/promises");
  const path = await import("path");
  const fullPath = path.join(process.cwd(), deployPath);
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, output, "utf-8");

  // Save deployment record
  await db
    .update(agents)
    .set({
      deployedAt: new Date(),
      deployedOutput: output,
    })
    .where(eq(agents.id, agentId));

  revalidatePath("/skills/agents");
  return { output, path: deployPath, rulesCount: activeRules.length, written: true };
}

// ── Patterns ──────────────────────────────────────────

export async function createPatternAction(formData: unknown) {
  await getCurrentUser();
  const data = createPatternSchema.parse(formData);
  const [pattern] = await db
    .insert(patterns)
    .values({
      name: data.name,
      archetype: data.archetype,
      sourceProject: data.sourceProject,
      sourceFile: data.sourceFile ?? null,
      layoutTree: data.layoutTree,
      codeExample: data.codeExample ?? null,
      annotations: data.annotations ?? null,
    })
    .returning();
  revalidatePath("/skills/patterns");
  return pattern;
}

export async function togglePatternAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  const [p] = await db
    .select({ isActive: patterns.isActive })
    .from(patterns)
    .where(eq(patterns.id, id));
  if (!p) throw new Error("Pattern not found");
  await db
    .update(patterns)
    .set({ isActive: !p.isActive })
    .where(eq(patterns.id, id));
  revalidatePath("/skills/patterns");
  return !p.isActive;
}

export async function deletePatternAction(id: string) {
  await getCurrentUser();
  uuidSchema.parse(id);
  await db.delete(patterns).where(eq(patterns.id, id));
  revalidatePath("/skills/patterns");
}
