import "server-only";
import { unstable_cache } from "next/cache";
import {
  getEngagement,
  getProject,
  getContact,
  getContactsByCompany,
  getProjectsByEngagement,
  getInvoicesByEngagement,
} from "./queries";
import type { RightRailData } from "@/components/shell/right-rail";

type EntityKind = "engagement" | "project" | "contact";

export type ShellData = {
  title: string;
  subtitle?: string;
  rightRail: RightRailData;
};

export async function loadShellData(kind: EntityKind, id: string): Promise<ShellData | null> {
  if (kind === "engagement") return loadEngagementShellCached(id);
  if (kind === "project") return loadProjectShellCached(id);
  if (kind === "contact") return loadContactShellCached(id);
  return null;
}

const loadEngagementShellCached = unstable_cache(
  async (id: string): Promise<ShellData | null> => {
    const eng = await getEngagement(id);
    if (!eng) return null;
    const [contacts, projects, invoices] = await Promise.all([
      getContactsByCompany(eng.companyId),
      getProjectsByEngagement(id),
      getInvoicesByEngagement(id),
    ]);
    const openInvoices = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
    const primary = eng.contactId ? contacts.find((c) => c.id === eng.contactId) : undefined;
    return {
      title: eng.companyName,
      subtitle: [
        eng.stage,
        eng.dealValue ? `$${Number(eng.dealValue).toLocaleString()}` : null,
        eng.probability ? `${eng.probability}%` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      rightRail: {
        company: { id: eng.companyId, name: eng.companyName },
        primaryContact: primary ? { id: primary.id, name: primary.name } : undefined,
        otherContacts: contacts
          .filter((c) => c.id !== primary?.id)
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: c.name })),
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        openInvoices: openInvoices.map((i) => ({
          id: i.id,
          number: i.invoiceNumber,
          amount: Number(i.amount),
        })),
      },
    };
  },
  ["shell-engagement"],
  { revalidate: 30 }
);

const loadProjectShellCached = unstable_cache(
  async (id: string): Promise<ShellData | null> => {
    const project = await getProject(id);
    if (!project) return null;
    const engagement = project.engagementId ? await getEngagement(project.engagementId) : null;
    return {
      title: project.name,
      subtitle: [project.client, project.status].filter(Boolean).join(" · "),
      rightRail: {
        company: engagement
          ? { id: engagement.companyId, name: engagement.companyName }
          : { id: "", name: project.client ?? "" },
        primaryContact: undefined,
        otherContacts: [],
        projects: [],
        openInvoices: [],
      },
    };
  },
  ["shell-project"],
  { revalidate: 30 }
);

const loadContactShellCached = unstable_cache(
  async (id: string): Promise<ShellData | null> => {
    const contact = await getContact(id);
    if (!contact) return null;
    const companyContacts = await getContactsByCompany(contact.companyId);
    return {
      title: contact.name,
      subtitle: [contact.role, contact.email].filter(Boolean).join(" · "),
      rightRail: {
        company: { id: contact.companyId, name: contact.companyName },
        primaryContact: undefined,
        otherContacts: companyContacts
          .filter((c) => c.id !== id)
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: c.name })),
        projects: [],
        openInvoices: [],
      },
    };
  },
  ["shell-contact"],
  { revalidate: 30 }
);
