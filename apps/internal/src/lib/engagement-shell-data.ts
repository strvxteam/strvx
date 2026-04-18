import "server-only";
import { unstable_cache } from "next/cache";
import {
  getEngagement,
  getContactsByCompany,
  getProjectsByEngagement,
  getInvoicesByEngagement,
} from "./queries";
import type { RightRailData } from "@/components/shell/right-rail";

export async function loadEngagementShell(engagementId: string) {
  return cachedLoader(engagementId);
}

const cachedLoader = unstable_cache(
  async (engagementId: string) => {
    const engagement = await getEngagement(engagementId);
    if (!engagement) return null;

    const [contacts, projects, invoices] = await Promise.all([
      getContactsByCompany(engagement.companyId),
      getProjectsByEngagement(engagementId),
      getInvoicesByEngagement(engagementId),
    ]);

    const openInvoices = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
    const primary = engagement.contactId
      ? contacts.find((c) => c.id === engagement.contactId)
      : undefined;
    const other = contacts.filter((c) => c.id !== primary?.id).slice(0, 5);

    const subtitle = [
      engagement.stage,
      engagement.dealValue ? `$${Number(engagement.dealValue).toLocaleString()}` : null,
      engagement.probability ? `${engagement.probability}%` : null,
    ].filter(Boolean).join(" · ");

    const rightRail: RightRailData = {
      company: { id: engagement.companyId, name: engagement.companyName },
      primaryContact: primary ? { id: primary.id, name: primary.name } : undefined,
      otherContacts: other.map((c) => ({ id: c.id, name: c.name })),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      openInvoices: openInvoices.map((i) => ({
        id: i.id,
        number: i.invoiceNumber,
        amount: Number(i.amount),
      })),
    };

    return {
      engagement,
      title: engagement.companyName,
      subtitle,
      rightRail,
    };
  },
  ["engagement-shell-data"],
  { revalidate: 30 }
);
