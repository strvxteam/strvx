import Link from "next/link";
import { getInvoicesByEngagement } from "@/lib/queries";

export default async function InvoicesTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoices = await getInvoicesByEngagement(id);
  if (invoices.length === 0) {
    return <p className="text-[13px] text-[#888]">No invoices yet.</p>;
  }
  return (
    <div className="divide-y divide-[#f0f0f0] rounded-md border border-[#e0e0e0] bg-white">
      {invoices.map((inv) => (
        <Link
          key={inv.id}
          href={`/invoices?invoiceId=${inv.id}`}
          className="flex items-center justify-between px-4 py-3 text-[13px] hover:bg-[#fafafa]"
        >
          <div>
            <p className="text-[#222]">{inv.invoiceNumber}</p>
            <p className="text-[11px] text-[#888]">
              {inv.status}
              {inv.dueDate ? ` · due ${inv.dueDate}` : ""}
            </p>
          </div>
          <span className="text-[13px] font-medium text-[#222]">
            ${Number(inv.amount).toLocaleString()}
          </span>
        </Link>
      ))}
    </div>
  );
}
