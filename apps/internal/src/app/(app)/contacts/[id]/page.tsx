import { notFound } from "next/navigation";
import { getContact } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contact Overview" };

export default async function ContactOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) return notFound();
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Name" value={contact.name} />
      <Field label="Email" value={contact.email ?? "—"} />
      <Field label="Phone" value={contact.phone ?? "—"} />
      <Field label="Role" value={contact.role ?? "—"} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[#888]">{label}</div>
      <div className="text-[13px] text-[#222]">{value}</div>
    </div>
  );
}
