import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getInvoice, getCompaniesWithContacts } from "@/lib/queries";
import { InvoiceBuilderClient } from "../../new/invoice-builder-client";

export const metadata: Metadata = { title: "Edit Invoice" };
export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  if (!invoice) notFound();
  if (invoice.status !== "draft") redirect(`/invoices/${id}`);

  const companies = await getCompaniesWithContacts();
  const matchedCompany = companies.find((c) => c.name === invoice.clientName);

  const lineItems = Array.isArray(invoice.lineItems)
    ? (invoice.lineItems as { description: string; quantity: number; rate: number }[])
    : [];

  return (
    <InvoiceBuilderClient
      companies={companies}
      invoiceNumber={invoice.invoiceNumber}
      existingInvoice={{
        id: invoice.id,
        clientCompanyId: matchedCompany?.id || "",
        clientEmail: invoice.clientEmail || "",
        issuedDate: invoice.issuedDate || "",
        dueDate: invoice.dueDate || "",
        notes: invoice.notes || "",
        lineItems,
      }}
    />
  );
}
