import type { Metadata } from "next";
import {
  getAllPartnerInvoices,
  getPartnerInvoiceSummary,
  getPartnerOptions,
} from "@/lib/partner-queries";
import { getPipelineEngagements } from "@/lib/queries";
import { PartnerInvoicesTable } from "./partner-invoices-table";

export const metadata: Metadata = { title: "Partner Invoices" };
export const dynamic = "force-dynamic";

export default async function PartnerInvoicesPage() {
  const [invoices, summary, partnerOptions, engagements] = await Promise.all([
    getAllPartnerInvoices(),
    getPartnerInvoiceSummary(),
    getPartnerOptions(),
    getPipelineEngagements(),
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 shrink-0">
        <h1 className="text-xl font-semibold">Partner Invoices</h1>
      </div>
      <PartnerInvoicesTable
        initialInvoices={invoices}
        summary={summary}
        partnerOptions={partnerOptions}
        engagements={engagements}
      />
    </div>
  );
}
