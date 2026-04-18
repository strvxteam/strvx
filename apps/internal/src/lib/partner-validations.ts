import { z } from "zod";

export const createPartnerSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  company: z.string().max(200).optional().or(z.literal("")),
  website: z.string().max(500).optional().or(z.literal("")),
  linkedinUrl: z.string().max(500).optional().or(z.literal("")),
  stage: z.enum(["prospective", "onboarding", "active", "on_hold", "churned"]).optional(),
  tags: z.array(z.string()).optional(),
  commissionRate: z.string().regex(/^\d*\.?\d*$/, "Invalid rate").optional().or(z.literal("")),
  hourlyRate: z.string().regex(/^\d*\.?\d*$/, "Invalid rate").optional().or(z.literal("")),
  flatRate: z.string().regex(/^\d*\.?\d*$/, "Invalid rate").optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

export const updatePartnerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().max(30).optional().or(z.literal("")).nullable(),
  company: z.string().max(200).optional().or(z.literal("")).nullable(),
  website: z.string().max(500).optional().or(z.literal("")).nullable(),
  linkedinUrl: z.string().max(500).optional().or(z.literal("")).nullable(),
  tags: z.array(z.string()).optional(),
  commissionRate: z.string().regex(/^\d*\.?\d*$/).optional().or(z.literal("")).nullable(),
  hourlyRate: z.string().regex(/^\d*\.?\d*$/).optional().or(z.literal("")).nullable(),
  flatRate: z.string().regex(/^\d*\.?\d*$/).optional().or(z.literal("")).nullable(),
  notes: z.string().max(5000).optional().or(z.literal("")).nullable(),
});

export const changePartnerStageSchema = z.object({
  partnerId: z.string().uuid("Invalid partner ID"),
  newStage: z.enum(["prospective", "onboarding", "active", "on_hold", "churned"]),
});

export const createPartnerContactSchema = z.object({
  partnerId: z.string().uuid("Invalid partner ID"),
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  role: z.string().max(200).optional().or(z.literal("")),
  linkedinUrl: z.string().max(500).optional().or(z.literal("")),
});

export const createPartnerLinkSchema = z.object({
  partnerId: z.string().uuid("Invalid partner ID"),
  engagementId: z.string().uuid().optional().or(z.literal("")),
  projectId: z.string().uuid().optional().or(z.literal("")),
  role: z.enum(["referrer", "subcontractor", "co_builder", "consultant", "vendor"]),
  terms: z.string().max(5000).optional().or(z.literal("")),
});

export const createPartnerInteractionSchema = z.object({
  partnerId: z.string().uuid("Invalid partner ID"),
  type: z.enum(["note", "meeting", "call", "email"]),
  content: z.string().min(1, "Content is required").max(10000),
});
