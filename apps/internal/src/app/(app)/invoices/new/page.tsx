import type { Metadata } from "next";
import { getCompaniesWithContacts, getNextInvoiceNumber, getPipelineEngagements } from "@/lib/queries";
import { InvoiceBuilderClient } from "./invoice-builder-client";

export const metadata: Metadata = { title: "New Invoice" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const [companies, invoiceNumber, engagements] = await Promise.all([
    getCompaniesWithContacts(),
    getNextInvoiceNumber(),
    getPipelineEngagements(),
  ]);

  // Map engagements to the shape the builder needs
  const engagementOptions = engagements.map((e) => ({
    id: e.id,
    name: e.name,
    companyId: e.companyId,
    companyName: e.companyName,
  }));

  return (
    <InvoiceBuilderClient
      companies={companies}
      invoiceNumber={invoiceNumber}
      engagements={engagementOptions}
    />
  );
}
