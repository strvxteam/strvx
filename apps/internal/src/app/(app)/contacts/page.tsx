import Link from "next/link";
import { getContacts } from "@/lib/queries";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await getContacts();
  return (
    <div>
      <h1 className="mb-5 text-[22px] font-bold">Contacts</h1>
      <div className="overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
        <table className="w-full text-[13px]">
          <thead className="bg-[#fafafa]">
            <tr>
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-[#888]">
                Name
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-[#888]">
                Email
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-[#888]">
                Company
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-[#888]">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-[#f0f0f0] hover:bg-[#fafafa]">
                <td className="px-4 py-2.5">
                  <Link href={`/contacts/${c.id}`} className="text-[#1a73e8] hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-[#555]">{c.email}</td>
                <td className="px-4 py-2.5 text-[#555]">{c.companyName}</td>
                <td className="px-4 py-2.5 text-[#555]">{c.role ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
