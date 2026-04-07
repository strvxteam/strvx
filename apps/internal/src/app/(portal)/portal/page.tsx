export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { engagements, projects, invoices } from "@/lib/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getPortalCompany } from "./portal-auth";
import { PortalNav } from "./portal-nav";

export default async function PortalOverviewPage() {
  const company = await getPortalCompany();
  if (!company) redirect("/portal/login");

  const [projectCount, engagementCount, invoiceStats] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.client, company.name)),
    db.select({ count: sql<number>`count(*)::int` }).from(engagements).where(and(eq(engagements.companyId, company.id), isNull(engagements.archivedAt))),
    db.execute(sql`
      SELECT
        count(*)::int as total,
        count(*) FILTER (WHERE status = 'sent' OR status = 'overdue')::int as outstanding,
        COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'sent' OR status = 'overdue'), 0) as outstanding_amount,
        COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'paid'), 0) as paid_amount
      FROM invoices WHERE client_name = ${company.name}
    `),
  ]);

  const stats = (invoiceStats as unknown as { total: number; outstanding: number; outstanding_amount: string; paid_amount: string }[])[0]
    ?? { total: 0, outstanding: 0, outstanding_amount: "0", paid_amount: "0" };

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-[#111]">Welcome, {company.name}</h1>
      <p className="mb-6 text-[13px] text-[#888]">View your project status and invoices below.</p>

      <PortalNav />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Projects card */}
        <Link href="/portal/projects" className="group rounded-xl border border-[#e0e0e0] bg-white p-6 transition-colors hover:border-[#ccc]">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Projects</p>
          <p className="text-3xl font-bold text-[#111]">{projectCount[0]?.count ?? 0}</p>
          <p className="mt-2 text-[12px] text-[#888] group-hover:text-[#555]">View all projects &rarr;</p>
        </Link>

        {/* Engagements card */}
        <div className="rounded-xl border border-[#e0e0e0] bg-white p-6">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Engagements</p>
          <p className="text-3xl font-bold text-[#111]">{engagementCount[0]?.count ?? 0}</p>
          <p className="mt-2 text-[12px] text-[#888]">Active engagements</p>
        </div>

        {/* Invoices card */}
        <Link href="/portal/invoices" className="group rounded-xl border border-[#e0e0e0] bg-white p-6 transition-colors hover:border-[#ccc]">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Outstanding</p>
          <p className="text-3xl font-bold text-[#e67e22]">
            {Number(stats.outstanding) > 0 ? `$${Number(stats.outstanding_amount).toLocaleString()}` : "$0"}
          </p>
          <p className="mt-2 text-[12px] text-[#888] group-hover:text-[#555]">
            {Number(stats.outstanding)} invoice{Number(stats.outstanding) !== 1 ? "s" : ""} pending &rarr;
          </p>
        </Link>
      </div>

      {/* Quick stats */}
      <div className="mt-6 rounded-xl border border-[#e0e0e0] bg-white p-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">Total Paid</p>
        <p className="text-2xl font-bold text-[#27ae60]">${Number(stats.paid_amount).toLocaleString()}</p>
      </div>
    </div>
  );
}
