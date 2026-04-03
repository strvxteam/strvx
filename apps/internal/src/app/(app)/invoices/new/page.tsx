import type { Metadata } from "next";
import { getCompaniesWithContacts, getNextInvoiceNumber } from "@/lib/queries";
import { InvoiceBuilderClient } from "./invoice-builder-client";

export const metadata: Metadata = { title: "New Invoice" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const [companies, invoiceNumber] = await Promise.all([
    getCompaniesWithContacts(),
    getNextInvoiceNumber(),
  ]);

  return (
    <InvoiceBuilderClient
      companies={companies}
      invoiceNumber={invoiceNumber}
    />
  );
}
