import Link from "next/link";

export type RightRailData = {
  company: { id: string; name: string };
  primaryContact?: { id: string; name: string };
  otherContacts: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  openInvoices: { id: string; number: string; amount: number }[];
};

export function RightRail({ data }: { data: RightRailData }) {
  return (
    <aside className="w-[280px] shrink-0 border-l border-[#eee] pl-5 text-[13px]">
      <Section title="Company">
        <Link href={`/clients?companyId=${data.company.id}`} className="block py-1 hover:text-[#111]">
          {data.company.name}
        </Link>
      </Section>
      {data.primaryContact && (
        <Section title="Primary contact">
          <Link href={`/contacts/${data.primaryContact.id}`} className="block py-1 hover:text-[#111]">
            {data.primaryContact.name}
          </Link>
        </Section>
      )}
      {data.otherContacts.length > 0 && (
        <Section title="Other contacts">
          {data.otherContacts.map((c) => (
            <Link key={c.id} href={`/contacts/${c.id}`} className="block py-1 hover:text-[#111]">{c.name}</Link>
          ))}
        </Section>
      )}
      {data.projects.length > 0 && (
        <Section title="Projects">
          {data.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block py-1 hover:text-[#111]">{p.name}</Link>
          ))}
        </Section>
      )}
      {data.openInvoices.length > 0 && (
        <Section title="Open invoices">
          {data.openInvoices.map((inv) => (
            <Link key={inv.id} href={`/invoices?invoiceId=${inv.id}`} className="flex justify-between py-1 hover:text-[#111]">
              <span>{inv.number}</span>
              <span className="text-[#888]">${inv.amount.toLocaleString()}</span>
            </Link>
          ))}
        </Section>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[#888]">{title}</div>
      <div className="text-[13px] text-[#333]">{children}</div>
    </div>
  );
}
