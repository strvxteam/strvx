export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { portalTokens, companies, engagements, projects, invoices } from "@/lib/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import Link from "next/link";

async function getPortalCompany() {
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_token")?.value;
  if (!token) return null;

  const [portalToken] = await db
    .select({ companyId: portalTokens.companyId, contactEmail: portalTokens.contactEmail, expiresAt: portalTokens.expiresAt })
    .from(portalTokens)
    .where(eq(portalTokens.token, token));

  if (!portalToken) return null;
  if (portalToken.expiresAt && new Date(portalToken.expiresAt) < new Date()) return null;

  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, portalToken.companyId));

  return company ? { ...company, contactEmail: portalToken.contactEmail } : null;
}

export default async function PortalHomePage() {
  const company = await getPortalCompany();
  if (!company) redirect("/portal/login");

  // Fetch client's data
  const [companyEngagements, companyProjects, companyInvoices] = await Promise.all([
    db.select({ id: engagements.id, name: engagements.name, stage: engagements.stage })
      .from(engagements)
      .where(and(eq(engagements.companyId, company.id), isNull(engagements.archivedAt))),
    db.select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.client, company.name)),
    db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amount: invoices.amount,
      status: invoices.status,
      dueDate: invoices.dueDate,
      stripePaymentUrl: invoices.stripePaymentUrl,
    })
      .from(invoices)
      .where(eq(invoices.clientName, company.name)),
  ]);

  const STAGE_LABELS: Record<string, string> = {
    lead: "Getting Started", contacted: "In Touch", discovery: "Discovery",
    building_mvp: "Building MVP", proposal: "Proposal", negotiation: "Negotiation",
    build: "Building", deliver: "Delivering", maintain: "Maintenance",
    closed_won: "Completed", closed_lost: "Closed",
  };

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    draft: { label: "Draft", color: "bg-[#f0f0f0] text-[#666]" },
    sent: { label: "Sent", color: "bg-[#e8f0fe] text-[#1a73e8]" },
    paid: { label: "Paid", color: "bg-[#e6f9e6] text-[#27ae60]" },
    overdue: { label: "Overdue", color: "bg-[#fde8e8] text-[#c0392b]" },
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-[#111]">Welcome, {company.name}</h1>
      <p className="mb-8 text-[13px] text-[#888]">View your project status and invoices below.</p>

      {/* Projects */}
      <section className="mb-8">
        <h2 className="mb-3 text-[14px] font-semibold text-[#333]">Projects</h2>
        {companyProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e0e0e0] bg-white py-6 text-center text-[13px] text-[#aaa]">
            No projects yet
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {companyProjects.map((p) => (
              <Link key={p.id} href={`/portal/projects/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-[#e0e0e0] bg-white px-4 py-3 transition-colors hover:bg-[#fafafa]">
                <span className="text-[14px] font-medium text-[#222]">{p.name}</span>
                <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[11px] font-medium capitalize text-[#555]">
                  {p.status.replace("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Engagements */}
      {companyEngagements.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[14px] font-semibold text-[#333]">Engagements</h2>
          <div className="flex flex-col gap-2">
            {companyEngagements.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-[#e0e0e0] bg-white px-4 py-3">
                <span className="text-[14px] font-medium text-[#222]">{e.name}</span>
                <span className="text-[12px] text-[#888]">{STAGE_LABELS[e.stage] ?? e.stage}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invoices */}
      <section>
        <h2 className="mb-3 text-[14px] font-semibold text-[#333]">Invoices</h2>
        {companyInvoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e0e0e0] bg-white py-6 text-center text-[13px] text-[#aaa]">
            No invoices yet
          </div>
        ) : (
          <div className="rounded-lg border border-[#e0e0e0] bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e0e0e0]">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Invoice</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">Amount</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Due</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">Status</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]"></th>
                </tr>
              </thead>
              <tbody>
                {companyInvoices.map((inv) => {
                  const status = STATUS_LABELS[inv.status] ?? { label: inv.status, color: "bg-[#f0f0f0] text-[#666]" };
                  return (
                    <tr key={inv.id} className="border-b border-[#f0f0f0] last:border-0">
                      <td className="px-4 py-3 text-[13px] font-medium text-[#222]">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-medium text-[#222]">${Number(inv.amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-[13px] text-[#555]">{inv.dueDate ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.color}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inv.stripePaymentUrl && inv.status !== "paid" && (
                          <a href={inv.stripePaymentUrl} target="_blank" rel="noopener noreferrer"
                            className="rounded-lg bg-[#111] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#333]">
                            Pay Now
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
