import { z } from "zod";

export const createEngagementSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200),
  engagementName: z.string().min(1, "Engagement name is required").max(200),
  contactName: z.string().max(200).optional().default(""),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  contactPhone: z.string().max(30).optional().or(z.literal("")),
  dealValue: z.string().regex(/^\d*\.?\d*$/, "Invalid deal value").optional().or(z.literal("")),
  stage: z.string().optional(),
});

export const quickAddSchema = z.object({
  content: z.string().min(1, "Content is required").max(10000),
  engagementId: z.string().uuid("Invalid engagement ID"),
  dueDate: z.string().optional(),
  scheduledAt: z.string().optional(),
});

export const changeStageSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  newStage: z.enum([
    "lead", "contacted", "discovery", "building_mvp", "proposal",
    "negotiation", "build", "deliver", "maintain", "closed_won", "closed_lost",
  ]),
});

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(5000).optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
  assigneeIds: z.array(z.string().uuid()).min(1).optional(),
  engagementId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  dueDate: z.string().optional(),
});

export const createInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  clientName: z.string().min(1, "Client name is required"),
  amount: z.number().positive("Amount must be positive"),
  taxRate: z.number().min(0).max(100).optional(),
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
  issuedDate: z.string().optional(),
  dueDate: z.string().optional(),
  lineItems: z.unknown().optional(),
  notes: z.string().max(5000).optional(),
  engagementId: z.string().uuid().optional(),
});

export const invoiceDraftSchema = z.object({
  clientCompanyId: z.string().uuid("Select a client"),
  clientEmail: z.string().email("Valid email required"),
  issuedDate: z.string().min(1, "Issue date required"),
  dueDate: z.string().min(1, "Due date required"),
  notes: z.string().max(5000).optional(),
  engagementId: z.string().uuid().optional().or(z.literal("")),
  lineItems: z.array(z.object({
    description: z.string().min(1, "Description required"),
    quantity: z.number().positive("Quantity must be positive"),
    rate: z.number().min(0, "Rate must be non-negative"),
  })).min(1, "At least one line item required"),
});

const expenseCategoryEnum = z.enum([
  "Software", "Hosting", "Marketing", "Office", "Travel", "Contractors", "Misc",
  // legacy lowercase values already in DB
  "software", "marketing", "hosting", "travel", "other",
]);

export const createExpenseSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  amount: z.number().positive("Amount must be positive"),
  category: expenseCategoryEnum,
  date: z.string().min(1, "Date is required"),
  recurring: z.boolean().optional(),
  vendor: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateExpenseSchema = z.object({
  description: z.string().min(1, "Description is required").max(500).optional(),
  amount: z.number().positive("Amount must be positive").optional(),
  category: expenseCategoryEnum.optional(),
  date: z.string().min(1, "Date is required").optional(),
  recurring: z.boolean().optional(),
  vendor: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

export const createGoalSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(1000).optional(),
  targetValue: z.number().positive("Target must be positive"),
  unit: z.enum(["usd", "count", "percent"]).optional(),
  deadline: z.string().optional(),
});

export const createCalendarEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  type: z.enum(["client_call", "internal", "deadline"]),
  date: z.string().min(1, "Date is required"),
  startHour: z.number().min(0).max(24),
  durationHours: z.number().min(0.25).max(12),
  client: z.string().max(200).optional().nullable(),
  zoomLink: z.string().url("Invalid URL").optional().nullable().or(z.literal("")),
});

export const updateCalendarEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).optional(),
  type: z.enum(["client_call", "internal", "deadline"]).optional(),
  date: z.string().min(1, "Date is required").optional(),
  startHour: z.number().min(0).max(24).optional(),
  durationHours: z.number().min(0.25).max(12).optional(),
  client: z.string().max(200).optional().nullable(),
  zoomLink: z.string().url("Invalid URL").optional().nullable().or(z.literal("")),
});

export const createProspectSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  companyName: z.string().min(1, "Company is required").max(200),
  title: z.string().max(200).optional(),
  industrySlug: z.string().min(1).optional(),
  stage: z.enum(["cold", "warm", "hot"]).optional(),
  linkedinUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  notes: z.string().max(5000).optional(),
});

export const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.record(z.string(), z.unknown()).optional(),
  contentText: z.string().max(500000).optional(),
});

export const createMarketingPostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().max(10000).optional(),
  platform: z.enum(["linkedin", "x", "nextdoor"]),
  status: z.enum(["draft", "scheduled", "published"]),
  scheduledAt: z.string().optional(),
});

export const updateEngagementSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  dealValue: z.string().nullable().optional(),
  probability: z.string().nullable().optional(),
  expectedCloseDate: z.string().nullable().optional(),
  maintenanceOptedIn: z.boolean().optional(),
  maintenanceMonthlyFee: z.string().nullable().optional(),
  maintenanceNextCheckin: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export const createContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  role: z.string().max(200).optional(),
  companyId: z.string().uuid("Invalid company ID"),
});

export const updateContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  role: z.string().max(200).optional().or(z.literal("")),
  linkedinUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
  assigneeIds: z.array(z.string().uuid()).min(1).optional(),
  projectId: z.string().uuid().optional().nullable(),
  engagementId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export const updateGoalSchema = z.object({
  currentValue: z.number().optional(),
  achieved: z.boolean().optional(),
});

export const updateMarketingPostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(10000).optional(),
  platform: z.enum(["linkedin", "x", "nextdoor"]).optional(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  scheduledAt: z.string().optional().nullable(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(5000).optional(),
  status: z.enum(["scoping", "active", "paused", "completed"]).optional(),
  client: z.string().max(200).optional(),
  engagementId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  team: z.array(z.string()).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["scoping", "active", "paused", "completed"]).optional(),
  client: z.string().max(200).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  team: z.array(z.string()).optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  contentText: z.string().max(500000).optional(),
});

export const updateProspectSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  companyName: z.string().min(1).max(200).optional(),
  title: z.string().max(200).optional(),
  industrySlug: z.string().optional(),
  stage: z.enum(["cold", "warm", "hot"]).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(5000).optional(),
});

export const logTouchSchema = z.object({
  prospectId: z.string().uuid("Invalid prospect ID"),
  channel: z.enum(["email", "linkedin", "phone", "referral", "apollo"]),
  direction: z.string().min(1),
  subject: z.string().max(500).optional(),
  content: z.string().max(5000).optional(),
});

export const uuidSchema = z.string().uuid("Invalid ID");

export const searchQuerySchema = z.string().min(1, "Search query is required").max(500);

export const changeProspectStageSchema = z.object({
  prospectId: z.string().uuid("Invalid prospect ID"),
  newStage: z.enum(["cold", "warm", "hot", "converted", "lost"]),
});
