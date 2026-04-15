import { db } from "./db";
import {
  partners,
  partnerContacts,
  partnerLinks,
  partnerInteractions,
  partnerInvoices,
  partnerStageHistory,
  engagements,
  companies,
  projects,
  users,
} from "./db/schema";
import { eq, desc, isNull, sql, and, count } from "drizzle-orm";

// ── Single partner ────────────────────────────────────

export async function getPartner(id: string) {
  const [result] = await db
    .select({
      id: partners.id,
      name: partners.name,
      email: partners.email,
      phone: partners.phone,
      company: partners.company,
      website: partners.website,
      linkedinUrl: partners.linkedinUrl,
      stage: partners.stage,
      stageEnteredAt: partners.stageEnteredAt,
      tags: partners.tags,
      commissionRate: partners.commissionRate,
      hourlyRate: partners.hourlyRate,
      flatRate: partners.flatRate,
      notes: partners.notes,
      createdAt: partners.createdAt,
    })
    .from(partners)
    .where(and(eq(partners.id, id), isNull(partners.archivedAt)));

  return result ?? null;
}

// ── All partners (directory) ──────────────────────────

export async function getAllPartners() {
  return db
    .select({
      id: partners.id,
      name: partners.name,
      email: partners.email,
      company: partners.company,
      stage: partners.stage,
      tags: partners.tags,
      commissionRate: partners.commissionRate,
      hourlyRate: partners.hourlyRate,
      createdAt: partners.createdAt,
      linkedEngagementCount: sql<number>`(
        SELECT COUNT(*) FROM partner_links pl
        WHERE pl.partner_id = ${partners.id} AND pl.engagement_id IS NOT NULL
      )`,
      linkedProjectCount: sql<number>`(
        SELECT COUNT(*) FROM partner_links pl
        WHERE pl.partner_id = ${partners.id} AND pl.project_id IS NOT NULL
      )`,
      outstandingBalance: sql<number>`(
        SELECT COALESCE(SUM(
          CASE WHEN pi.direction = 'payable' THEN -CAST(pi.amount AS NUMERIC)
               ELSE CAST(pi.amount AS NUMERIC) END
        ), 0)
        FROM partner_invoices pi
        WHERE pi.partner_id = ${partners.id}
          AND pi.status IN ('sent', 'overdue')
      )`,
    })
    .from(partners)
    .where(isNull(partners.archivedAt))
    .orderBy(partners.name);
}

// ── Pipeline (grouped by stage) ───────────────────────

export async function getPartnerPipeline() {
  return db
    .select({
      id: partners.id,
      name: partners.name,
      company: partners.company,
      stage: partners.stage,
      stageEnteredAt: partners.stageEnteredAt,
      tags: partners.tags,
      commissionRate: partners.commissionRate,
      hourlyRate: partners.hourlyRate,
      linkedEngagementCount: sql<number>`(
        SELECT COUNT(*) FROM partner_links pl
        WHERE pl.partner_id = ${partners.id} AND pl.engagement_id IS NOT NULL
      )`,
      linkedProjectCount: sql<number>`(
        SELECT COUNT(*) FROM partner_links pl
        WHERE pl.partner_id = ${partners.id} AND pl.project_id IS NOT NULL
      )`,
      outstandingPayable: sql<number>`(
        SELECT COALESCE(SUM(CAST(pi.amount AS NUMERIC)), 0)
        FROM partner_invoices pi
        WHERE pi.partner_id = ${partners.id}
          AND pi.direction = 'payable'
          AND pi.status IN ('sent', 'overdue')
      )`,
      outstandingReceivable: sql<number>`(
        SELECT COALESCE(SUM(CAST(pi.amount AS NUMERIC)), 0)
        FROM partner_invoices pi
        WHERE pi.partner_id = ${partners.id}
          AND pi.direction = 'receivable'
          AND pi.status IN ('sent', 'overdue')
      )`,
    })
    .from(partners)
    .where(isNull(partners.archivedAt))
    .orderBy(partners.stageEnteredAt);
}

// ── Partner contacts ──────────────────────────────────

export async function getPartnerContacts(partnerId: string) {
  return db
    .select()
    .from(partnerContacts)
    .where(eq(partnerContacts.partnerId, partnerId))
    .orderBy(partnerContacts.name);
}

// ── Partner links (engagements + projects) ────────────

export async function getPartnerLinkedEngagements(partnerId: string) {
  return db
    .select({
      linkId: partnerLinks.id,
      role: partnerLinks.role,
      terms: partnerLinks.terms,
      engagementId: engagements.id,
      engagementName: engagements.name,
      engagementStage: engagements.stage,
      companyName: companies.name,
      createdAt: partnerLinks.createdAt,
    })
    .from(partnerLinks)
    .innerJoin(engagements, eq(partnerLinks.engagementId, engagements.id))
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .where(
      and(
        eq(partnerLinks.partnerId, partnerId),
        sql`${partnerLinks.engagementId} IS NOT NULL`
      )
    )
    .orderBy(desc(partnerLinks.createdAt));
}

export async function getPartnerLinkedProjects(partnerId: string) {
  return db
    .select({
      linkId: partnerLinks.id,
      role: partnerLinks.role,
      projectId: projects.id,
      projectName: projects.name,
      projectStatus: projects.status,
      createdAt: partnerLinks.createdAt,
    })
    .from(partnerLinks)
    .innerJoin(projects, eq(partnerLinks.projectId, projects.id))
    .where(
      and(
        eq(partnerLinks.partnerId, partnerId),
        sql`${partnerLinks.projectId} IS NOT NULL`
      )
    )
    .orderBy(desc(partnerLinks.createdAt));
}

// ── Partners linked to an engagement (for CRM integration) ──

export async function getPartnersForEngagement(engagementId: string) {
  return db
    .select({
      linkId: partnerLinks.id,
      role: partnerLinks.role,
      terms: partnerLinks.terms,
      partnerId: partners.id,
      partnerName: partners.name,
      partnerCompany: partners.company,
      commissionRate: partners.commissionRate,
    })
    .from(partnerLinks)
    .innerJoin(partners, eq(partnerLinks.partnerId, partners.id))
    .where(eq(partnerLinks.engagementId, engagementId));
}

// ── Partners linked to a project ─────────────────────

export async function getPartnersForProject(projectId: string) {
  return db
    .select({
      linkId: partnerLinks.id,
      role: partnerLinks.role,
      terms: partnerLinks.terms,
      partnerId: partners.id,
      partnerName: partners.name,
      partnerCompany: partners.company,
      commissionRate: partners.commissionRate,
    })
    .from(partnerLinks)
    .innerJoin(partners, eq(partnerLinks.partnerId, partners.id))
    .where(eq(partnerLinks.projectId, projectId));
}

// ── Partner timeline ──────────────────────────────────

export async function getPartnerTimeline(partnerId: string) {
  return db
    .select({
      id: partnerInteractions.id,
      type: partnerInteractions.type,
      content: partnerInteractions.content,
      createdAt: partnerInteractions.createdAt,
      authorName: users.name,
    })
    .from(partnerInteractions)
    .innerJoin(users, eq(partnerInteractions.userId, users.id))
    .where(eq(partnerInteractions.partnerId, partnerId))
    .orderBy(desc(partnerInteractions.createdAt));
}

// ── Partner invoices ──────────────────────────────────

export async function getPartnerInvoicesForPartner(partnerId: string) {
  return db
    .select()
    .from(partnerInvoices)
    .where(eq(partnerInvoices.partnerId, partnerId))
    .orderBy(desc(partnerInvoices.createdAt));
}

export async function getAllPartnerInvoices() {
  return db
    .select({
      id: partnerInvoices.id,
      direction: partnerInvoices.direction,
      amount: partnerInvoices.amount,
      currency: partnerInvoices.currency,
      description: partnerInvoices.description,
      status: partnerInvoices.status,
      issuedAt: partnerInvoices.issuedAt,
      dueAt: partnerInvoices.dueAt,
      paidAt: partnerInvoices.paidAt,
      createdAt: partnerInvoices.createdAt,
      partnerId: partners.id,
      partnerName: partners.name,
      engagementId: partnerInvoices.engagementId,
      engagementName: engagements.name,
    })
    .from(partnerInvoices)
    .innerJoin(partners, eq(partnerInvoices.partnerId, partners.id))
    .leftJoin(engagements, eq(partnerInvoices.engagementId, engagements.id))
    .orderBy(desc(partnerInvoices.createdAt));
}

export async function getPartnerInvoiceSummary() {
  const [result] = await db
    .select({
      totalPayable: sql<number>`COALESCE(SUM(
        CASE WHEN direction = 'payable' AND status IN ('sent', 'overdue')
        THEN CAST(amount AS NUMERIC) ELSE 0 END
      ), 0)`,
      totalReceivable: sql<number>`COALESCE(SUM(
        CASE WHEN direction = 'receivable' AND status IN ('sent', 'overdue')
        THEN CAST(amount AS NUMERIC) ELSE 0 END
      ), 0)`,
      paidThisMonth: sql<number>`COALESCE(SUM(
        CASE WHEN status = 'paid'
          AND paid_at >= date_trunc('month', CURRENT_DATE)
        THEN CAST(amount AS NUMERIC) ELSE 0 END
      ), 0)`,
    })
    .from(partnerInvoices);

  return result;
}

// ── Partner financial summary (for detail view) ───────

export async function getPartnerFinancialSummary(partnerId: string) {
  const [result] = await db
    .select({
      paidYtd: sql<number>`COALESCE(SUM(
        CASE WHEN direction = 'payable' AND status = 'paid'
          AND paid_at >= date_trunc('year', CURRENT_DATE)
        THEN CAST(amount AS NUMERIC) ELSE 0 END
      ), 0)`,
      outstanding: sql<number>`COALESCE(SUM(
        CASE WHEN status IN ('sent', 'overdue')
        THEN CAST(amount AS NUMERIC) ELSE 0 END
      ), 0)`,
      commissionEarned: sql<number>`COALESCE(SUM(
        CASE WHEN direction = 'receivable' AND status = 'paid'
        THEN CAST(amount AS NUMERIC) ELSE 0 END
      ), 0)`,
    })
    .from(partnerInvoices)
    .where(eq(partnerInvoices.partnerId, partnerId));

  return result;
}

// ── Partner stage history ─────────────────────────────

export async function getPartnerStageHistory(partnerId: string) {
  return db
    .select()
    .from(partnerStageHistory)
    .where(eq(partnerStageHistory.partnerId, partnerId))
    .orderBy(desc(partnerStageHistory.enteredAt));
}

// ── Dashboard alerts ──────────────────────────────────

export async function getPartnerAlerts() {
  const overdueInvoices = await db
    .select({ count: count() })
    .from(partnerInvoices)
    .where(
      and(
        eq(partnerInvoices.status, "overdue"),
        eq(partnerInvoices.direction, "payable")
      )
    );

  const staleOnboarding = await db
    .select({ count: count() })
    .from(partners)
    .where(
      and(
        eq(partners.stage, "onboarding"),
        isNull(partners.archivedAt),
        sql`${partners.stageEnteredAt} < NOW() - INTERVAL '14 days'`
      )
    );

  return {
    overduePartnerInvoices: overdueInvoices[0]?.count ?? 0,
    staleOnboarding: staleOnboarding[0]?.count ?? 0,
  };
}

// ── All partners for select dropdowns ─────────────────

export async function getPartnerOptions() {
  return db
    .select({
      id: partners.id,
      name: partners.name,
      company: partners.company,
    })
    .from(partners)
    .where(isNull(partners.archivedAt))
    .orderBy(partners.name);
}
