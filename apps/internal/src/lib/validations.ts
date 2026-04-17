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
  assigneeIds: z.array(z.string().uuid()).optional(),
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
  invoiceNumber: z.string().min(1, "Invoice number required").max(50),
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

export const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.record(z.string(), z.unknown()).optional(),
  contentText: z.string().max(500000).optional(),
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
  assigneeIds: z.array(z.string().uuid()).optional(),
  projectId: z.string().uuid().optional().nullable(),
  engagementId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export const updateGoalSchema = z.object({
  currentValue: z.number().optional(),
  achieved: z.boolean().optional(),
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

export const uuidSchema = z.string().uuid("Invalid ID");

export const searchQuerySchema = z.string().min(1, "Search query is required").max(500);

export const createRecurringScheduleSchema = z.object({
  engagementId: z.string().uuid("Select an engagement"),
  type: z.enum(["retainer", "milestone", "commission"]),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly"]),
  nextRunDate: z.string().min(1, "Start date required"),
  autoSend: z.boolean().default(false),
  notes: z.string().max(5000).optional(),
  lineItemTemplate: z.array(z.object({
    description: z.string().min(1, "Description required"),
    quantity: z.number().positive("Quantity must be positive"),
    rate: z.number().min(0, "Rate must be non-negative"),
  })).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  commissionSourceUrl: z.string().url("Valid URL required").optional(),
  milestoneSchedule: z.array(z.object({
    date: z.string().min(1, "Date required"),
    description: z.string().min(1, "Description required"),
    amount: z.number().positive("Amount must be positive"),
  })).optional(),
});

export const updateRecurringScheduleSchema = z.object({
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).optional(),
  nextRunDate: z.string().optional(),
  autoSend: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

export const manualReconciliationSchema = z.object({
  invoiceId: z.string().uuid("Invalid invoice ID"),
  mercuryTransactionId: z.string().min(1, "Mercury transaction ID required"),
  mercuryAmount: z.number().positive("Amount must be positive"),
});

// ── Credit Cards ─────────────────────────────────────

export const upsertCardConfigSchema = z.object({
  mercuryCardId: z.string().min(1, "Mercury card ID is required"),
  cardNickname: z.string().max(100).optional(),
  assignedEmployee: z.string().max(200).optional(),
  creditLimit: z.number().min(0).optional(),
  rewardRate: z.number().min(0).max(100).optional(),
});

export const createCardBudgetSchema = z.object({
  creditCardId: z.string().uuid("Invalid card ID"),
  category: z.string().min(1, "Category is required").max(100),
  monthlyLimit: z.number().positive("Budget must be positive"),
});

export const updateCardBudgetSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  monthlyLimit: z.number().positive().optional(),
});

export const upsertCardAlertSchema = z.object({
  creditCardId: z.string().uuid("Invalid card ID"),
  alertType: z.enum(["limit_threshold", "unusual_spend", "payment_due"]),
  thresholdValue: z.number().min(0),
  enabled: z.boolean().optional(),
});

// ── Skills & Agents Validations ───────────────────────

export const createSkillLibrarySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  slug: z.string().min(1, "Slug is required").max(100),
  url: z.string().url("Invalid URL").optional().or(z.literal("")),
  githubUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  description: z.string().max(2000).optional(),
  installMethod: z.enum(["copy-paste", "npm", "shadcn-cli"]),
  license: z.string().max(100).optional(),
  category: z.enum(["base", "animation", "editor", "data", "ai", "full", "utility"]),
  logoUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
});

export const updateSkillLibrarySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().url().optional().or(z.literal("")),
  githubUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().max(2000).optional(),
  installMethod: z.enum(["copy-paste", "npm", "shadcn-cli"]).optional(),
  license: z.string().max(100).optional(),
  category: z.enum(["base", "animation", "editor", "data", "ai", "full", "utility"]).optional(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

export const createSkillComponentSchema = z.object({
  libraryId: z.string().uuid("Invalid library ID"),
  name: z.string().min(1, "Name is required").max(200),
  slug: z.string().min(1, "Slug is required").max(100),
  description: z.string().max(2000).optional(),
  category: z.enum(["form", "layout", "data-display", "overlay", "navigation", "feedback", "animation", "text-effect", "chart", "editor", "ai", "utility", "background", "button", "card", "table", "input"]),
  installCommand: z.string().max(500).optional(),
  importPath: z.string().max(500).optional(),
  dependencies: z.array(z.string()).optional(),
  propsSummary: z.record(z.string(), z.unknown()).optional(),
  keyProps: z.string().max(2000).optional(),
  whenToUse: z.string().max(2000).optional(),
  status: z.enum(["available", "installed", "approved", "deprecated"]).optional(),
  tags: z.array(z.string()).optional(),
});

export const updateSkillComponentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.enum(["form", "layout", "data-display", "overlay", "navigation", "feedback", "animation", "text-effect", "chart", "editor", "ai", "utility", "background", "button", "card", "table", "input"]).optional(),
  installCommand: z.string().max(500).optional(),
  importPath: z.string().max(500).optional(),
  dependencies: z.array(z.string()).optional(),
  propsSummary: z.record(z.string(), z.unknown()).optional(),
  keyProps: z.string().max(2000).optional(),
  whenToUse: z.string().max(2000).optional(),
  status: z.enum(["available", "installed", "approved", "deprecated"]).optional(),
  tags: z.array(z.string()).optional(),
});

export const createSkillSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  slug: z.string().min(1, "Slug is required").max(100),
  description: z.string().max(5000).optional(),
  type: z.enum(["preset", "custom"]),
  category: z.enum(["layout", "design-tokens", "component-preference", "behavioral", "pattern"]),
  scope: z.enum(["global", "importable"]).optional(),
  rules: z.array(z.object({
    rule: z.string().min(1),
    detail: z.string().optional(),
  })).optional(),
  codeSnippets: z.array(z.object({
    label: z.string().min(1),
    code: z.string().min(1),
    language: z.string().optional(),
  })).optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

export const updateSkillSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  category: z.enum(["layout", "design-tokens", "component-preference", "behavioral", "pattern"]).optional(),
  scope: z.enum(["global", "importable"]).optional(),
  rules: z.array(z.object({
    rule: z.string().min(1),
    detail: z.string().optional(),
  })).optional(),
  codeSnippets: z.array(z.object({
    label: z.string().min(1),
    code: z.string().min(1),
    language: z.string().optional(),
  })).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const createSkillComponentLinkSchema = z.object({
  skillId: z.string().uuid("Invalid skill ID"),
  componentId: z.string().uuid("Invalid component ID"),
  context: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
});

export const createAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  slug: z.string().min(1, "Slug is required").max(100),
  description: z.string().max(5000).optional(),
  type: z.enum(["builder", "linter", "reviewer", "automation"]),
  status: z.enum(["active", "paused", "draft"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  trigger: z.string().max(500).optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  type: z.enum(["builder", "linter", "reviewer", "automation"]).optional(),
  status: z.enum(["active", "paused", "draft"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  trigger: z.string().max(500).optional(),
});

// ── Corrections Validations ───────────────────────────

export const createCorrectionSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().min(1, "Description is required").max(5000),
  wrongApproach: z.string().max(5000).optional(),
  correctApproach: z.string().max(5000).optional(),
  codeExample: z.string().max(10000).optional(),
  severity: z.enum(["critical", "important", "minor"]),
  category: z.enum(["layout", "component-choice", "spacing", "scrolling", "responsive", "accessibility", "performance", "styling", "pattern", "other"]),
});

export const updateCorrectionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  wrongApproach: z.string().max(5000).optional(),
  correctApproach: z.string().max(5000).optional(),
  codeExample: z.string().max(10000).optional(),
  severity: z.enum(["critical", "important", "minor"]).optional(),
  category: z.enum(["layout", "component-choice", "spacing", "scrolling", "responsive", "accessibility", "performance", "styling", "pattern", "other"]).optional(),
  isActive: z.boolean().optional(),
});

// ── Patterns Validations ──────────────────────────────

export const createPatternSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  archetype: z.enum(["list", "detail", "dashboard", "form", "editor", "split"]),
  sourceProject: z.string().min(1, "Source project is required").max(200),
  sourceFile: z.string().max(500).optional(),
  layoutTree: z.string().min(1, "Layout tree is required").max(20000),
  codeExample: z.string().max(20000).optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
});
